'use strict';
// Invoked only by the guarded disposable PostgreSQL suite. Every gateway response is a fixture.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {runtime}=require('./runtime.cjs');
const {createCheckoutService}=require('../lib/payments/checkout');
const {createExchangeRates}=require('../lib/exchange-rates');
const {createPaystack}=require('../lib/payments/paystack');
const {createFlutterwave}=require('../lib/payments/flutterwave');
const {createCommerce}=require('../lib/commerce');
module.exports=async(t,{pool})=>{
 const psKey='sk_test_isolated_checkout_fixture_12345',flwKey='FLWSECK_TEST-isolated_checkout_fixture_12345-X',secretHash='isolated_checkout_hash_fixture_123456789';
 let calls=0,lookups=0,sequence=200,gate=null,throwInitialize=false,refundCalls=0,refundTimeout=false;const refunds=new Map();
 const payments=new Map(),byId=new Map();const response=data=>new Response(JSON.stringify(data),{status:200});
 async function fetchFixture(url,options){
  const u=new URL(url);
  if(u.hostname==='api.paystack.co'&&u.pathname==='/refund'&&options.method==='POST'){refundCalls++;const b=JSON.parse(options.body),payment=payments.get(b.transaction).data,id=900+refundCalls;refunds.set(String(id),{id,transaction:payment.id,domain:'test',currency:b.currency,amount:b.amount,status:'pending'});if(refundTimeout)throw Error('Refund accepted before timeout');return response({status:true,data:{id}});}
  if(u.hostname==='api.paystack.co'&&u.pathname==='/refund')return response({status:true,data:[...refunds.values()].filter(r=>String(r.transaction)===u.searchParams.get('transaction'))});
  if(u.hostname==='api.paystack.co'&&u.pathname.startsWith('/refund/'))return response({status:true,data:refunds.get(u.pathname.split('/').pop())});
  if(options.method==='POST'){
   calls++;const b=JSON.parse(options.body),provider=u.hostname==='api.paystack.co'?'paystack':'flutterwave',reference=b.reference||b.tx_ref;
   const data=provider==='paystack'?{id:++sequence,reference,domain:'test',status:'pending',amount:Number(b.amount),currency:b.currency,metadata:JSON.parse(b.metadata)}:{id:++sequence,account_id:12345,tx_ref:reference,status:'pending',amount:b.amount,currency:b.currency,meta:b.meta};
   payments.set(reference,{provider,data});if(provider==='flutterwave')byId.set(String(data.id),data);
   if(gate)await gate;if(throwInitialize)throw Error('Isolated provider timeout after acceptance');
   return response(provider==='paystack'?{status:true,data:{reference,authorization_url:'https://checkout.paystack.com/isolated-checkout'}}:{status:'success',data:{link:'https://checkout.flutterwave.com/v3/hosted/pay/isolated-checkout'}});
  }
  lookups++;if(u.hostname==='api.paystack.co'){const r=payments.get(decodeURIComponent(u.pathname.split('/').pop()));if(!r)throw Error('Reference not yet visible');return response({status:true,data:r.data});}
  const d=u.pathname.endsWith('verify_by_reference')?payments.get(u.searchParams.get('tx_ref'))?.data:byId.get(u.pathname.split('/').at(-2));if(!d)throw Error('Reference not yet visible');return response({status:'success',data:d});
 }
 const adapters={paystack:createPaystack({secretKey:psKey,merchantId:'isolated_ps',approvedCurrencies:['USD','NGN'],reviewed:true,fetchImpl:fetchFixture}),flutterwave:createFlutterwave({secretKey:flwKey,secretHash,merchantId:'12345',approvedCurrencies:['USD','NGN'],reviewed:true,fetchImpl:fetchFixture})};
 const rates=createExchangeRates({pool,env:{},fetchImpl:async()=>response({result:'success',base_code:'USD',time_last_update_unix:Math.floor(Date.now()/1000),time_next_update_unix:Math.floor(Date.now()/1000)+86400,rates:{USD:1,NGN:1600}})});
 const service=createCheckoutService({pool,rates,adapters,mode:'sandbox',merchantCountry:'NG',callbackOrigin:'https://lae.test'});
 const app=await runtime({pool,paymentService:service,env:{NODE_ENV:'test',ADMIN_KEY:'isolated-refund-admin-key-123456',STUDIO_RELEASE_WORKER_ENABLED:'false'}});
 const commerce=createCommerce({pool});
 async function api(path,{body,cookie,key,headers={}}={}){const r=await app.request(path,{method:body!==undefined?'POST':'GET',body,headers:{...(cookie?{cookie}:{}),...(key?{'idempotency-key':key}:{}),...headers}});return {status:r.status,data:r.json(),cookie:r.headers['set-cookie']?.split(';')[0]};}
 async function register(name){const r=await api('/api/register',{body:{name,country:'Nigeria',email:name+'@checkout-ci.invalid',password:'CheckoutFixturePassword123',confirmPassword:'CheckoutFixturePassword123',plan:'starter'}});assert.equal(r.status,201);return {id:r.data.user.id,cookie:r.cookie};}
 let artist,other,order,first;
 const paid=a=>{const p=payments.get(a.reference);p.data.status=p.provider==='paystack'?'success':'successful';return p;};
 function envelope(a,extra={}){const p=payments.get(a.reference),raw=JSON.stringify({event:p.provider==='paystack'?'charge.success':'charge.completed',data:p.provider==='paystack'?{reference:a.reference}:{id:p.data.id},...extra});return {raw,headers:{'content-type':'application/json',origin:'https://provider.invalid','sec-fetch-site':'cross-site',...(p.provider==='paystack'?{'x-paystack-signature':crypto.createHmac('sha512',psKey).update(raw).digest('hex')}:{'verif-hash':secretHash})}};}
 async function webhook(a,extra={}){const e=envelope(a,extra);return api('/api/platform/payments/webhooks/'+a.provider,{body:e.raw,headers:e.headers});}
 async function fresh(provider='paystack',currency='NGN',client=artist){const o=await commerce.create(client.id,'checkout_order_'+crypto.randomUUID(),{kind:'artist_subscription',plan:'starter'}),q=await service.prepare(client.id,{order_id:o.id,provider,currency});return {order:o,quote:q};}
 await t.test('Nigeria sandbox capabilities and quote HTTP handlers use actual account cookies and owner checks',async()=>{
  artist=await register('checkout_artist');other=await register('checkout_other');const caps=await api('/api/platform/payments/capabilities');assert.equal(caps.data.merchant_country,'NG');assert.equal(caps.data.mode,'sandbox');assert.equal(caps.data.live_enabled,false);
  order=await commerce.create(artist.id,'checkout_main_order_key',{kind:'artist_subscription',plan:'starter'});
  assert.equal((await api('/api/platform/payments/quote',{body:{order_id:order.id,provider:'paystack',currency:'NGN'}})).status,401);
  assert.equal((await api('/api/platform/payments/quote',{cookie:other.cookie,body:{order_id:order.id,provider:'paystack',currency:'NGN'}})).status,409);
  assert.equal((await api('/api/platform/payments/quote',{cookie:artist.cookie,body:{order_id:order.id,provider:'paystack',currency:'EUR'}})).status,503);
 });
 await t.test('cross-provider concurrent checkout starts claim one reference and call one provider once',async()=>{
  const qs=await Promise.all(['paystack','flutterwave'].map(provider=>service.prepare(artist.id,{order_id:order.id,provider,currency:'NGN'})));const before=calls;
  const starts=await Promise.all(qs.map((q,i)=>api('/api/platform/checkout',{cookie:artist.cookie,key:'checkout_competing_key_'+i,body:{policy_accepted:true,policy_revision:require('../lib/financial-policy').disclosure().revision,quote_id:q.id,amount:1,paid:true}})));
  assert.equal(starts.filter(r=>r.status===202).length,1);assert.equal(starts.filter(r=>r.status===409).length,1);assert.equal(calls,before+1);first=starts.find(r=>r.status===202).data.checkout;assert.equal(first.status,'ready');assert.equal(Number(first.charge_minor),960000);assert.equal(Number(first.base_minor),600);
  const replay=await api('/api/platform/checkout',{cookie:artist.cookie,key:'checkout_new_retry_key_123',body:{policy_accepted:true,policy_revision:require('../lib/financial-policy').disclosure().revision,quote_id:first.quote_id}});assert.equal(replay.data.checkout.id,first.id);assert.equal(calls,before+1);
  assert.equal((await api('/api/platform/payments/checkouts/'+first.id,{cookie:other.cookie})).status,404);assert.equal((await api('/api/platform/payments/checkouts',{cookie:other.cookie})).data.checkouts.length,0);
  await assert.rejects(commerce.cancel(artist.id,order.id,'checkout_cancel_attempt_123'),e=>e.status===409);
 });
 await t.test('signed NGN evidence settles one USD order and stores the original charge without currency relabeling',async()=>{
  paid(first);const before=lookups,e=envelope(first);const bad=await api('/api/platform/payments/webhooks/'+first.provider,{body:e.raw,headers:{...e.headers,...(first.provider==='paystack'?{'x-paystack-signature':'bad'}:{'verif-hash':'bad'})}});assert.equal(bad.status,401);assert.equal(lookups,before);
  const results=await Promise.all([webhook(first),webhook(first)]);assert(results.every(r=>r.status===200&&r.data.outcome==='accepted'));
  const presentment=(await pool.query('SELECT * FROM payment_presentments WHERE order_id=$1',[order.id])).rows[0];assert.equal(presentment.base_currency,'USD');assert.equal(Number(presentment.base_minor),600);assert.equal(presentment.charge_currency,'NGN');assert.equal(Number(presentment.charge_minor),960000);
  const receipt=(await pool.query('SELECT * FROM commerce_receipts WHERE order_id=$1',[order.id])).rows[0];assert.equal(receipt.currency,'USD');assert.equal(Number(receipt.amount_minor),600);assert.equal((await webhook(first,{delivery:2})).data.outcome,'duplicate');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_subscriptions WHERE artist_id=$1',[artist.id])).rows[0].n,1);assert.equal((await service.status(artist.id,first.id)).status,'paid');
  await assert.rejects(pool.query('UPDATE payment_checkout_attempts SET reference=\'forged-reference\' WHERE id=$1',[first.id]),/immutable/);await assert.rejects(pool.query('UPDATE payment_presentments SET charge_minor=1 WHERE order_id=$1',[order.id]),/append-only/);
 });
 await t.test('provider quote, currency, amount and mode mismatches never grant another subscription',async()=>{
  const x=await fresh(),a=await service.start(artist.id,'checkout_mismatch_start_123',{policy_accepted:true,policy_revision:require('../lib/financial-policy').disclosure().revision,quote_id:x.quote.id});const p=paid(a),original=structuredClone(p.data);
  for(const [change,reason]of [[{currency:'USD'},'currency_mismatch'],[{amount:1},'amount_mismatch'],[{metadata:{...original.metadata,lae_quote_id:crypto.randomUUID()}},'checkout_binding_mismatch']]){p.data={...original,...change};assert.equal((await webhook(a,{case:reason})).data.reason,reason);assert.equal((await pool.query('SELECT status FROM commerce_orders WHERE id=$1',[x.order.id])).rows[0].status,'pending');}
  p.data={...original,domain:'live'};assert.equal((await webhook(a,{case:'wrong_mode'})).status,502);p.data=original;
  const before=calls;const done=await api('/api/platform/payments/checkouts/'+a.id+'/verify',{cookie:artist.cookie,body:{paid:true}});assert.equal(done.status,200);assert.equal(done.data.checkout.status,'paid');assert.equal(calls,before);
  const verified=(await pool.query("SELECT verification_source FROM commerce_events WHERE order_id=$1 AND outcome='accepted'",[x.order.id])).rows[0];assert.equal(verified.verification_source,'server_lookup');
 });
 await t.test('ambiguous provider acceptance holds its reference and blocks retries and gateway failover',async()=>{
  const x=await fresh('flutterwave');throwInitialize=true;const before=calls;const a=await service.start(artist.id,'checkout_timeout_start_123',{policy_accepted:true,policy_revision:require('../lib/financial-policy').disclosure().revision,quote_id:x.quote.id});throwInitialize=false;assert.equal(a.status,'review');assert.equal(calls,before+1);
  await service.start(artist.id,'checkout_timeout_retry_123',{policy_accepted:true,policy_revision:require('../lib/financial-policy').disclosure().revision,quote_id:x.quote.id});assert.equal(calls,before+1);const alternate=await service.prepare(artist.id,{order_id:x.order.id,provider:'paystack',currency:'NGN'});await assert.rejects(service.start(artist.id,'checkout_timeout_switch_123',{policy_accepted:true,policy_revision:require('../lib/financial-policy').disclosure().revision,quote_id:alternate.id}),e=>e.status===409);assert.equal(calls,before+1);
  paid(a);const reconciled=await service.reconcile(artist.id,a.id);assert.equal(reconciled.status,'paid');assert.equal(calls,before+1);
 });
 await t.test('a verified webhook arriving before initialization response cannot be overwritten by a checkout URL',async()=>{
  const x=await fresh('flutterwave');let release;gate=new Promise(resolve=>{release=resolve;});const before=calls;const started=service.start(artist.id,'checkout_early_webhook_123',{policy_accepted:true,policy_revision:require('../lib/financial-policy').disclosure().revision,quote_id:x.quote.id});
  try{for(let i=0;i<100&&calls===before;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(calls,before+1);const a=(await pool.query('SELECT * FROM payment_checkout_attempts WHERE quote_id=$1',[x.quote.id])).rows[0];paid(a);assert.equal((await webhook(a)).data.outcome,'accepted');}finally{gate=null;release();}const result=await started;assert.equal(result.status,'paid');assert.equal(result.checkout_url,null);
 });
 await t.test('failure storing a provider URL retains the attempt and a later lookup safely reconciles it',async()=>{
  let fail=true;const faulty={query:pool.query.bind(pool),connect:async()=>{const db=await pool.connect();return {query:async(sql,args)=>{if(fail&&sql.startsWith("UPDATE payment_checkout_attempts SET status='ready'")){fail=false;throw Error('Isolated checkout persistence failure');}return db.query(sql,args);},release:()=>db.release()};}};
  const service2=createCheckoutService({pool:faulty,rates,adapters,mode:'sandbox',callbackOrigin:'https://lae.test'}),x=await fresh(),before=calls;const a=await service2.start(artist.id,'checkout_storage_fail_123',{policy_accepted:true,policy_revision:require('../lib/financial-policy').disclosure().revision,quote_id:x.quote.id});assert.equal(a.status,'review');assert.equal(calls,before+1);await service2.start(artist.id,'checkout_storage_retry_123',{policy_accepted:true,policy_revision:require('../lib/financial-policy').disclosure().revision,quote_id:x.quote.id});assert.equal(calls,before+1);paid(a);assert.equal((await service2.reconcile(artist.id,a.id)).status,'paid');
 });
 await t.test('local settlement rolls back all entitlements and journals if original-charge evidence cannot be saved',async()=>{
  let fail=true;const faulty={query:pool.query.bind(pool),connect:async()=>{const db=await pool.connect();return {query:async(sql,args)=>{if(fail&&sql.startsWith('INSERT INTO payment_presentments')){fail=false;throw Error('Isolated presentment failure');}return db.query(sql,args);},release:()=>db.release()};}};
  const service2=createCheckoutService({pool:faulty,rates,adapters,mode:'sandbox',callbackOrigin:'https://lae.test'}),x=await fresh(),a=await service2.start(artist.id,'checkout_presentment_fail_123',{policy_accepted:true,policy_revision:require('../lib/financial-policy').disclosure().revision,quote_id:x.quote.id});paid(a);const e=envelope(a);await assert.rejects(service2.webhook(a.provider,Buffer.from(e.raw),e.headers),/presentment failure/);
  assert.equal((await pool.query('SELECT status FROM commerce_orders WHERE id=$1',[x.order.id])).rows[0].status,'pending');assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM commerce_receipts WHERE order_id=$1',[x.order.id])).rows[0].n,0);assert.equal((await service2.webhook(a.provider,Buffer.from(e.raw),e.headers)).outcome,'accepted');assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM payment_presentments WHERE order_id=$1',[x.order.id])).rows[0].n,1);
 });
 await t.test('expired checkout quotes quarantine delayed paid events instead of silently accepting changed prices',async()=>{
  const o=await commerce.create(artist.id,'checkout_late_order_key',{kind:'artist_subscription',plan:'starter'}),id=crypto.randomUUID();
  await pool.query("INSERT INTO payment_checkout_quotes(id,order_id,provider,base_currency,base_minor,charge_currency,charge_minor,created_at,expires_at) VALUES($1,$2,'paystack','USD',600,'USD',600,NOW()-INTERVAL '10 minutes',NOW()-INTERVAL '5 minutes')",[id,o.id]);await assert.rejects(service.start(artist.id,'checkout_expired_start_123',{policy_accepted:true,policy_revision:require('../lib/financial-policy').disclosure().revision,quote_id:id}),e=>e.status===409);
  const a={id:crypto.randomUUID(),order_id:o.id,quote_id:id,provider:'paystack',reference:'lae-'+crypto.randomUUID()};await pool.query("INSERT INTO payment_checkout_attempts(id,order_id,quote_id,provider,merchant_id,merchant_country,mode,reference) VALUES($1,$2,$3,'paystack','isolated_ps','NG','test',$4)",[a.id,o.id,id,a.reference]);payments.set(a.reference,{provider:'paystack',data:{domain:'test',reference:a.reference,status:'success',amount:600,currency:'USD',metadata:{lae_order_id:o.id,lae_quote_id:id}}});
  assert.equal((await webhook(a)).data.reason,'checkout_quote_expired');assert.equal((await pool.query('SELECT status FROM commerce_orders WHERE id=$1',[o.id])).rows[0].status,'pending');assert.equal((await service.status(artist.id,a.id)).checkout_url,null);
 });
 await t.test('bound local studio purchases grant one generation without adding an unapproved affiliate commission',async()=>{
  const o=await commerce.create(artist.id,'checkout_local_studio_order',{kind:'studio_generation',plan:'starter'}),q=await service.prepare(artist.id,{order_id:o.id,provider:'paystack',currency:'NGN'});assert.equal(Number(q.base_minor),300);assert.equal(Number(q.charge_minor),480000);
  const a=await service.start(artist.id,'checkout_local_studio_start',{policy_accepted:true,policy_revision:require('../lib/financial-policy').disclosure().revision,quote_id:q.id});paid(a);assert.equal((await webhook(a)).data.outcome,'accepted');assert.equal((await webhook(a)).data.outcome,'accepted');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM studio_purchased_credits WHERE order_id=$1',[o.id])).rows[0].n,1);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM affiliate_subscription_commissions c JOIN commerce_orders o ON o.subscription_id=c.subscription_id WHERE o.id=$1',[o.id])).rows[0].n,0);
 });

 await t.test('rapid owner verification requests share a durable lookup limit without triggering new charges',async()=>{
  const x=await fresh(),a=await service.start(artist.id,'checkout_lookup_limit_start',{policy_accepted:true,policy_revision:require('../lib/financial-policy').disclosure().revision,quote_id:x.quote.id}),beforeLookups=lookups,beforeCalls=calls;
  await Promise.all(Array.from({length:5},()=>service.reconcile(artist.id,a.id)));assert.equal(lookups,beforeLookups+1);assert.equal(calls,beforeCalls);assert.equal((await pool.query('SELECT status FROM commerce_orders WHERE id=$1',[x.order.id])).rows[0].status,'pending');paid(a);assert.equal((await webhook(a)).data.outcome,'accepted');
 });
 await t.test('an interrupted process after reservation cannot restart initialization on another worker',async()=>{
  const x=await fresh('flutterwave'),id=crypto.randomUUID(),reference='lae-'+crypto.randomUUID();await pool.query("INSERT INTO payment_checkout_attempts(id,order_id,quote_id,provider,merchant_id,merchant_country,mode,reference,created_at) VALUES($1,$2,$3,'flutterwave','12345','NG','test',$4,NOW()-INTERVAL '1 minute')",[id,x.order.id,x.quote.id,reference]);
  const restarted=createCheckoutService({pool,rates,adapters,mode:'sandbox',callbackOrigin:'https://lae.test'}),before=calls;const current=await restarted.start(artist.id,'checkout_after_crash_key_123',{policy_accepted:true,policy_revision:require('../lib/financial-policy').disclosure().revision,quote_id:x.quote.id});assert.equal(current.id,id);assert.equal(current.status,'review');assert.equal(calls,before);await assert.rejects(restarted.reconcile(artist.id,id),e=>e.status===503);assert.equal(calls,before);
 });

 await t.test('current financial consent is required before provider initialization and immutable owner-bound evidence survives retries',async()=>{
  const x=await fresh('flutterwave'),before=calls,policy=require('../lib/financial-policy').disclosure();
  for(const input of [{quote_id:x.quote.id},{quote_id:x.quote.id,policy_accepted:true,policy_revision:'stale'}])await assert.rejects(service.start(artist.id,'policy_missing_'+crypto.randomUUID(),input),e=>e.status===409);
  assert.equal(calls,before);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM payment_checkout_attempts WHERE order_id=$1',[x.order.id])).rows[0].n,0);
  const input={quote_id:x.quote.id,policy_accepted:true,policy_revision:policy.revision};await Promise.all([service.start(artist.id,'policy_accepted_a123456',input),service.start(artist.id,'policy_accepted_b123456',input)]);
  assert.equal(calls,before+1);const rows=(await pool.query('SELECT * FROM payment_policy_acceptances WHERE artist_order_id=$1',[x.order.id])).rows;assert.equal(rows.length,1);assert.equal(String(rows[0].account_id),String(artist.id));assert.equal(rows[0].policy_revision,policy.revision);
  await assert.rejects(pool.query('UPDATE payment_policy_acceptances SET account_id=0 WHERE id=$1',[rows[0].id]),/append-only/);
  await assert.rejects(pool.query('INSERT INTO payment_policy_acceptances(artist_order_id,account_id,policy_revision) VALUES($1,0,$2)',[x.order.id,policy.revision]),/purchase owner/);
 });

 await require('./refunds-postgres.cjs')(t,{pool,service,adapters,api,register,fresh,paid,webhook,commerce,refunds,payments,refundCount:()=>refundCalls,setRefundTimeout:v=>{refundTimeout=v;}});

};
