'use strict';
const { digest, fail, transaction, idempotent, audit } = require('./transactions');
const currencyValid = value => ['USD', 'NGN'].includes(value);
const earnedAccount = (id, currency) => `artist:${id}:earned:${currency}`;
const heldAccount = (id, currency) => `artist:${id}:held:${currency}`;
function withdrawalAmounts(gross) {
  if (!Number.isSafeInteger(gross) || gross < 1 || gross > 100000000) throw fail(400, 'Enter a valid amount in minor units (minimum 1 minor unit).');
  const fee = Math.round(gross * 3 / 100);
  return { gross_minor: gross, fee_minor: fee, net_minor: gross - fee };
}
async function balance(db, account) {
  const q = await db.query('SELECT COALESCE(SUM(CASE WHEN credit_account=$1 THEN amount_minor ELSE 0 END),0)-COALESCE(SUM(CASE WHEN debit_account=$1 THEN amount_minor ELSE 0 END),0) AS balance FROM finance_transfers WHERE debit_account=$1 OR credit_account=$1', [account]);
  const value = Number(q.rows[0].balance);
  if (!Number.isSafeInteger(value)) throw fail(503, 'Balance requires reconciliation.');
  return value;
}
async function transfer(db, reference, kind, currency, amount, debit, credit, artistId) {
  if (!currencyValid(currency) || !Number.isSafeInteger(amount) || amount < 1 || debit === credit) throw fail(400, 'Invalid ledger transfer.');
  const payloadHash = digest({ kind, currency, amount, debit, credit });
  const q = await db.query('INSERT INTO finance_journals(reference,kind,payload_hash) VALUES($1,$2,$3) ON CONFLICT(reference) DO NOTHING RETURNING id', [reference, kind, payloadHash]);
  if (!q.rowCount) {
    const old = await db.query('SELECT id,payload_hash FROM finance_journals WHERE reference=$1', [reference]);
    if (old.rows[0]?.payload_hash !== payloadHash) throw fail(409, 'Ledger reference conflicts with an existing transaction.');
    return old.rows[0].id;
  }
  for (const id of [debit, credit]) await db.query('INSERT INTO finance_accounts(id,currency,artist_id) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING', [id, currency, id.startsWith('artist:') ? artistId : null]);
  await db.query('INSERT INTO finance_transfers(journal_id,debit_account,credit_account,currency,amount_minor) VALUES($1,$2,$3,$4,$5)', [q.rows[0].id, debit, credit, currency, amount]);
  return q.rows[0].id;
}
async function requestWithdrawal(pool, artistId, key, currency, gross) {
  if (!currencyValid(currency)) throw fail(400, 'Unsupported currency.');
  const amounts = withdrawalAmounts(gross);
  return transaction(pool, async db => {
    await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE', [artistId]);
    return idempotent(db, 'withdraw:' + artistId, key, { currency, ...amounts }, async () => {
      if (await balance(db, earnedAccount(artistId, currency)) < gross) throw fail(409, 'Insufficient verified, reconciled funds. Historical earnings require reconciliation.');
      const q = await db.query('INSERT INTO finance_withdrawals(artist_id,currency,gross_minor,fee_minor,net_minor,request_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [artistId, currency, gross, amounts.fee_minor, amounts.net_minor, key]);
      const row = q.rows[0];
      await transfer(db, 'withdraw-reserve:' + row.id, 'withdrawal_reserve', currency, gross, earnedAccount(artistId, currency), heldAccount(artistId, currency), artistId);
      await audit(db, { type: 'artist', id: artistId }, 'withdrawal.request', String(row.id), { currency, ...amounts });
      return row;
    });
  });
}
async function reviewWithdrawal(pool, id, decision, key) {
  if (!['approved', 'rejected'].includes(decision)) throw fail(400, 'Choose approved or rejected. Payout requires a verified provider.');
  return transaction(pool, async db => idempotent(db, 'withdrawal-review', key, { id, decision }, async () => {
    const q = await db.query('SELECT * FROM finance_withdrawals WHERE id=$1 FOR UPDATE', [id]);
    const row = q.rows[0];
    if (!row) throw fail(404, 'Withdrawal not found.');
    if (row.status !== 'pending') throw fail(409, 'Withdrawal has already been reviewed.');
    if (decision === 'rejected') await transfer(db, 'withdraw-release:' + row.id, 'withdrawal_release', row.currency, Number(row.gross_minor), heldAccount(row.artist_id, row.currency), earnedAccount(row.artist_id, row.currency), row.artist_id);
    const updated = await db.query('UPDATE finance_withdrawals SET status=$2,reviewed_at=NOW() WHERE id=$1 RETURNING *', [id, decision]);
    await audit(db, { type: 'admin', id: 'session' }, 'withdrawal.' + decision, String(id), { funds_sent: false });
    return updated.rows[0];
  }));
}
// There is deliberately no client-callable "mark paid" or synthetic payment verifier.
module.exports = { withdrawalAmounts, balance, transfer, requestWithdrawal, reviewWithdrawal, earnedAccount, heldAccount };
