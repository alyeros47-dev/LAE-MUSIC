'use strict';
// Actual database/migrations/fulfilment, mocked Monnify network only. No real funds.
const target=require('./ci-database.cjs').ciDatabase();
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const {runtime}=require('./runtime.cjs'),key=()=>crypto.randomUUID();
const secret='monnify_disposable_fixture_secret',env={NODE_ENV:'test',ADMIN_KEY:'MonnifyFixtureOwnerKeyOnly12345',STUDIO_RELEASE_WORKER_ENABLED:'false',MONNIFY_API_KEY:'MK_PROD_fixture_not_real',MONNIFY_SECRET_KEY:secret,MONNIFY_CONTRACT_CODE:'1000000001',MONNIFY_BASE_URL:'https://api.monnify.com'};
test('Monnify isolated database integration; mocked network does not prove live acceptance',async t=>{
 const control=new Pool({connectionString:target.href}),schema='monnify_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema,max:24});
 const original=global.fetch,transactions=new Map(),policy=require('../config/monnify-payments.json'),savedPolicy={...policy};Object.assign(policy,{public_enabled:false,live_acceptance_confirmed:false,successful_payment_reference:''});let initiations=0,serial=0;
 global.fetch=async(url,options={})=>{
  assert(String(url).startsWith('https://api.monnify.com/api/'),'External providers forbidden');let body;
  if(url.endsWith('/auth/login'))body={accessToken:'fixture_access_token',expiresIn:3600};
  else if(url.endsWith('/init-transaction')){initiations++;const input=JSON.parse(options.body),transactionReference='MNFY|fixture|'+(++serial);transactions.set(input.paymentReference,{...input,transactionReference,paymentStatus:'PENDING',amountPaid:'0.00',currency:'NGN'});body={paymentReference:input.paymentReference,transactionReference,checkoutUrl:'https://sdk.monnify.com/checkout/'+serial};}
  else if(url.includes('/transactions/query?')){const x=transactions.get(new URL(url).searchParams.get('paymentReference'));body=x?{paymentReference:x.paymentReference,transactionReference:x.transactionReference}:{};}
  else if(url.includes('/api/v2/transactions/'))body=[...transactions.values()].find(x=>x.transactionReference===decodeURIComponent(url.split('/').at(-1)))||{};
  else throw Error('Unexpected mocked API path');
  return Response.json({requestSuccessful:true,responseCode:'0',responseBody:body});
 };
 try{
  let app=await runtime({pool,env});await require('./artist-launch-fixture.cjs').filledPromotion(pool);
  await pool.query("INSERT INTO currency_rate_snapshots(id,source,as_of,next_update,rates) VALUES($1,'exchangerate-api',NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 day',$2)",[key(),JSON.stringify({USD:'1',NGN:'1500'})]);
  const api=async(path,body,cookie,k=key(),headers={})=>{const r=await app.request(path,{method:body===undefined?'GET':'POST',body,headers:{...(cookie?{cookie}:{}),'idempotency-key':k,'content-type':'application/json',...headers}});return {status:r.status,data:r.json(),cookie:[r.headers['set-cookie']||[]].flat().map(x=>x.split(';')[0]).join('; ')};};
  const login=await api('/api/admin/login',{password:env.ADMIN_KEY});assert.equal(login.status,200);const admin=login.cookie;
  async function register(role,name){const r=await api(role==='artist'?'/api/register':'/api/listener/register',{name,email:name+'@monnify.invalid',country:'Nigeria',password:'MonnifyFixturePass123',confirmPassword:'MonnifyFixturePass123',plan:'starter'});assert.equal(r.status,201,JSON.stringify(r.data));return {id:r.data.user.id,email:name+'@monnify.invalid',cookie:r.cookie};}
  const artist=await register('artist','artist'),listener=await register('listener','listener'),stranger=await register('listener','stranger');
  async function start(role,user,product={},k=key()){const r=await api('/api/platform/admin/monnify/checkout',{role,email:user.email,confirm_real_payment:true,...product},admin,k);assert.equal(r.status,201,JSON.stringify(r.data));return r.data;}
  function notification(c,extra={}){const raw=Buffer.from(JSON.stringify({eventType:'SUCCESSFUL_TRANSACTION',eventData:{paymentReference:c.reference,transactionReference:transactions.get(c.reference).transactionReference,...extra}}));return {raw,headers:{'monnify-signature':crypto.createHmac('sha512',secret).update(raw).digest('hex')}};}
  async function webhook(c,extra={}){const n=notification(c,extra);return api('/api/platform/payments/webhooks/monnify',n.raw,undefined,key(),n.headers);}
  function paid(c){const p=transactions.get(c.reference);p.paymentStatus='PAID';p.amountPaid=p.amount;return p;}
  let first;
  await t.test('credentials alone do not open public checkout; owner-only checkout is idempotent and unpaid',async()=>{
   const caps=await api('/api/platform/payments/capabilities');assert.equal(caps.status,200,JSON.stringify(caps.data));assert(!caps.data.providers.some(x=>x.id==='monnify'));assert.equal(initiations,0);
   assert.equal((await api('/api/platform/admin/monnify/checkout',{role:'listener',email:listener.email,confirm_real_payment:true,plan:'monthly'},listener.cookie)).status,401);
   const input={role:'listener',email:listener.email,confirm_real_payment:true,plan:'monthly'},k=key();
   const results=await Promise.all([api('/api/platform/admin/monnify/checkout',input,admin,k),api('/api/platform/admin/monnify/checkout',input,admin,k)]);for(const r of results)assert.equal(r.status,201,JSON.stringify(r.data));first=results[0].data;assert.equal(results[1].data.checkout.id,first.checkout.id);assert.equal(initiations,1);assert.equal(first.checkout.mode,'live');assert.equal((await pool.query('SELECT 1 FROM premium_entitlements')).rowCount,0);
   assert.equal((await api('/api/platform/admin/monnify/checkout',{...input,plan:'quarterly'},admin,k)).status,409);
   assert.equal((await api('/api/platform/premium/verify',{attempt_id:first.checkout.id},stranger.cookie)).status,404);
  });
  await t.test('forged notifications, false browser callbacks and unpaid statuses never grant access',async()=>{
   const n=notification(first.checkout);assert.equal((await api('/api/platform/payments/webhooks/monnify',n.raw,undefined,key(),{'monnify-signature':'a'.repeat(128)})).status,401);
   const check=await api('/api/platform/admin/monnify/verify',{role:'listener',attempt_id:first.checkout.id,success:true},admin);assert([200,409].includes(check.status),JSON.stringify(check.data));
   for(const state of ['PENDING','FAILED','CANCELLED','PARTIALLY_PAID','EXPIRED']){transactions.get(first.checkout.reference).paymentStatus=state;const r=await webhook(first.checkout,{testState:state});assert([200,409].includes(r.status),JSON.stringify(r.data));assert.equal((await pool.query('SELECT 1 FROM premium_entitlements')).rowCount,0);}
  });
  await t.test('wrong amount/currency/metadata cannot activate; signed independently verified PAID activates once',async()=>{
   const p=paid(first.checkout);p.amountPaid='0.01';assert.equal((await webhook(first.checkout)).status,409);p.amountPaid=p.amount;p.currency='USD';assert.equal((await webhook(first.checkout)).status,502);p.currency='NGN';const metadata=p.metaData;p.metaData={lae_order_id:key(),lae_quote_id:key()};assert.equal((await webhook(first.checkout)).status,404);p.metaData=metadata;
   const results=await Promise.all([webhook(first.checkout),webhook(first.checkout)]);for(const r of results)assert.equal(r.status,200,JSON.stringify(r.data));
   const terms=(await pool.query('SELECT *,EXTRACT(EPOCH FROM expires_at-starts_at) AS seconds FROM premium_entitlements')).rows;assert.equal(terms.length,1);assert.equal(Number(terms[0].seconds),30*86400);assert.equal((await pool.query('SELECT 1 FROM premium_receipts')).rowCount,1);
   const pcheck=await api('/api/platform/admin/monnify/verify',{role:'listener',attempt_id:first.checkout.id},admin);assert([200,429].includes(pcheck.status),JSON.stringify(pcheck.data));
   assert.equal((await api('/api/platform/premium/status',undefined,listener.cookie)).data.active,true);
  });
  await t.test('every listener duration preserves the approved USD price and paid time',async()=>{
   for(const plan of require('../lib/premium-pricing').catalog().plans){const p=await start('listener',listener,{plan:plan.code});assert.equal(Number(p.checkout.base_minor),plan.usd_minor);assert.equal(Number(p.charge_minor),plan.usd_minor*1500);paid(p.checkout);const r=await webhook(p.checkout);assert.equal(r.status,200,JSON.stringify(r.data));const term=(await pool.query('SELECT EXTRACT(EPOCH FROM expires_at-starts_at) AS seconds FROM premium_entitlements WHERE order_id=$1',[p.order_id])).rows[0];assert.equal(Number(term.seconds),plan.days*86400);}
  });
  await t.test('all artist annual packages and add-ons use existing fulfilment without double credits',async()=>{
   for(const [plan,generations,tracks]of [['starter',3,6],['growth',6,12],['professional',15,30]]){const a=plan==='starter'?artist:await register('artist',plan),p=await start('artist',a,{kind:'artist_subscription',plan});assert.equal(Number(p.checkout.base_minor),require('../lib/commerce').quote('artist_subscription',plan).amount_minor);assert.equal((await pool.query('SELECT 1 FROM artist_subscriptions WHERE artist_id=$1',[a.id])).rowCount,0);paid(p.checkout);const results=await Promise.all([webhook(p.checkout),webhook(p.checkout)]);for(const r of results)assert.equal(r.status,200,JSON.stringify(r.data));const s=(await pool.query('SELECT * FROM artist_subscriptions WHERE artist_id=$1',[a.id])).rows;assert.equal(s.length,1);assert.equal(s[0].included_generations,generations);assert.equal(s[0].publish_track_limit,tracks);
    const extra=await start('artist',a,{kind:'studio_generation',plan});assert.equal(Number(extra.checkout.base_minor),require('../lib/commerce').quote('studio_generation',plan).amount_minor);paid(extra.checkout);await Promise.all([webhook(extra.checkout),webhook(extra.checkout)]);assert.equal((await pool.query('SELECT 1 FROM studio_purchased_credits WHERE artist_id=$1',[a.id])).rowCount,1);
   }
   assert.equal((await require('../lib/commerce').createCommerce({pool}).report()).summary.discrepancies,0);
  });
  await t.test('approved public customer checkout is bound to the independently verified merchant receipt',async()=>{
   Object.assign(policy,{public_enabled:true,live_acceptance_confirmed:true,successful_payment_reference:first.checkout.reference});await require('../lib/payments/monnify-runtime').proof(pool,{merchantId:env.MONNIFY_CONTRACT_CODE},policy)();
   await assert.rejects(require('../lib/payments/monnify-runtime').proof(pool,{merchantId:'9999999999'},policy)(),e=>e.status===503);
   app=await runtime({pool,env});
   assert((await api('/api/platform/payments/capabilities')).data.providers.some(x=>x.id==='monnify'));
   assert((await api('/api/platform/premium/plans')).data.live_payments);
   const order=await api('/api/platform/premium/orders',{plan:'quarterly'},listener.cookie);assert.equal(order.status,201,JSON.stringify(order.data));
   const quote=await api('/api/platform/premium/quote',{order_id:order.data.id,provider:'monnify',currency:'NGN'},listener.cookie);assert.equal(quote.status,200,JSON.stringify(quote.data));
   const checkout=await api('/api/platform/premium/checkout',{quote_id:quote.data.id},listener.cookie);assert.equal(checkout.status,200,JSON.stringify(checkout.data));assert.equal(checkout.data.checkout_status,'ready');
   assert.equal((await pool.query('SELECT 1 FROM premium_receipts WHERE order_id=$1',[order.data.id])).rowCount,0);
   paid(checkout.data);const verified=await api('/api/platform/premium/verify',{attempt_id:checkout.data.attempt_id},listener.cookie);assert.equal(verified.status,200,JSON.stringify(verified.data));assert(verified.data.active);
   assert.equal((await pool.query('SELECT 1 FROM premium_receipts WHERE order_id=$1',[order.data.id])).rowCount,1);
   const purchase=await api('/api/platform/purchases',{kind:'studio_generation',plan:'starter'},artist.cookie);assert.equal(purchase.status,201,JSON.stringify(purchase.data));
   const artistQuote=await api('/api/platform/payments/quote',{order_id:purchase.data.order.id,provider:'monnify',currency:'NGN'},artist.cookie);assert.equal(artistQuote.status,201,JSON.stringify(artistQuote.data));
   const artistPay=await api('/api/platform/checkout',{quote_id:artistQuote.data.quote.id},artist.cookie);assert.equal(artistPay.status,202,JSON.stringify(artistPay.data));paid(artistPay.data.checkout);
   const artistVerified=await api('/api/platform/payments/checkouts/'+artistPay.data.checkout.id+'/verify',{},artist.cookie);assert.equal(artistVerified.status,200,JSON.stringify(artistVerified.data));assert.equal(artistVerified.data.checkout.status,'paid');
  });
 }finally{Object.assign(policy,savedPolicy);global.fetch=original;await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
