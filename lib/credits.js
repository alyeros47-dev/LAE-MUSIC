'use strict';
const crypto = require('node:crypto');
const { transaction, digest, requestKey, fail } = require('./transactions');
async function reserveLyrics(pool, artistId, key, payload) {
  requestKey(key);
  return transaction(pool, async db => {
    await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE', [artistId]);
    const scope = 'lyrics:' + artistId, payloadHash = digest(payload);
    const old = await db.query('SELECT payload_hash,result FROM platform_requests WHERE scope=$1 AND request_key=$2', [scope, key]);
    if (old.rowCount) {
      if (old.rows[0].payload_hash !== payloadHash) throw fail(409, 'This lyrics request key was already used for different instructions.');
      if (old.rows[0].result.status === 'completed') return { replay: old.rows[0].result.output };
      throw fail(409, old.rows[0].result.status === 'failed' ? 'The previous lyrics request failed and its credit was restored. Start a new request.' : 'Your lyrics request is already processing. Do not submit it twice. Contact support if this persists.');
    }
    const debit = await db.query('UPDATE generation_wallets SET credits=credits-1,updated_at=NOW() WHERE creator_id=$1 AND credits>=1 RETURNING credits', [artistId]);
    if (!debit.rowCount) throw fail(402, 'Insufficient lyrics generation credits. Coin purchases are not enabled.');
    const reference = crypto.randomUUID();
    await db.query('INSERT INTO generation_ledger(creator_id,delta,reason,reference) VALUES($1,-1,$2,$3)', [artistId, 'lyrics_generation_reserved', reference]);
    await db.query('INSERT INTO platform_requests(scope,request_key,payload_hash,result) VALUES($1,$2,$3,$4)', [scope, key, payloadHash, JSON.stringify({ status: 'pending', reference })]);
    return { reference };
  });
}
async function refundLyrics(pool, artistId, reference, key) {
  return transaction(pool, async db => {
    const row = await db.query("UPDATE generation_ledger SET reason='lyrics_generation_refunded' WHERE reference=$1 AND creator_id=$2 AND reason='lyrics_generation_reserved' RETURNING creator_id", [reference, artistId]);
    if (!row.rowCount) return; // Concurrent refunds and retries cannot award another credit.
    await db.query('UPDATE generation_wallets SET credits=credits+1,updated_at=NOW() WHERE creator_id=$1', [artistId]);
    await db.query('INSERT INTO generation_ledger(creator_id,delta,reason,reference) VALUES($1,1,$2,$3) ON CONFLICT(reference) DO NOTHING', [artistId, 'lyrics_generation_refund', 'refund:' + reference]);
    await db.query('UPDATE platform_requests SET result=$3 WHERE scope=$1 AND request_key=$2', ['lyrics:' + artistId, key, JSON.stringify({ status: 'failed', reference })]);
  });
}
async function completeLyrics(pool, artistId, reference, key, output, model) {
  return transaction(pool, async db => {
    const code = crypto.randomBytes(18).toString('hex').toUpperCase();
    await db.query('INSERT INTO generation_records(creator_id,code_hash,model,title,lyrics,style) VALUES($1,$2,$3,$4,$5,$6)', [artistId, crypto.createHash('sha256').update(code).digest('hex'), model, output.title, output.lyrics, output.style]);
    if (reference) {
      const q = await db.query("UPDATE generation_ledger SET reason='lyrics_generation' WHERE reference=$1 AND creator_id=$2 AND reason='lyrics_generation_reserved' RETURNING id", [reference, artistId]);
      if (!q.rowCount) throw fail(409, 'Lyrics reservation is no longer active.');
      const full = { ...output, model, uploadCode: code };
      await db.query('UPDATE platform_requests SET result=$3 WHERE scope=$1 AND request_key=$2', ['lyrics:' + artistId, key, JSON.stringify({ status: 'completed', output: full })]);
      return full;
    }
    return { ...output, model, uploadCode: code };
  });
}
module.exports = { reserveLyrics, refundLyrics, completeLyrics };
