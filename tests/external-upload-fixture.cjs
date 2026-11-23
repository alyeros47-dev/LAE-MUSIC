'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const {runtime}=require('./runtime.cjs');
const uuid=()=>crypto.randomUUID();
async function fixture(){
 const target=require('./ci-database.cjs').ciDatabase(),control=new Pool({connectionString:target.href}),schema='external_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);
 const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema,max:24}),objects=new Map(),transactions=new Map(),secret='external_test_monnify_secret_only';
 const originalFetch=global.fetch;
 async function transport(url,options={}){
  const u=new URL(url);
  if(u.hostname.endsWith('.r2.cloudflarestorage.com')){
   const name=u.pathname;if(options.method==='PUT'){const chunks=[];for await(const part of options.body)chunks.push(typeof part==='number'?Buffer.from([part]):Buffer.from(part));objects.set(name,{bytes:Buffer.concat(chunks),type:options.headers['Content-Type']});return new Response(null,{status:200});}
   const saved=objects.get(name);if(!saved)return new Response(null,{status:404});
   if(options.method==='HEAD')return new Response(null,{headers:{'Content-Length':String(saved.bytes.length),'Content-Type':saved.type}});
   const range=options.headers?.Range;return new Response(range?saved.bytes.subarray(0,64):saved.bytes,{status:range?206:200,headers:{'Content-Type':saved.type,'Content-Length':String(range?Math.min(64,saved.bytes.length):saved.bytes.length)}});
  }
  assert.equal(u.hostname,'sandbox.monnify.com','Only fixture Monnify/R2 requests are allowed');let data;
  if(u.pathname.endsWith('/auth/login'))data={accessToken:'fixture-token',expiresIn:3600};
  else if(u.pathname.endsWith('/init-transaction')){const input=JSON.parse(options.body);data={paymentReference:input.paymentReference,transactionReference:'fixture-'+uuid(),checkoutUrl:'https://sandbox.sdk.monnify.com/checkout/test'};transactions.set(input.paymentReference,{...input,...data,paymentStatus:'PENDING',amountPaid:'0.00',currency:'NGN'});}
  else if(u.pathname.includes('/transactions/query')){const p=transactions.get(u.searchParams.get('paymentReference'));data=p?{paymentReference:p.paymentReference,transactionReference:p.transactionReference}:{};}
  else if(u.pathname.includes('/api/v2/transactions/'))data=[...transactions.values()].find(p=>p.transactionReference===decodeURIComponent(u.pathname.split('/').pop()))||{};
  else throw Error('Unmocked fixture request');
  return Response.json({requestSuccessful:true,responseCode:'0',responseBody:data});
 }
 global.fetch=transport;
 const adapter=require('../lib/payments/monnify').createMonnify({apiKey:'MK_TEST_external_fixture',secretKey:secret,contractCode:'1000000001',baseUrl:'https://sandbox.monnify.com',mode:'test',reviewed:true,fetchImpl:transport});
 const rates={snapshot:async()=>({id:(await pool.query('SELECT id FROM currency_rate_snapshots LIMIT 1')).rows[0].id,rates:{USD:'1',NGN:'1500'}})};
 const payments=require('../lib/payments/checkout').createCheckoutService({pool,rates,adapters:{monnify:adapter},mode:'sandbox',callbackOrigin:'https://lae.test'});
 const env={NODE_ENV:'test',ADMIN_KEY:'ExternalFixtureOwnerKey123456789',STUDIO_RELEASE_WORKER_ENABLED:'false',R2_ACCOUNT_ID:'a'.repeat(32),R2_ACCESS_KEY_ID:'fixture-key',R2_SECRET_ACCESS_KEY:'fixture-secret-only',R2_BUCKET:'external-ci'};
 let app;
 try{app=await runtime({pool,paymentService:payments,env});await require('./artist-launch-fixture.cjs').filledPromotion(pool);await pool.query("INSERT INTO currency_rate_snapshots(id,source,as_of,next_update,rates) VALUES($1,'exchangerate-api',NOW(),NOW()+INTERVAL '1 day',$2)",[uuid(),JSON.stringify({USD:'1',NGN:'1500'})]);}catch(error){global.fetch=originalFetch;await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();throw error;}
 async function api(path,body,cookie,key=uuid(),method=body===undefined?'GET':'POST',extra={}){const r=await app.request(path,{method,body,headers:{...(cookie?{cookie}:{}),'content-type':'application/json','idempotency-key':key,...extra}});return {status:r.status,data:()=>r.json(),text:r.text,headers:r.headers,cookie:[r.headers['set-cookie']||[]].flat().map(v=>v.split(';')[0]).join('; ')};}
 async function register(name,ref){const r=await api('/api/register',{name,email:name.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'@external-ci.invalid',country:'Nigeria',password:'ExternalFixturePass123',confirmPassword:'ExternalFixturePass123',plan:'starter',...(ref?{ref:String(ref)}:{})});assert.equal(r.status,201,r.text);const user={id:r.data().user.id,cookie:r.cookie};const a=require('../lib/creator-agreement').disclosure();assert.equal((await api('/api/platform/membership/agreement',{accepted:true,version:a.version,content_hash:a.content_hash},user.cookie)).status,200);return user;}
 async function prepare(user,plan='starter',kind='external_upload_subscription'){
  const order=await api('/api/platform/purchases',{kind,plan},user.cookie);assert.equal(order.status,201,order.text);
  const q=await payments.prepare(user.id,{order_id:order.data().order.id,provider:'monnify',currency:'NGN'}),checkout=await payments.start(user.id,uuid(),{quote_id:q.id});return {order:order.data().order,checkout};
 }
 async function verified(purchase){const p=transactions.get(purchase.checkout.reference);p.paymentStatus='PAID';p.amountPaid=p.amount;const raw=Buffer.from(JSON.stringify({eventType:'SUCCESSFUL_TRANSACTION',eventData:{paymentReference:p.paymentReference,transactionReference:p.transactionReference}}));const headers={'monnify-signature':crypto.createHmac('sha512',secret).update(raw).digest('hex')};return {raw,headers,result:await payments.webhook('monnify',raw,headers)};}
 async function buy(user,plan='starter',kind='external_upload_subscription'){const p=await prepare(user,plan,kind);const verifiedPayment=await verified(p);assert.equal(verifiedPayment.result.outcome,'accepted',JSON.stringify(verifiedPayment.result));return {...p,...verifiedPayment};}
 async function upload(user,code,title,bytes){const hash=crypto.createHash('sha256').update(bytes).digest('hex');const start=await api('/api/music/upload/start',{uploadCode:code,title,genre:'Afrobeat',description:'Original external recording',audioMime:'audio/mpeg',audioBytes:bytes.length,coverBytes:null,rightsConfirmed:true,audioSha256:hash},user.cookie);if(start.status!==201)return start;const put=await api(start.data().audioUrl,bytes,user.cookie,uuid(),'PUT',{'content-type':'audio/mpeg','content-length':String(bytes.length)});if(put.status!==200)return put;return api('/api/music/upload/finish',{id:start.data().id},user.cookie);}
 async function close(){global.fetch=originalFetch;await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
 return {pool,app,env,objects,transactions,payments,api,register,prepare,verified,buy,upload,close,uuid};
}
module.exports={fixture};
