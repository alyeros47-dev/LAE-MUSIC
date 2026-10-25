'use strict';
// Behavioral SQL adapter, deliberately strict. It is NOT a PostgreSQL emulator.
class MockPool {
  constructor() { this.state = { requests: {}, journals: [], transfers: [], withdrawals: [], audit: [], wallets: { 7: 4 }, credits: [], records: [], migration: {} }; this.calls = []; this.tail = Promise.resolve(); }
  async connect() {
    let release; const previous = this.tail; this.tail = new Promise(resolve => { release = resolve; }); await previous;
    let snapshot;
    return { query: async (sql, args = []) => { if (sql === 'BEGIN') snapshot = structuredClone(this.state); if (sql === 'ROLLBACK') this.state = snapshot; return this.query(sql, args); }, release };
  }
  seedBalance(id, currency, amount) { this.state.transfers.push({ debit_account:'platform:verified:'+currency,credit_account:`artist:${id}:earned:${currency}`,amount_minor:amount,currency }); }
  async query(sql, args = []) {
    this.calls.push({ sql, args });
    const row = value => ({ rowCount: 1, rows: [value] }), none = () => ({ rowCount: 0, rows: [] });
    if (['BEGIN','COMMIT','ROLLBACK'].includes(sql) || sql.startsWith('SELECT pg_advisory') || sql.startsWith('CREATE TABLE IF NOT EXISTS platform_migrations')) return none();
    if (sql.startsWith('SELECT 1 FROM affiliate_subscription_commissions')) return none();
    if (sql.startsWith('SELECT id FROM creators')) return row({ id: args[0] });
    if (sql.startsWith('SELECT checksum FROM platform_migrations')) return this.state.migration[args[0]] ? row({ checksum: this.state.migration[args[0]] }) : none();
    if (sql.startsWith('-- Additive')) return none();
    if (sql.startsWith('INSERT INTO platform_migrations')) { this.state.migration[args[0]]=args[1];return none(); }
    const requestId = args[0] + ':' + args[1];
    if (sql.startsWith('SELECT payload_hash,result FROM platform_requests')) return this.state.requests[requestId] ? row(this.state.requests[requestId]) : none();
    if (sql.startsWith('INSERT INTO platform_requests')) { if(this.state.requests[requestId])throw Error('Duplicate request'); this.state.requests[requestId] = { payload_hash: args[2], result: JSON.parse(args[3]) }; return none(); }
    if (sql.startsWith('UPDATE platform_requests SET result=')) { this.state.requests[requestId].result = JSON.parse(args[2]); return none(); }
    if (sql.startsWith('INSERT INTO finance_accounts')) return none();
    if (sql.startsWith('INSERT INTO finance_journals')) { const old=this.state.journals.find(j=>j.reference===args[0]);if(old)return none(); const j={id:this.state.journals.length+1,reference:args[0],kind:args[1],payload_hash:args[2]};this.state.journals.push(j);return row(j); }
    if (sql.startsWith('SELECT id,payload_hash FROM finance_journals')) {const j=this.state.journals.find(j=>j.reference===args[0]);return j?row(j):none();}
    if (sql.startsWith('INSERT INTO finance_transfers')) { this.state.transfers.push({journal_id:args[0],debit_account:args[1],credit_account:args[2],currency:args[3],amount_minor:args[4]});return none(); }
    if (sql.startsWith('SELECT COALESCE(SUM(CASE WHEN credit_account')) return row({balance:this.state.transfers.reduce((sum,t)=>sum+(t.credit_account===args[0]?Number(t.amount_minor):0)-(t.debit_account===args[0]?Number(t.amount_minor):0),0)});
    if (sql.startsWith('INSERT INTO finance_withdrawals')) {const w={id:this.state.withdrawals.length+1,artist_id:args[0],currency:args[1],gross_minor:args[2],fee_minor:args[3],net_minor:args[4],request_key:args[5],status:'pending'};this.state.withdrawals.push(w);return row({...w});}
    if (sql.startsWith('SELECT * FROM finance_withdrawals')) {const w=this.state.withdrawals.find(w=>String(w.id)===String(args[0]));return w?row({...w}):none();}
    if (sql.startsWith('UPDATE finance_withdrawals')) {const w=this.state.withdrawals.find(w=>String(w.id)===String(args[0]));w.status=args[1];return row({...w});}
    if (sql.startsWith('INSERT INTO platform_audit')) {this.state.audit.push(args);return none();}
    if (sql.startsWith('UPDATE generation_wallets SET credits=credits-1')) {if(!(this.state.wallets[args[0]]>=1))return none();this.state.wallets[args[0]]--;return row({credits:this.state.wallets[args[0]]});}
    if (sql.startsWith('UPDATE generation_wallets SET credits=credits+1')) {this.state.wallets[args[0]]++;return none();}
    if (sql.startsWith('INSERT INTO generation_ledger')) {const entry={id:this.state.credits.length+1,creator_id:args[0],delta:sql.includes('VALUES($1,-1')?-1:1,reason:args[1],reference:args[2]};this.state.credits.push(entry);return row(entry);}
    if (sql.startsWith('UPDATE generation_ledger SET reason=')) {const entry=this.state.credits.find(c=>c.reference===args[0]&&c.creator_id===args[1]&&c.reason==='lyrics_generation_reserved');if(!entry)return none();entry.reason=sql.includes("reason='lyrics_generation_refunded'")?'lyrics_generation_refunded':'lyrics_generation';return row(entry);}
    if (sql.startsWith('INSERT INTO generation_records')) {this.state.records.push(args);return row({id:this.state.records.length});}
    throw Error('Unexpected SQL in behavioral mock: '+sql);
  }
}
module.exports={MockPool};
