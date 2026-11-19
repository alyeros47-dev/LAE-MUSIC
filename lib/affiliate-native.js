'use strict';
const crypto=require('node:crypto'),{fail,digest}=require('./transactions'),finance=require('./finance'),money=require('./premium-policy');
const account=(id,state,mode,currency)=>'artist:'+id+':affiliate_'+state+':'+mode+':'+currency;
// USD source records remain the existing royalty-accounting reference. Only
// these new, uniquely linked currency lots can enter the affiliate cash wallet.
async function record(db,orderId,kind){
 if(require('../config/affiliate-payouts.json').future_native_commissions!==true)return;
 const premium=kind==='premium',rows=(await db.query(premium?`SELECT pc.beneficiary_id AS artist_id,'premium_direct' AS source_kind,o.id::text AS source_id,o.id AS order_id,r.mode,p.charge_currency AS currency,p.charge_minor AS gross_minor,pc.amount_minor AS usd_reference_minor,p.exchange_rate,p.quote_id,r.payment_id,r.provider,r.merchant_id,COALESCE(rp.policy_revision,o.affiliate_policy_revision) AS policy_revision,r.verified_at
 FROM premium_commissions pc JOIN premium_orders o ON o.id=pc.order_id JOIN premium_receipts r ON r.order_id=o.id JOIN premium_presentments p ON p.order_id=o.id JOIN premium_attempts a ON a.id=p.attempt_id LEFT JOIN affiliate_receipt_policies rp ON rp.premium_order_id=o.id
 WHERE o.id=$1 AND pc.level=1 AND COALESCE(rp.policy_revision,o.affiliate_policy_revision)=$2 AND r.verified_at>=(SELECT starts_at FROM affiliate_native_policy WHERE id=1) AND a.provider=r.provider AND a.merchant_id=r.merchant_id AND a.mode=r.mode AND p.base_minor=r.amount_minor
 UNION ALL
 SELECT t.team_leader_id,'premium_team',o.id::text,o.id,r.mode,p.charge_currency,p.charge_minor,t.reserved_minor,p.exchange_rate,p.quote_id,r.payment_id,r.provider,r.merchant_id,t.policy_revision,r.verified_at
 FROM premium_quarterly_team_sales t JOIN premium_orders o ON o.id=t.order_id JOIN premium_receipts r ON r.order_id=o.id JOIN premium_presentments p ON p.order_id=o.id JOIN premium_attempts a ON a.id=p.attempt_id
 WHERE o.id=$1 AND t.policy_revision=$2 AND r.verified_at>=(SELECT starts_at FROM affiliate_native_policy WHERE id=1) AND a.provider=r.provider AND a.merchant_id=r.merchant_id AND a.mode=r.mode AND p.base_minor=r.amount_minor`:`SELECT c.referrer_id AS artist_id,'artist_direct' AS source_kind,c.id::text AS source_id,o.id AS order_id,p.mode,p.charge_currency AS currency,p.charge_minor AS gross_minor,c.amount_cents AS usd_reference_minor,COALESCE(qfx.rates->>p.charge_currency,'1') AS exchange_rate,p.quote_id,r.payment_id,r.provider,r.merchant_id,s.policy_revision,r.verified_at
 FROM commerce_orders o JOIN commerce_receipts r ON r.order_id=o.id JOIN affiliate_subscription_commissions c ON c.subscription_id=o.subscription_id JOIN payment_presentments p ON p.order_id=o.id JOIN payment_checkout_quotes q ON q.id=p.quote_id LEFT JOIN currency_rate_snapshots qfx ON qfx.id=q.rate_snapshot_id JOIN affiliate_receipt_policies s ON s.artist_order_id=o.id
 WHERE o.id=$1 AND o.kind='artist_subscription' AND c.tier=1 AND c.status='pending' AND s.policy_revision=$2 AND r.verified_at>=(SELECT starts_at FROM affiliate_native_policy WHERE id=1) AND p.provider=r.provider AND p.merchant_id=r.merchant_id AND p.payment_id=r.payment_id AND p.base_minor=r.amount_minor`,[orderId,premium?require('./affiliate-framework').PREMIUM_REVISION:require('./affiliate-framework').ARTIST_REVISION])).rows;
 for(const r of rows){
  if(!['NGN','USD'].includes(r.currency)||!['live','test'].includes(r.mode))continue;
  const team=r.source_kind==='premium_team',gross=Number(r.gross_minor),amount=team?Math.ceil(gross/10):money.percentage(gross,20);if(!amount)continue;
  const id=crypto.randomUUID(),insert=await db.query(`INSERT INTO affiliate_native_earnings(id,artist_id,order_id,source_kind,source_id,mode,currency,gross_minor,amount_minor,usd_reference_minor,exchange_rate,quote_id,payment_id,provider,merchant_id,policy_revision,quarter,payable_minor)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT(source_kind,source_id,mode) DO NOTHING RETURNING id`,[id,r.artist_id,r.order_id,r.source_kind,r.source_id,r.mode,r.currency,gross,amount,Number(r.usd_reference_minor),String(r.exchange_rate),r.quote_id,r.payment_id,r.provider,r.merchant_id,r.policy_revision,team?require('./partner-policy').periodForSale(r.verified_at):null,team?null:amount]);
  if(insert.rowCount)await finance.transfer(db,'native-commission:'+id,'original_currency_commission',r.currency,amount,'platform:affiliate_native_expense:'+r.mode+':'+r.currency,account(r.artist_id,'pending',r.mode,r.currency),r.artist_id);
 }
}
async function eligible(db,n){
 const where=n.source_kind==='artist_direct'?`SELECT 1 FROM commerce_orders o JOIN artist_subscriptions s ON s.id=o.subscription_id WHERE o.id=$1 AND o.status='paid' AND s.status='paid' AND NOT s.payment_hold AND NOT EXISTS(SELECT 1 FROM payment_product_reversals v WHERE v.order_id=o.id) AND NOT EXISTS(SELECT 1 FROM payment_refund_cases v WHERE v.order_id=o.id AND v.status NOT IN('declined','refunded')) AND NOT EXISTS(SELECT 1 FROM refund_complaints x LEFT JOIN refund_complaint_reviews v ON v.complaint_id=x.id WHERE x.artist_order_id=o.id AND COALESCE(v.status,'under_review')<>'resolved_no_refund')`:`SELECT 1 FROM premium_receipts r WHERE r.order_id=$1 AND NOT EXISTS(SELECT 1 FROM premium_reversals v WHERE v.order_id=r.order_id) AND NOT EXISTS(SELECT 1 FROM premium_payment_reviews v WHERE v.order_id=r.order_id) AND NOT EXISTS(SELECT 1 FROM refund_complaints x LEFT JOIN refund_complaint_reviews v ON v.complaint_id=x.id WHERE x.premium_order_id=r.order_id AND COALESCE(v.status,'under_review')<>'resolved_no_refund')`;
 return !!(await db.query(where,[n.order_id])).rowCount;
}
async function finalizeTeam(db,artistId,quarter,mode,at=new Date()){
 if(!require('./partner-policy').period(quarter,at).ended)throw fail(409,'This team period is still open.');
 const rows=(await db.query("SELECT * FROM affiliate_native_earnings WHERE artist_id=$1 AND mode=$2 AND quarter=$3 AND source_kind='premium_team' AND status='pending' AND payable_minor IS NULL ORDER BY id FOR UPDATE",[artistId,mode,quarter])).rows;
 for(const currency of ['USD','NGN']){
  const valid=[];for(const n of rows.filter(r=>r.currency===currency))if(await eligible(db,n))valid.push(n);
  if(!valid.length)continue;const gross=valid.reduce((s,n)=>s+Number(n.gross_minor),0),bonus=money.percentage(gross,10),id=crypto.randomUUID();
  const made=await db.query('INSERT INTO affiliate_native_team_statements(id,artist_id,mode,quarter,currency,gross_minor,bonus_minor) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id',[id,artistId,mode,quarter,currency,gross,bonus]);if(!made.rowCount)continue;
  for(const a of money.allocate(bonus,valid.map(n=>({id:n.id,weight:Number(n.gross_minor)})))){const n=valid.find(n=>n.id===a.id),difference=Number(n.amount_minor)-a.amount_minor;
   if(difference<0)throw fail(409,'The team reserve requires reconciliation.');
   await db.query('INSERT INTO affiliate_native_team_allocations(earning_id,statement_id,amount_minor) VALUES($1,$2,$3)',[n.id,id,a.amount_minor]);await db.query('UPDATE affiliate_native_earnings SET payable_minor=$2 WHERE id=$1',[n.id,a.amount_minor]);
   if(difference)await finance.transfer(db,'native-team-rounding:'+n.id,'native_team_rounding_return',currency,difference,account(artistId,'pending',mode,currency),'platform:affiliate_native_expense:'+mode+':'+currency,artistId);
  }
 }
}
async function reverseOrder(db,orderId){
 const owners=(await db.query('SELECT DISTINCT artist_id FROM affiliate_native_earnings WHERE order_id=$1 ORDER BY artist_id',[orderId])).rows;
 for(const owner of owners)await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[owner.artist_id]);
 const rows=(await db.query("SELECT * FROM affiliate_native_earnings WHERE order_id=$1 AND status<>'reversed' ORDER BY artist_id,id FOR UPDATE",[orderId])).rows;
 for(const n of rows){
  const amount=Number(n.payable_minor??n.amount_minor),funded=(await db.query('SELECT 1 FROM affiliate_native_funding WHERE earning_id=$1',[n.id])).rowCount;
  const used=(await db.query("SELECT 1 FROM affiliate_withdrawal_allocations a JOIN affiliate_disbursements p ON p.withdrawal_id=a.withdrawal_id WHERE a.earning_id=$1 AND p.state NOT IN('failed','reversed') LIMIT 1",[n.id])).rowCount;
  if(used||funded&&await finance.balance(db,account(n.artist_id,'available',n.mode,n.currency))<amount){await db.query('INSERT INTO affiliate_wallet_holds(artist_id,mode,currency,earning_id,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[n.artist_id,n.mode,n.currency,n.id,'Refund involves reserved or paid commission; reviewed recovery is required.']);await db.query("UPDATE affiliate_native_earnings SET status='held' WHERE id=$1",[n.id]);continue;}
  if(amount)await finance.transfer(db,'native-refund:'+n.id,'native_commission_reversal',n.currency,amount,account(n.artist_id,funded?'available':'pending',n.mode,n.currency),'platform:affiliate_native_expense:'+n.mode+':'+n.currency,n.artist_id);
  await db.query("UPDATE affiliate_native_earnings SET status='reversed' WHERE id=$1",[n.id]);
 }
}
// A recoverable allocation error must not withhold a verified paid subscription.
// Keep the immutable receipt and retry exactly the same original-currency work.
async function enqueue(db,orderId,kind){
 await db.query('INSERT INTO affiliate_native_outbox(order_id,kind) VALUES($1,$2) ON CONFLICT DO NOTHING',[orderId,kind]);
 if(require('../config/affiliate-payouts.json').future_native_commissions!==true)return;
 await db.query('SAVEPOINT native_commission_record');
 try{await record(db,orderId,kind);await db.query("UPDATE affiliate_native_outbox SET state='complete',attempts=attempts+1,last_attempt_at=NOW() WHERE order_id=$1",[orderId]);await db.query('RELEASE SAVEPOINT native_commission_record');}
 catch{await db.query('ROLLBACK TO SAVEPOINT native_commission_record');await db.query('RELEASE SAVEPOINT native_commission_record');await db.query("UPDATE affiliate_native_outbox SET attempts=attempts+1,last_attempt_at=NOW() WHERE order_id=$1",[orderId]);}
}
async function retryPending(pool){
 const rows=(await pool.query("SELECT order_id,kind FROM affiliate_native_outbox WHERE state='pending' ORDER BY last_attempt_at NULLS FIRST,created_at LIMIT 20")).rows;
 for(const r of rows)await require('./transactions').transaction(pool,async db=>{await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['native-order:'+r.order_id]);await enqueue(db,r.order_id,r.kind);});
 return rows.length;
}
module.exports={record,enqueue,retryPending,eligible,finalizeTeam,reverseOrder,account};
