'use strict';
const {fail,transaction,idempotent,audit}=require('./transactions');
const finance=require('./finance'),agreement=require('./creator-agreement');
const {quote,createCommerce}=require('./commerce');
const {fulfillSubscription}=require('./subscriptions');
async function availableRoyalties(db,artistId){
 const account=finance.earnedAccount(artistId,'USD');
 const h=await db.query("SELECT 1 FROM royalty_recovery_holds h JOIN royalty_statements s ON s.id=h.statement_id WHERE h.artist_id=$1 AND h.resolution='recovery_required' AND s.mode='live' AND s.currency='USD' UNION ALL SELECT 1 FROM affiliate_subscription_commissions WHERE referrer_id=$1 AND status='reconciliation_required' LIMIT 1",[artistId]);
 if(h.rowCount)return 0;
 // Only funded live streaming royalties qualify. Deduct all spending conservatively;
 // returned withdrawal reservations are credited back. Pending commissions, gifts,
 // test royalties and statement projections cannot finance a renewal.
 const q=await db.query("SELECT COALESCE(SUM(CASE WHEN t.credit_account=$1 AND j.kind IN ('funded_finalized_streaming_royalty','withdrawal_release') THEN t.amount_minor WHEN t.debit_account=$1 THEN -t.amount_minor ELSE 0 END),0) AS available FROM finance_transfers t JOIN finance_journals j ON j.id=t.journal_id WHERE t.debit_account=$1 OR t.credit_account=$1",[account]);
 const earned=await finance.balance(db,account),eligible=Number(q.rows[0].available);
 if(!Number.isSafeInteger(eligible))throw fail(503,'Your royalty balance requires reconciliation.');
 return Math.max(0,Math.min(earned,eligible));
}
function createMembership({pool,commerce=createCommerce({pool})}){
 async function status(artistId){const [acceptance,history,funds,current]=await Promise.all([
  agreement.accepted(pool,artistId),pool.query("SELECT s.id,s.plan,s.status,s.starts_at,s.expires_at,s.payment_hold,s.included_generations,s.publish_track_limit FROM artist_subscriptions s WHERE artist_id=$1 ORDER BY starts_at DESC NULLS LAST,id DESC LIMIT 100",[artistId]),availableRoyalties(pool,artistId),pool.query("SELECT id,plan,starts_at,expires_at,included_generations,publish_track_limit FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' AND NOT payment_hold AND starts_at<=NOW() AND expires_at>NOW() ORDER BY expires_at DESC LIMIT 1",[artistId])]);
  const clock=(await pool.query('SELECT NOW() AS now')).rows[0].now,now=+new Date(clock);
  const active=current.rows[0];
  return {status:active?'active':history.rows.some(s=>s.status==='paid'&&s.payment_hold)?'payment_review':history.rows.some(s=>s.status==='paid'&&+new Date(s.expires_at)<=now)?'expired':'inactive',active_subscription:active||null,history:history.rows,available_royalties_usd_minor:funds,agreement:agreement.disclosure(),acceptance,auto_renewal:false,notice:'Existing published songs and eligible royalties continue after membership expiry. Renew to create or publish new songs. Each royalty-funded renewal requires a separate confirmation.'};
 }
 async function renew(artistId,key,input){
  const q=quote('artist_subscription',input?.plan),a=agreement.disclosure();
  if(input?.deduction_consent!==true||input.amount_minor!==q.amount_minor||input.currency!=='USD'||input.agreement_version!==a.version||input.agreement_hash!==a.content_hash)throw fail(400,'Confirm the exact renewal price and a one-time deduction from your available USD royalties.');
  await agreement.requireAcceptance(pool,artistId);
  const order=await commerce.create(artistId,key,{kind:'artist_subscription',plan:q.plan});
  return transaction(pool,async db=>{
   await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[artistId]);
   return idempotent(db,'membership-royalty-renew:'+artistId,key,{order_id:order.id,...input},async()=>{
    const consent=await agreement.requireAcceptance(db,artistId);
    const o=(await db.query('SELECT *,expires_at>NOW() AS unexpired FROM commerce_orders WHERE id=$1 AND artist_id=$2 FOR UPDATE',[order.id,artistId])).rows[0];
    if(!o||o.status!=='pending'||!o.unexpired||o.kind!=='artist_subscription'||Number(o.amount_minor)!==q.amount_minor)throw fail(409,'This renewal purchase is no longer available.');
    if((await db.query("SELECT 1 FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' AND payment_hold LIMIT 1",[artistId])).rowCount)throw fail(409,'A membership payment is under review. Resolve it before confirming a royalty deduction.');
    if((await db.query('SELECT id FROM payment_checkout_attempts WHERE order_id=$1',[o.id])).rowCount)throw fail(409,'A payment checkout already exists. Reconcile it before renewing with royalties.');
    if((await db.query("SELECT 1 FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' AND starts_at>NOW() AND NOT payment_hold LIMIT 1",[artistId])).rowCount)throw fail(409,'Your next annual membership is already scheduled.');
    if(await availableRoyalties(db,artistId)<q.amount_minor)throw fail(409,'Insufficient available, funded USD streaming royalties. No royalty deduction or renewal was made.');
    const reference='membership-royalty:'+o.id;
    const subscriptionId=await fulfillSubscription(db,o,reference);
    await finance.transfer(db,reference,'verified_product_sale','USD',q.amount_minor,finance.earnedAccount(artistId,'USD'),'platform:product_sales:USD',artistId);
    // Reuse the existing commission records and exact amounts; no new rates,
    // payout clearance or revenue distribution rules are introduced here.
    const commissions=await db.query("SELECT referrer_id,amount_cents FROM affiliate_subscription_commissions WHERE subscription_id=$1 AND tier=1 AND status='pending'",[subscriptionId]);
    for(const c of commissions.rows)await finance.transfer(db,reference+':commission','pending_product_commission','USD',Number(c.amount_cents),'platform:commission_expense:USD','artist:'+c.referrer_id+':pending:USD',c.referrer_id);
    await db.query('INSERT INTO commerce_receipts(order_id,provider,merchant_id,payment_id,reference,currency,amount_minor) VALUES($1,$2,$3,$4,$5,$6,$7)',[o.id,'royalty_balance','lae_music',o.id,reference,'USD',q.amount_minor]);
    await db.query("UPDATE commerce_orders SET status='paid',paid_at=NOW(),subscription_id=$2 WHERE id=$1",[o.id,subscriptionId]);
    const consentText=`I authorize a one-time deduction of USD ${(q.amount_minor/100).toFixed(2)} from my available funded streaming royalties to renew my ${require('./publishing-policy').disclosure().package_names[q.plan]} annual membership. This does not authorize future deductions.`;
    await db.query('INSERT INTO membership_royalty_renewals(order_id,artist_id,agreement_acceptance_id,amount_minor,currency,deduction_consent,consent_text) VALUES($1,$2,$3,$4,$5,TRUE,$6)',[o.id,artistId,consent.id,q.amount_minor,'USD',consentText]);
    await audit(db,{type:'artist',id:artistId},'membership.royalty_renew',o.id,{subscription_id:String(subscriptionId),amount_minor:q.amount_minor,currency:'USD',agreement_acceptance_id:String(consent.id),automatic:false});
    return {order_id:o.id,subscription_id:subscriptionId,amount_minor:q.amount_minor,currency:'USD',consent_text:consentText};
   });
  });
 }
 return {status,renew};
}
module.exports={createMembership,availableRoyalties};
