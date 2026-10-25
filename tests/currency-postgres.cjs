'use strict';
// Invoked only after the disposable PostgreSQL guard in postgres.cjs.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createExchangeRates}=require('../lib/exchange-rates');
const {createCheckoutQuotes}=require('../lib/payments/quotes');
const {createCommerce}=require('../lib/commerce');
const {createPaystack}=require('../lib/payments/paystack');
const {createFlutterwave}=require('../lib/payments/flutterwave');
module.exports=async(t,{pool,origin})=>{
 let artist,cookie,rates,order,quote;const clock=Date.now();let fetches=0;
 const fixture={result:'success',base_code:'USD',time_last_update_unix:Math.floor(clock/1000),time_next_update_unix:Math.floor(clock/1000)+86400,rates:{USD:1,NGN:1600,JPY:150.25,KWD:.3065,XOF:600}};
 const response=data=>new Response(JSON.stringify(data),{status:200});
 const commerce=createCommerce({pool});
 await t.test('currency reference snapshots persist across service restarts without changing USD orders',async()=>{
  const r=await fetch(origin+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Currency CI Artist',country:'Nigeria',email:'currency@isolated-ci.invalid',password:'CurrencyFixturePassword123',confirmPassword:'CurrencyFixturePassword123',plan:'starter'})});assert.equal(r.status,201);artist=(await r.json()).user.id;cookie=r.headers.get('set-cookie').split(';')[0];
  rates=createExchangeRates({pool,now:()=>clock,env:{},fetchImpl:async()=>{fetches++;return response(fixture);}});const [a,b]=await Promise.all([rates.pricing({country:'NG'}),rates.pricing({currency:'JPY'})]);assert.equal(a.products['artist_subscription:starter'].local_minor,960000);assert.equal(b.products['artist_subscription:starter'].local_minor,902);assert.equal(fetches,1);
  const restart=createExchangeRates({pool,now:()=>clock,env:{},fetchImpl:async()=>{throw Error('A fresh persisted snapshot must be reused');}});assert.equal((await restart.pricing({currency:'KWD'})).products['artist_subscription:starter'].local_minor,1839);
  order=await commerce.create(artist,'currency_order_key_123',{kind:'artist_subscription',plan:'starter',currency:'NGN',amount_minor:1});assert.equal(order.currency,'USD');assert.equal(Number(order.amount_minor),600);
  await assert.rejects(pool.query('UPDATE currency_rate_snapshots SET rates=\'{"USD":"1","NGN":"1"}\''),/append-only/);
 });
 await t.test('local checkout quotes bind approved account currency, owner, base price and immutable rate snapshot',async()=>{
  const quotes=createCheckoutQuotes({pool,rates,accounts:{paystack:{configured:true,currencies:['NGN','USD']},flutterwave:{configured:true,currencies:['JPY']}}});
  quote=await quotes.prepare(artist,order.id,'paystack','NGN');assert.equal(Number(quote.base_minor),600);assert.equal(quote.base_currency,'USD');assert.equal(Number(quote.charge_minor),960000);assert.equal(quote.charge_currency,'NGN');assert(quote.rate_snapshot_id);assert(new Date(quote.expires_at)<=new Date(order.expires_at));
  await assert.rejects(quotes.prepare(artist,order.id,'paystack','JPY'),e=>e.status===503);await assert.rejects(quotes.prepare(999999,order.id,'paystack','NGN'),e=>e.status===409);
  await assert.rejects(pool.query('UPDATE payment_checkout_quotes SET charge_minor=1 WHERE id=$1',[quote.id]),/append-only/);
  await assert.rejects(pool.query("INSERT INTO payment_checkout_quotes(id,order_id,provider,base_currency,base_minor,charge_currency,charge_minor,expires_at) VALUES($1,$2,'paystack','USD',1,'USD',1,NOW()+INTERVAL '5 minutes')",[crypto.randomUUID(),order.id]),e=>e.code==='23503');
 });
 await t.test('actual Paystack adapter plus PostgreSQL settlement verifies a signed USD fixture once',async()=>{
  const key='sk_test_isolated_postgres_currency_fixture',reference='isolated-paystack-reference-123';let verifications=0;
  const adapter=createPaystack({secretKey:key,merchantId:'isolated_paystack_merchant',reviewed:true,fetchImpl:async(url,options)=>{verifications++;assert.equal(url,'https://api.paystack.co/transaction/verify/'+reference);assert.equal(options.redirect,'error');return response({status:true,data:{reference,domain:'test',status:'success',currency:'USD',amount:600,metadata:{lae_order_id:order.id,lae_quote_id:crypto.randomUUID()}}});}});
  const service=createCommerce({pool,adapter}),raw=Buffer.from(JSON.stringify({event:'charge.success',data:{reference}})),headers={'x-paystack-signature':crypto.createHmac('sha512',key).update(raw).digest('hex')};
  await assert.rejects(service.ingest(raw,{'x-paystack-signature':'wrong'}),e=>e.status===401);assert.equal(verifications,0);const results=await Promise.all([service.ingest(raw,headers),service.ingest(raw,headers)]);assert(results.every(x=>x.outcome==='accepted'));assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM commerce_receipts WHERE order_id=$1',[order.id])).rows[0].n,1);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_subscriptions WHERE artist_id=$1',[artist])).rows[0].n,1);
 });
 await t.test('actual Flutterwave adapter settles USD fixtures; local charge evidence cannot masquerade as USD',async()=>{
  const key='FLWSECK_TEST-isolated_postgres_currency_fixture-X',secretHash='isolated_postgres_flutterwave_hash_123456';
  const usdOrder=await commerce.create(artist,'currency_flw_usd_order_123',{kind:'artist_subscription',plan:'growth'}),localOrder=await commerce.create(artist,'currency_flw_local_order_123',{kind:'artist_subscription',plan:'starter'});
  let transaction={id:91,account_id:12345,status:'successful',amount:'10.00',currency:'USD',tx_ref:'isolated-flw-reference-123',meta:{lae_order_id:usdOrder.id,lae_quote_id:crypto.randomUUID()}};
  const adapter=createFlutterwave({secretKey:key,secretHash,merchantId:'12345',reviewed:true,fetchImpl:async()=>response({status:'success',data:transaction})}),service=createCommerce({pool,adapter});
  const event=Buffer.from(JSON.stringify({event:'charge.completed',data:{id:91}}));assert.equal((await service.ingest(event,{'verif-hash':secretHash})).outcome,'accepted');
  transaction={...transaction,id:92,amount:'9600.00',currency:'NGN',tx_ref:'isolated-flw-reference-124',meta:{lae_order_id:localOrder.id,lae_quote_id:quote.id}};
  const localEvent=Buffer.from(JSON.stringify({event:'charge.completed',data:{id:92}}));assert.equal((await service.ingest(localEvent,{'verif-hash':secretHash})).reason,'currency_mismatch');assert.equal((await pool.query('SELECT status FROM commerce_orders WHERE id=$1',[localOrder.id])).rows[0].status,'pending');
  assert.equal((await fetch(origin+'/api/platform/checkout',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({provider:'paystack',currency:'NGN',order_id:localOrder.id})})).status,503);
 });
};
