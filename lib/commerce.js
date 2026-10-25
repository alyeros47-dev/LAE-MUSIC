'use strict';
const crypto=require('node:crypto');
const PLANS=require('./plans');
const {fail,transaction,idempotent,audit}=require('./transactions');
const {transfer}=require('./finance');
const {fulfillSubscription}=require('./subscriptions');
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(value);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function quote(kind,plan){
 if(!Object.hasOwn(PLANS,plan)||!['artist_subscription','studio_generation'].includes(kind))throw fail(400,'Choose a supported product and artist package.');
 return {streaming_royalty_percent:50,royalty_scope:'legacy_product_snapshot_not_streaming',kind,plan,currency:'USD',royalty_percent:PLANS[plan].royalty,direct_referral_percent:kind==='artist_subscription'?PLANS[plan].directReferralPercent:0,amount_minor:Math.round((kind==='artist_subscription'?PLANS[plan].usd:PLANS[plan].additionalGenerationUsd)*100),quantity:1,billing:kind==='artist_subscription'?'annual':'one_generation',intended_tracks:kind==='studio_generation'?2:null};
}
// Legacy non-streaming allocation snapshot only. Premium streaming uses premium-policy.js at 50% for every artist.
// This calculates an allocation only. It does not establish eligible revenue or create cash.
function royaltySplit(eligibleMinor,plan){
 if(!Number.isSafeInteger(eligibleMinor)||eligibleMinor<0||eligibleMinor>100000000||!Object.hasOwn(PLANS,plan))throw fail(400,'Invalid eligible revenue or package.');
 const artist=Math.round(eligibleMinor*PLANS[plan].royalty/100);return {eligible_minor:eligibleMinor,artist_minor:artist,platform_minor:eligibleMinor-artist,royalty_percent:PLANS[plan].royalty};
}
function createCommerce({pool,adapter=null,checkoutBinding=null}){
 // Production has no adapter. Adding a provider requires reviewed code; an environment flag cannot simulate payment.
 function enabled(){return !!(adapter&&adapter.verified===true&&token(adapter.name)&&token(adapter.merchantId)&&typeof adapter.verifyEvent==='function'&&typeof adapter.retrievePayment==='function');}
 const view=o=>({...o,streaming_royalty_percent:50,royalty_scope:'legacy_product_snapshot_not_streaming',checkout_enabled:false,effective_status:o.status==='pending'&&new Date(o.expires_at)<=new Date()?'expired':o.status});
 async function create(artistId,key,input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail(400,'Invalid purchase details.');
  const q=quote(input.kind,input.plan),{streaming_royalty_percent,royalty_scope,...requestQuote}=q,referralToken=input.referral_token||null;
  if(referralToken&&(typeof referralToken!=='string'||!/^[a-f0-9]{64}$/.test(referralToken)||q.kind!=='artist_subscription'))throw fail(400,'Invalid product referral.');
  return transaction(pool,db=>idempotent(db,'purchase:'+artistId,key,{...requestQuote,referralToken},async()=>{
   const owner=await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[artistId]);if(!owner.rowCount)throw fail(404,'Artist not found.');
   const pending=await db.query("SELECT COUNT(*)::int AS n FROM commerce_orders WHERE artist_id=$1 AND status='pending' AND expires_at>NOW()",[artistId]);if(pending.rows[0].n>=20)throw fail(429,'Review or cancel your existing purchase records before creating more.');
   if(q.kind==='studio_generation'){
    const sub=await db.query("SELECT plan FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' AND starts_at<=NOW() AND expires_at>NOW() AND NOT payment_hold ORDER BY expires_at DESC LIMIT 1",[artistId]);
    if(!sub.rowCount||sub.rows[0].plan!==q.plan)throw fail(409,'Additional generations require your current active artist package.');
   }
   let intent=null;
   if(referralToken){const r=await db.query('SELECT id,referrer_id FROM affiliate_product_intents WHERE token_hash=$1 AND buyer_id=$2 AND plan=$3 AND expires_at>NOW() AND consumed_at IS NULL FOR UPDATE',[hash(referralToken),artistId,q.plan]);if(!r.rowCount||String(r.rows[0].referrer_id)===String(artistId))throw fail(409,'The product referral expired or is unavailable. Prepare a fresh referral.');intent=r.rows[0].id;const used=await db.query('SELECT id FROM commerce_orders WHERE referral_intent_id=$1',[intent]);if(used.rowCount)throw fail(409,'This product referral is already attached to a purchase record.');}
   const r=await db.query("INSERT INTO commerce_orders(id,artist_id,kind,plan,currency,amount_minor,referral_intent_id,royalty_percent,direct_referral_percent,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()+INTERVAL '30 minutes') RETURNING *",[crypto.randomUUID(),artistId,q.kind,q.plan,q.currency,q.amount_minor,intent,q.royalty_percent,q.direct_referral_percent]);
   await audit(db,{type:'artist',id:artistId},'purchase.prepare',r.rows[0].id,{kind:q.kind,plan:q.plan,amount_minor:q.amount_minor});return r.rows[0];
  })).then(async order=>{
   // Replaying a prepared order must show its current paid/cancelled state, not the cached snapshot.
   const current=await pool.query('SELECT * FROM commerce_orders WHERE id=$1 AND artist_id=$2',[order.id,artistId]);
   return view(current.rows[0]);
  });
 }
 async function list(artistId){return (await pool.query('SELECT o.*,r.reference AS receipt_reference,r.verified_at FROM commerce_orders o LEFT JOIN commerce_receipts r ON r.order_id=o.id WHERE o.artist_id=$1 ORDER BY o.created_at DESC LIMIT 100',[artistId])).rows.map(view);}
 async function cancel(artistId,id,key){if(!uuid(id))throw fail(400,'Invalid purchase reference.');return transaction(pool,async db=>{await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[artistId]);return idempotent(db,'purchase-cancel:'+artistId,key,{id},async()=>{const r=await db.query('SELECT * FROM commerce_orders WHERE id=$1 AND artist_id=$2 FOR UPDATE',[id,artistId]);if(!r.rowCount)throw fail(404,'Your purchase record was not found.');if(r.rows[0].status!=='pending')throw fail(409,'Only pending purchase records can be cancelled.');const attempts=await db.query('SELECT id FROM payment_checkout_attempts WHERE order_id=$1',[id]);if(attempts.rowCount)throw fail(409,'A checkout has already started. Its payment reference must be reconciled before cancellation.');const changed=await db.query("UPDATE commerce_orders SET status='cancelled' WHERE id=$1 RETURNING *",[id]);await audit(db,{type:'artist',id:artistId},'purchase.cancel',id);return changed.rows[0];});}).then(view);}
 async function ingest(raw,headers){
  if(!enabled())throw fail(503,'Verified payments are not connected.');
  if(!Buffer.isBuffer(raw)||raw.length>200000||raw.length===0)throw fail(400,'Invalid payment event.');
  // The adapter authenticates the ORIGINAL bytes. Never parse and reserialize before verification.
  const event=await adapter.verifyEvent(raw,headers);
  if(!event||!token(event.id)||!token(event.paymentId))throw fail(400,'Invalid verified event identifiers.');
  const payloadHash=hash(raw);
  const old=await pool.query('SELECT payload_hash,outcome,reason,order_id FROM commerce_events WHERE provider=$1 AND event_id=$2',[adapter.name,event.id]);
  if(old.rowCount){if(old.rows[0].payload_hash!==payloadHash)throw fail(409,'Conflicting payment event.');return old.rows[0];}
  // An independently retrieved authoritative payment must match merchant, order, currency and amount.
  // Retrieve failures are retriable; they must not persist a successful or final event.
  const payment=await adapter.retrievePayment(event.paymentId);
  return recordPayment(event,payment,payloadHash,'webhook');
 }
 async function reconcileReference(reference){
  if(!enabled()||typeof adapter.retrieveByReference!=='function')throw fail(503,'Payment reconciliation is unavailable.');
  if(typeof reference!=='string'||!/^[-.a-zA-Z0-9]{16,100}$/.test(reference))throw fail(400,'Invalid payment reference.');
  const payment=await adapter.retrieveByReference(reference);
  if(!payment)throw fail(502,'Payment verification returned no result.');
  return recordPayment({id:'lookup:'+crypto.randomUUID(),paymentId:payment?.id},payment,hash(JSON.stringify(payment)),'server_lookup');
 }
 async function recordPayment(event,payment,payloadHash,verificationSource){
  if(!payment||!token(payment.id)||typeof payment.orderId!=='string'||payment.orderId.length>160)throw fail(502,'Provider verification returned an invalid payment.');
  return transaction(pool,async db=>{
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['payment-event:'+adapter.name+':'+event.id]);
   const replay=await db.query('SELECT payload_hash,outcome,reason,order_id FROM commerce_events WHERE provider=$1 AND event_id=$2',[adapter.name,event.id]);if(replay.rowCount){if(replay.rows[0].payload_hash!==payloadHash)throw fail(409,'Conflicting payment event.');return replay.rows[0];}
   let order=null;
   if(uuid(payment.orderId)){
    const owner=await db.query('SELECT artist_id FROM commerce_orders WHERE id=$1',[payment.orderId]);
    if(owner.rowCount){await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[owner.rows[0].artist_id]);order=(await db.query('SELECT *,expires_at>NOW() AS unexpired FROM commerce_orders WHERE id=$1 FOR UPDATE',[payment.orderId])).rows[0];}
   }
   let outcome='review',reason='unknown_order';
   const receipt=await db.query('SELECT order_id FROM commerce_receipts WHERE provider=$1 AND merchant_id=$2 AND payment_id=$3',[adapter.name,adapter.merchantId,event.paymentId]);
   const binding=checkoutBinding?await checkoutBinding.validate(db,{order,payment,adapter}):{ok:true,currency:order?.currency,amountMinor:Number(order?.amount_minor)};
   const valid=order&&binding.ok&&payment.id===event.paymentId&&payment.merchantId===adapter.merchantId&&payment.status==='paid'&&payment.currency===binding.currency&&Number.isSafeInteger(payment.amountMinor)&&payment.amountMinor===binding.amountMinor;
   if(!valid)reason=!order?'unknown_order':!binding.ok?binding.reason:payment.id!==event.paymentId?'payment_id_mismatch':payment.merchantId!==adapter.merchantId?'merchant_mismatch':payment.status!=='paid'?'payment_not_paid':payment.currency!==binding.currency?'currency_mismatch':'amount_mismatch';
   else if(receipt.rowCount){if(receipt.rows[0].order_id===order.id&&order.status==='paid'){outcome='duplicate';reason='already_fulfilled';}else reason='payment_already_used';}
   else if(order.status!=='pending'||!order.unexpired)reason=order.status==='paid'?'order_already_paid':order.status==='cancelled'?'order_cancelled':'order_expired';
   else{
    // Serialize reuse of a provider payment even when two different order owners race.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['payment:'+adapter.name+':'+adapter.merchantId+':'+payment.id]);
    const used=await db.query('SELECT order_id FROM commerce_receipts WHERE provider=$1 AND merchant_id=$2 AND payment_id=$3',[adapter.name,adapter.merchantId,payment.id]);
    if(used.rowCount)reason='payment_already_used';
    else{
     const reference='purchase:'+hash(adapter.name+':'+adapter.merchantId+':'+payment.id);
     let subscriptionId=null;
     if(order.kind==='artist_subscription')subscriptionId=await fulfillSubscription(db,order,reference);
     else await db.query('INSERT INTO studio_purchased_credits(order_id,artist_id) VALUES($1,$2)',[order.id,order.artist_id]);
     await transfer(db,reference,'verified_product_sale',order.currency,Number(order.amount_minor),'platform:provider_receivable:'+order.currency,'platform:product_sales:'+order.currency);
     if(subscriptionId){const commissions=await db.query("SELECT referrer_id,amount_cents FROM affiliate_subscription_commissions WHERE subscription_id=$1 AND tier=1 AND status='pending'",[subscriptionId]);for(const c of commissions.rows)await transfer(db,reference+':commission','pending_product_commission',order.currency,Number(c.amount_cents),'platform:commission_expense:'+order.currency,'artist:'+c.referrer_id+':pending:'+order.currency,c.referrer_id);}
     await db.query('INSERT INTO commerce_receipts(order_id,provider,merchant_id,payment_id,reference,currency,amount_minor) VALUES($1,$2,$3,$4,$5,$6,$7)',[order.id,adapter.name,adapter.merchantId,payment.id,reference,order.currency,order.amount_minor]);
     await db.query('INSERT INTO finance_payment_events(provider,event_id,reference,currency,amount_minor,payload_hash,verified_at) VALUES($1,$2,$3,$4,$5,$6,NOW())',[adapter.name,event.id,reference,order.currency,order.amount_minor,payloadHash]);
     await db.query("UPDATE commerce_orders SET status='paid',paid_at=NOW(),subscription_id=$2 WHERE id=$1",[order.id,subscriptionId]);
     if(checkoutBinding)await checkoutBinding.fulfill(db,{order,payment,adapter,binding,reference});
     await audit(db,{type:'provider',id:adapter.name},'purchase.fulfill',order.id,{reference,kind:order.kind,amount_minor:Number(order.amount_minor)});outcome='accepted';reason='fulfilled';
    }
   }
   await db.query('INSERT INTO commerce_events(provider,event_id,payload_hash,payment_id,order_reference,order_id,outcome,reason,verification_source,verified_details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[adapter.name,event.id,payloadHash,event.paymentId,payment.orderId,order?.id||null,outcome,reason,verificationSource,JSON.stringify({currency:String(payment.currency||'').slice(0,3),amount_minor:Number.isSafeInteger(payment.amountMinor)?payment.amountMinor:null,status:String(payment.status||'').slice(0,30),reference:String(payment.reference||'').slice(0,160),quote_id:String(payment.quoteId||'').slice(0,36),mode:String(payment.mode||'').slice(0,10)})]);
   return {outcome,reason,order_id:order?.id||null};
  });
 }
 async function report(){
  const [orders,events,summary]=await Promise.all([
   pool.query('SELECT o.id,c.display_name,o.kind,o.plan,o.currency,o.amount_minor,o.status,o.created_at,o.expires_at,o.paid_at,r.reference AS receipt_reference FROM commerce_orders o JOIN creators c ON c.id=o.artist_id LEFT JOIN commerce_receipts r ON r.order_id=o.id ORDER BY o.created_at DESC LIMIT 200'),
   pool.query("SELECT provider,event_id,payment_id,order_id,outcome,reason,created_at FROM commerce_events ORDER BY created_at DESC LIMIT 200"),
   pool.query("SELECT (SELECT COALESCE(SUM(ro.amount_minor),0) FROM payment_product_reversals rr JOIN commerce_orders ro ON ro.id=rr.order_id)::bigint AS refunded_usd_minor,COUNT(*) FILTER(WHERE o.status='pending' AND o.expires_at>NOW())::int AS pending,COUNT(*) FILTER(WHERE o.status='paid')::int AS paid,COALESCE(SUM(o.amount_minor) FILTER(WHERE o.status='paid'),0)::bigint AS paid_usd_minor,COUNT(*) FILTER(WHERE (o.status='paid') IS DISTINCT FROM (r.order_id IS NOT NULL) OR (r.order_id IS NOT NULL AND (r.amount_minor<>o.amount_minor OR r.currency<>o.currency OR t.amount_minor IS DISTINCT FROM r.amount_minor OR t.currency<>r.currency OR t.debit_account<>('platform:provider_receivable:'||r.currency) OR t.credit_account<>('platform:product_sales:'||r.currency) OR j.kind<>'verified_product_sale')) OR (o.status='paid' AND o.kind='artist_subscription' AND (s.id IS NULL OR s.artist_id<>o.artist_id OR (s.status<>'paid' AND NOT EXISTS(SELECT 1 FROM payment_product_reversals rev WHERE rev.order_id=o.id AND s.status='refunded')) OR s.plan<>o.plan OR s.amount_cents<>o.amount_minor OR s.payment_reference<>r.reference)) OR (o.status='paid' AND o.kind='studio_generation' AND p.order_id IS NULL))::int AS discrepancies FROM commerce_orders o LEFT JOIN commerce_receipts r ON r.order_id=o.id LEFT JOIN finance_journals j ON j.reference=r.reference LEFT JOIN finance_transfers t ON t.journal_id=j.id LEFT JOIN artist_subscriptions s ON s.id=o.subscription_id LEFT JOIN studio_purchased_credits p ON p.order_id=o.id")]);
  return {checkout_enabled:false,summary:summary.rows[0],orders:orders.rows,events:events.rows,notice:'Verified receipts establish product entitlements. Provider receivables and pending commissions are not withdrawable cash. Verified full sandbox refunds have separate reversal journals. Receivables are not settled cash. Partial refunds, disputes, settlement and payouts require further review.'};
 }
 return {create,list,cancel,ingest,reconcileReference,report,enabled};
}
module.exports={createCommerce,quote,royaltySplit};
