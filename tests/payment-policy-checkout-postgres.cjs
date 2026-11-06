'use strict';
// Focused checkout regression. Local disposable schema and synthetic provider responses only.
const target=require('./ci-database.cjs').ciDatabase(),test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const {runtime}=require('./runtime.cjs'),key=()=>crypto.randomUUID();
test('removing refund consent preserves gateway checkout, ownership, policy rules and historical records',async t=>{
 const control=new Pool({connectionString:target.href}),schema='policy_checkout_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});const oldFetch=global.fetch;let realRequests=0,initializations=0;
 global.fetch=async()=>{realRequests++;throw Error('External calls are forbidden');};
 try{
  const app=await runtime({pool,env:{NODE_ENV:'test',STUDIO_RELEASE_WORKER_ENABLED:'false'}});
  const api=async(path,body)=>{const r=await app.request(path,{method:'POST',body});assert.equal(r.status,201,r.text);return r.json().user;};
  const register=async(role,name)=>api(role==='artist'?'/api/register':'/api/listener/register',{name,email:name.toLowerCase().replaceAll(' ','-')+'@policy-checkout.invalid',country:'Nigeria',password:'PolicyCheckoutFixture123',confirmPassword:'PolicyCheckoutFixture123',plan:'starter'});
  const artist=await register('artist','Policy Artist'),other=await register('artist','Other Artist'),listener=await register('listener','Policy Listener');
  const adapter=require('../lib/payments/paystack').createPaystack({secretKey:'sk_test_policy_checkout_fixture_only',merchantId:'policy-checkout-fixture',mode:'test',approvedCurrencies:['USD'],reviewed:true,fetchImpl:async(url,options)=>{assert(url.endsWith('/transaction/initialize'));initializations++;const b=JSON.parse(options.body);return Response.json({status:true,data:{reference:b.reference,authorization_url:'https://checkout.paystack.com/policy-fixture-only'}});}});
  const checkout=require('../lib/payments/checkout').createCheckoutService({pool,adapters:{paystack:adapter},mode:'sandbox',merchantCountry:'NG',callbackOrigin:'https://lae.test'}),commerce=require('../lib/commerce').createCommerce({pool}),premium=require('../lib/premium-listeners').createPremium({pool,adapters:{paystack:adapter},callbackOrigin:'https://lae.test'});
  await t.test('artist checkout initializes once without refund fields and creates no acceptance claim',async()=>{
   const order=await commerce.create(artist.id,key(),{kind:'artist_subscription',plan:'starter'}),quote=await checkout.prepare(artist.id,{order_id:order.id,provider:'paystack',currency:'USD'}),before=initializations;
   await assert.rejects(checkout.start(other.id,key(),{quote_id:quote.id}),e=>e.status===404);assert.equal(initializations,before);
   const results=await Promise.all([checkout.start(artist.id,key(),{quote_id:quote.id}),checkout.start(artist.id,key(),{quote_id:quote.id})]);assert.equal(results[0].id,results[1].id);assert.equal(initializations,before+1);
   assert.equal((await pool.query('SELECT 1 FROM payment_policy_acceptances WHERE artist_order_id=$1',[order.id])).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM commerce_receipts WHERE order_id=$1',[order.id])).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM artist_subscriptions WHERE artist_id=$1',[artist.id])).rowCount,0,'Provider initialization never means payment');
  });
  await t.test('Premium checkout needs no refund fields and cannot activate access before verified payment',async()=>{
   const order=await premium.prepare(listener.id,key(),{plan:'annual'}),quote=await premium.prepareQuote(listener.id,{order_id:order.id,provider:'paystack',currency:'USD'}),before=initializations;
   const results=await Promise.all([premium.checkout(listener.id,key(),{quote_id:quote.id}),premium.checkout(listener.id,key(),{quote_id:quote.id})]);assert.equal(results[0].id,results[1].id);assert.equal(initializations,before+1);
   assert.equal((await pool.query('SELECT 1 FROM payment_policy_acceptances WHERE premium_order_id=$1',[order.id])).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM premium_entitlements WHERE listener_id=$1',[listener.id])).rowCount,0);
  });
  await t.test('earlier consent evidence stays immutable and refund rules remain enforceable',async()=>{
   const policy=require('../lib/financial-policy'),p=policy.disclosure(),order=await commerce.create(other.id,key(),{kind:'artist_subscription',plan:'starter'});
   // Reconstruct earlier explicit acceptance for an existing record; this is not a new checkout claim.
   const historical=(await pool.query('INSERT INTO payment_policy_acceptances(artist_order_id,account_id,policy_revision) VALUES($1,$2,$3) RETURNING *',[order.id,other.id,p.revision])).rows[0];
   await policy.accept(pool,'artist',order.id,other.id);assert.deepEqual((await pool.query('SELECT * FROM payment_policy_acceptances WHERE id=$1',[historical.id])).rows[0],historical);
   await assert.rejects(pool.query('UPDATE payment_policy_acceptances SET account_id=0 WHERE id=$1',[historical.id]),/append-only/);await assert.rejects(pool.query('DELETE FROM payment_policy_acceptances WHERE id=$1',[historical.id]),/append-only/);
   assert.throws(()=>policy.refundDecision({ground:'unused_generation_purchase',evidence_reference:'Preserved policy fixture evidence'},{kind:'studio_generation',service_used:true}),e=>e.status===409);
  });
  assert.equal(realRequests,0);
 }finally{global.fetch=oldFetch;await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
