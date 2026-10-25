'use strict';
// Loaded ONLY by the disposable-local-database guard in postgres.cjs.
// Signed fixture events and authoritative lookup fixtures are not a live payment integration.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createCommerce}=require('../lib/commerce');
const finance=require('../lib/finance');
module.exports=async function(t,{pool,origin,sonicRunner}){
 const secret='isolated-signature-fixture-not-a-credential',payments=new Map();let sequence=0;
 const adapter={verified:true,name:'isolated_fixture',merchantId:'isolated_merchant',verifyEvent:async(raw,headers)=>{const expected=crypto.createHmac('sha256',secret).update(raw).digest(),supplied=Buffer.from(headers.signature||'','hex');if(supplied.length!==expected.length||!crypto.timingSafeEqual(expected,supplied))throw Object.assign(Error('Invalid signature'),{status:401});return JSON.parse(raw);},retrievePayment:async id=>{if(!payments.has(id))throw Error('Provider lookup unavailable');return structuredClone(payments.get(id));}};
 const commerce=createCommerce({pool,adapter});
 async function api(path,{body,cookie,key}={}){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function account(name){const r=await api('/api/register',{body:{name,country:'Nigeria',email:name+'@commerce-ci.invalid',password:'CommerceFixturePassword123',confirmPassword:'CommerceFixturePassword123',plan:'starter'}});assert.equal(r.status,201);return {id:r.data.user.id,cookie:r.cookie};}
 function signed(id,paymentId){const raw=Buffer.from(JSON.stringify({id,paymentId}));return [raw,{signature:crypto.createHmac('sha256',secret).update(raw).digest('hex')}];}
 async function settle(order,override={},paymentId='payment_'+(++sequence),eventId='event_'+sequence,service=commerce){payments.set(paymentId,{id:paymentId,orderId:order.id,merchantId:adapter.merchantId,currency:'USD',amountMinor:Number(order.amount_minor),status:'paid',...override});return service.ingest(...signed(eventId,paymentId));}
 let buyer,partner,leader,extraBuyer,primary,firstSubscription,primaryDetails;
 await t.test('actual purchase endpoints keep registration free, isolate accounts and distrust client price',async()=>{
  buyer=await account('commerce_buyer');partner=await account('commerce_partner');leader=await account('commerce_leader');extraBuyer=await account('commerce_extra');
  await pool.query('UPDATE creators SET referred_by=$1 WHERE id=$2',[leader.id,partner.id]);
  assert.equal((await api('/api/platform/purchases')).status,401);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM commerce_orders')).rows[0].n,0);
  const referral=await api('/api/affiliate/prepare-purchase',{cookie:buyer.cookie,body:{plan:'starter',ref:String(partner.id)}});assert.equal(referral.status,200);
  const body={kind:'artist_subscription',plan:'starter',referral_token:referral.data.referral_token,amount_minor:1,paid:true};
  primaryDetails=body;
  const responses=await Promise.all([api('/api/platform/purchases',{cookie:buyer.cookie,body,key:'commerce_http_create_123'}),api('/api/platform/purchases',{cookie:buyer.cookie,body,key:'commerce_http_create_123'})]);
  assert(responses.every(r=>r.status===201));primary=responses[0].data.order;assert.equal(primary.id,responses[1].data.order.id);assert.equal(Number(primary.amount_minor),600);assert.equal(primary.status,'pending');assert.equal(primary.checkout_enabled,false);
  assert.equal((await api('/api/platform/purchases',{cookie:partner.cookie})).data.orders.length,0);
  assert.equal((await api('/api/platform/purchases/'+primary.id+'/cancel',{cookie:partner.cookie,body:{},key:'commerce_foreign_cancel_123'})).status,404);
  assert.equal((await api('/api/platform/admin/commerce',{cookie:buyer.cookie})).status,401);
  await assert.rejects(commerce.create(buyer.id,'commerce_http_create_123',{kind:'artist_subscription',plan:'growth'}),e=>e.status===409);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM affiliate_subscription_commissions WHERE referred_artist_id=$1',[buyer.id])).rows[0].n,0);
 });
 await t.test('signed concurrent verified settlement fulfills once and records approved pending sale commission',async()=>{
  const paymentId='concurrent_subscription_payment';payments.set(paymentId,{id:paymentId,orderId:primary.id,merchantId:adapter.merchantId,currency:'USD',amountMinor:600,status:'paid'});const envelope=signed('concurrent_event',paymentId);
  await assert.rejects(commerce.ingest(envelope[0],{signature:'00'}),e=>e.status===401);
  const results=await Promise.all(Array.from({length:5},()=>commerce.ingest(...envelope)));assert(results.every(r=>r.outcome==='accepted'));
  const sub=(await pool.query('SELECT * FROM artist_subscriptions WHERE artist_id=$1',[buyer.id])).rows;assert.equal(sub.length,1);firstSubscription=sub[0];
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM commerce_receipts WHERE order_id=$1',[primary.id])).rows[0].n,1);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM commerce_events WHERE event_id='concurrent_event'")).rows[0].n,1);
  const commissions=(await pool.query('SELECT * FROM affiliate_subscription_commissions WHERE subscription_id=$1',[firstSubscription.id])).rows;assert.equal(commissions.length,1);assert.equal(commissions[0].tier,1);assert.equal(commissions[0].amount_cents,90);assert.equal(commissions[0].status,'pending');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM affiliate_team_sales WHERE subscription_id=$1',[firstSubscription.id])).rows[0].n,1);
  assert.equal(await finance.balance(pool,'artist:'+partner.id+':pending:USD'),90);assert.equal(await finance.balance(pool,finance.earnedAccount(partner.id,'USD')),0);
  await assert.rejects(finance.requestWithdrawal(pool,partner.id,'pending_commission_withdraw_123','USD',90),e=>e.status===409);
  assert.equal((await api('/api/platform/purchases',{cookie:buyer.cookie})).data.orders[0].status,'paid');
  assert.equal((await api('/api/platform/purchases',{cookie:buyer.cookie,body:primaryDetails,key:'commerce_http_create_123'})).data.order.status,'paid');
  assert.equal((await commerce.ingest(...signed('another_event_same_payment',paymentId))).outcome,'duplicate');
  const changed=Buffer.from(JSON.stringify({id:'concurrent_event',paymentId:'changed_payment'}));await assert.rejects(commerce.ingest(changed,{signature:crypto.createHmac('sha256',secret).update(changed).digest('hex')}),e=>e.status===409);
 });
 await t.test('merchant, amount, currency, state and payment identifier mismatches quarantine without entitlements',async()=>{
  for(const [override,reason]of [[{merchantId:'other_merchant'},'merchant_mismatch'],[{amountMinor:599},'amount_mismatch'],[{currency:'NGN'},'currency_mismatch'],[{status:'refunded'},'payment_not_paid'],[{id:'wrong_id'},'payment_id_mismatch']]){const order=await commerce.create(extraBuyer.id,'mismatch_order_key_'+(++sequence),{kind:'artist_subscription',plan:'starter'});const result=await settle(order,override);assert.equal(result.outcome,'review');assert.equal(result.reason,reason);assert.equal((await pool.query('SELECT status FROM commerce_orders WHERE id=$1',[order.id])).rows[0].status,'pending');}
  const unknown=await settle({id:crypto.randomUUID(),amount_minor:600});assert.equal(unknown.reason,'unknown_order');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_subscriptions WHERE artist_id=$1',[extraBuyer.id])).rows[0].n,0);
 });
 await t.test('cancelled, expired and already consumed payments cannot fulfill another purchase',async()=>{
  const order=await commerce.create(buyer.id,'cancelled_order_key_123',{kind:'artist_subscription',plan:'growth'});await commerce.cancel(buyer.id,order.id,'cancelled_request_key_123');assert.equal((await settle(order)).reason,'order_cancelled');
  const expired=(await pool.query("INSERT INTO commerce_orders(id,artist_id,kind,plan,currency,amount_minor,royalty_percent,direct_referral_percent,expires_at) VALUES($1,$2,'artist_subscription','starter','USD',600,50,15,NOW()-INTERVAL '1 second') RETURNING *",[crypto.randomUUID(),buyer.id])).rows[0];assert.equal((await settle(expired)).reason,'order_expired');
  const another=await commerce.create(buyer.id,'payment_reuse_order_123',{kind:'artist_subscription',plan:'starter'});assert.equal((await settle(another,{},'concurrent_subscription_payment','reused_payment_new_event')).reason,'payment_already_used');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_subscriptions WHERE artist_id=$1',[buyer.id])).rows[0].n,1);
 });
 await t.test('concurrent early renewals keep the active package and create contiguous annual future terms',async()=>{
  const orders=await Promise.all(['growth','professional'].map((plan,i)=>commerce.create(buyer.id,'renewal_create_key_'+i,{kind:'artist_subscription',plan})));
  await Promise.all(orders.map(order=>settle(order)));
  const subs=(await pool.query("SELECT * FROM artist_subscriptions WHERE artist_id=$1 ORDER BY starts_at",[buyer.id])).rows;assert.equal(subs.length,3);for(let i=1;i<subs.length;i++)assert.equal(subs[i].starts_at.getTime(),subs[i-1].expires_at.getTime());
  const current=await api('/api/artist/subscription',{cookie:buyer.cookie});assert.equal(current.status,200);assert.equal(current.data.plan,'starter');assert.equal(current.data.artist_features_active,true);assert.equal(current.data.upcoming_subscriptions.length,2);assert.equal(String(current.data.subscription.id),String(firstSubscription.id));
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM affiliate_subscription_commissions WHERE referred_artist_id=$1',[buyer.id])).rows[0].n,1);
 });
 await t.test('settlement rolls back receipt, subscription, ledger and event together on persistence failure',async()=>{
  const order=await commerce.create(extraBuyer.id,'rollback_order_key_123',{kind:'artist_subscription',plan:'starter'});let failed=false;
  const faulty={query:pool.query.bind(pool),connect:async()=>{const db=await pool.connect();return {query:async(sql,args)=>{if(sql.startsWith('INSERT INTO commerce_events')&&!failed){failed=true;throw Error('Isolated evidence write failure');}return db.query(sql,args);},release:()=>db.release()};}};
  const service=createCommerce({pool:faulty,adapter});const paymentId='rollback_payment',eventId='rollback_event';
  await assert.rejects(settle(order,{},paymentId,eventId,service),/write failure/);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM commerce_receipts WHERE order_id=$1',[order.id])).rows[0].n,0);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_subscriptions WHERE artist_id=$1',[extraBuyer.id])).rows[0].n,0);
  assert.equal((await commerce.ingest(...signed(eventId,paymentId))).outcome,'accepted');
 });
 await t.test('verified additional generations reserve one paid credit and restore it after provider failure',async()=>{
  await assert.rejects(commerce.create(extraBuyer.id,'wrong_package_extra_123',{kind:'studio_generation',plan:'growth'}),e=>e.status===409);
  const order=await commerce.create(extraBuyer.id,'extra_generation_key_123',{kind:'studio_generation',plan:'starter'});assert.equal(Number(order.amount_minor),300);await settle(order);await commerce.ingest(...signed('extra_duplicate_event','payment_'+sequence));
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM studio_purchased_credits WHERE artist_id=$1',[extraBuyer.id])).rows[0].n,1);
  const subscription=(await pool.query("SELECT id FROM artist_subscriptions WHERE artist_id=$1 AND starts_at<=NOW() AND expires_at>NOW()",[extraBuyer.id])).rows[0];
  for(let i=0;i<2;i++)await pool.query('INSERT INTO artist_studio_usage(subscription_id,artist_id,generation_reference) VALUES($1,$2,$3)',[subscription.id,extraBuyer.id,'included_fixture_'+i]);
  let providerCalls=0;const runner=sonicRunner(extraBuyer.id,async url=>{if(url.endsWith('/create')){providerCalls++;return {ok:true,status:200,json:async()=>({task_id:'paid_extra_provider_task_'+providerCalls})};}return {ok:true,status:200,json:async()=>({status:'failed'})};});
  const lyrics={title:'Paid credit fixture',lyrics:'An isolated test song proving an additional verified credit is safely reserved.',style:'Highlife guitars'};
  const created=await runner('/api/music/sonic/create',lyrics,'purchased_generation_key_123');assert.equal(created.status,200);const repeated=await runner('/api/music/sonic/create',lyrics,'purchased_generation_key_123');assert.equal(repeated.data.task_id,created.data.task_id);assert.equal(providerCalls,1);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_studio_usage WHERE purchase_order_id=$1',[order.id])).rows[0].n,1);
  assert.equal((await runner('/api/music/sonic/status?id='+created.data.task_id)).data.status,'failed');assert.equal((await runner('/api/music/sonic/status?id='+created.data.task_id)).data.status,'failed');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_studio_usage WHERE purchase_order_id=$1',[order.id])).rows[0].n,0);
  const retry=await runner('/api/music/sonic/create',lyrics,'purchased_generation_retry_123');assert.equal(retry.status,200);assert.equal(providerCalls,2);
  const allowance=(await api('/api/artist/studio-allowance',{cookie:extraBuyer.cookie})).data;assert.equal(allowance.used_generations,2);assert.equal(allowance.purchased_generations_remaining,0);
 });
 await t.test('purchase evidence and quotes are immutable and reconciliation detects entitlement drift',async()=>{
  await assert.rejects(pool.query('UPDATE commerce_orders SET amount_minor=1 WHERE id=$1',[primary.id]),/immutable/);await assert.rejects(pool.query('DELETE FROM commerce_receipts WHERE order_id=$1',[primary.id]),/append-only/);await assert.rejects(pool.query('UPDATE commerce_events SET outcome=\'accepted\' WHERE outcome=\'review\''),/append-only/);
  const pending=await commerce.create(extraBuyer.id,'foreign_entitlement_key_123',{kind:'artist_subscription',plan:'growth'});
  const foreign=(await pool.query('SELECT s.id FROM artist_subscriptions s WHERE s.artist_id<>$1 AND NOT EXISTS(SELECT 1 FROM commerce_orders o WHERE o.subscription_id=s.id) LIMIT 1',[extraBuyer.id])).rows[0];assert(foreign);
  await assert.rejects(pool.query("UPDATE commerce_orders SET status='paid',paid_at=NOW(),subscription_id=$2 WHERE id=$1",[pending.id,foreign.id]),e=>e.code==='23503');
  await assert.rejects(pool.query('INSERT INTO finance_transfers(journal_id,debit_account,credit_account,currency,amount_minor) SELECT journal_id,debit_account,credit_account,currency,amount_minor FROM finance_transfers LIMIT 1'),e=>e.code==='23505');
  const noReceipt=await commerce.create(extraBuyer.id,'unverified_grant_key_123',{kind:'studio_generation',plan:'starter'});
  await assert.rejects(pool.query('INSERT INTO studio_purchased_credits(order_id,artist_id) VALUES($1,$2)',[noReceipt.id,extraBuyer.id]),e=>e.code==='23503');
  assert.equal(Number((await commerce.report()).summary.discrepancies),0);
  await pool.query('UPDATE artist_subscriptions SET amount_cents=601 WHERE id=$1',[firstSubscription.id]);assert.equal(Number((await commerce.report()).summary.discrepancies),1);await pool.query('UPDATE artist_subscriptions SET amount_cents=600 WHERE id=$1',[firstSubscription.id]);
  const admin=await api('/api/admin/login',{body:{password:'isolated-ci-operator-key-123456'}});assert.equal((await api('/api/platform/admin/commerce',{cookie:admin.cookie})).status,200);
  assert.equal((await api('/api/platform/payment-webhook',{body:{paid:true}})).status,503);assert.equal((await api('/api/platform/checkout',{body:{order_id:primary.id}})).status,503);
 });
};
