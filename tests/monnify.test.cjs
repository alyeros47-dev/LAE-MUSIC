'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createMonnify,minor}=require('../lib/payments/monnify');
const key='MK_PROD_isolated_fixture_only',secret='isolated_fixture_secret_not_real',contract='1000000001';
const reference='lae-10000000-0000-4000-8000-000000000001';
const quote={id:'10000000-0000-4000-8000-000000000002',order_id:'10000000-0000-4000-8000-000000000003',provider:'monnify',base_currency:'USD',charge_currency:'NGN',charge_minor:900000,expires_at:new Date(Date.now()+600000).toISOString()};
function fixture(changes={}){
 const calls=[];let state='PAID',amount='9000.00',metadata={lae_order_id:quote.order_id,lae_quote_id:quote.id},echo=reference,auths=0;
 const api=createMonnify({apiKey:key,secretKey:secret,contractCode:contract,baseUrl:'https://api.monnify.com',reviewed:true,fetchImpl:async(url,options)=>{
  calls.push({url,options});assert.equal(options.redirect,'error');assert(options.signal);
  if(url.endsWith('/auth/login')){auths++;assert.equal(options.headers.Authorization,'Basic '+Buffer.from(key+':'+secret).toString('base64'));return Response.json({requestSuccessful:true,responseCode:'0',responseBody:{accessToken:'isolated_access_token',expiresIn:3600}});}
  assert.equal(options.headers.Authorization,'Bearer isolated_access_token');
  let responseBody;
  if(url.endsWith('/init-transaction'))responseBody={paymentReference:echo,transactionReference:'MNFY|fixture|001',checkoutUrl:'https://sdk.monnify.com/checkout/fixture'};
  else if(url.includes('/transactions/query?'))responseBody={paymentReference:echo,transactionReference:'MNFY|fixture|001'};
  else{assert(url.endsWith('/api/v2/transactions/MNFY%7Cfixture%7C001'));responseBody={paymentReference:echo,transactionReference:'MNFY|fixture|001',paymentStatus:state,amountPaid:amount,currency:'NGN',metaData:metadata};}
  return Response.json({requestSuccessful:true,responseCode:'0',responseBody});
 },...changes});
 return {api,calls,auths:()=>auths,set(value){if(value.state)state=value.state;if(value.amount)amount=value.amount;if(value.metadata)metadata=value.metadata;if(value.echo)echo=value.echo;}};
}
test('Monnify uses server-only Basic authentication, caches OAuth and sends approved price/identity metadata',async()=>{
 const f=fixture();assert.equal(f.api.configured,true);assert.equal(f.api.mode,'live');const result=await f.api.initializeCheckout({quote,email:'artist@fixture.invalid',callback:'https://lae.test/workspace?tab=purchases',reference});assert.equal(result.reference,reference);
 const body=JSON.parse(f.calls[1].options.body);assert.equal(body.amount,9000);assert.equal(body.currencyCode,'NGN');assert.equal(body.contractCode,contract);assert.deepEqual(body.paymentMethods,['CARD','ACCOUNT_TRANSFER']);assert.deepEqual(body.metaData,{lae_order_id:quote.order_id,lae_quote_id:quote.id});assert(!JSON.stringify(result).includes(key));assert(!JSON.stringify(result).includes(secret));
 const [a,b]=await Promise.all([f.api.retrievePayment(reference),f.api.retrievePayment(reference)]);assert.equal(f.auths(),1);assert.equal(a.amountMinor,900000);assert.equal(a.orderId,quote.order_id);assert.deepEqual(a,b);
});
test('raw-byte HMAC is required before parsing a webhook and browser success flags carry no authority',async()=>{
 const f=fixture(),raw=Buffer.from(' {"eventType":"SUCCESSFUL_TRANSACTION","eventData":{"paymentReference":"'+reference+'","paymentStatus":"PAID"}}\n');const signature=crypto.createHmac('sha512',secret).update(raw).digest('hex');
 const event=await f.api.verifyEvent(raw,{'monnify-signature':signature});assert.equal(event.paymentId,reference);assert.equal(f.calls.length,0);
 for(const headers of [{},{'monnify-signature':'a'.repeat(128)},{'monnify-signature':[signature]}])await assert.rejects(f.api.verifyEvent(raw,headers),e=>e.status===401);
 await assert.rejects(f.api.verifyEvent(Buffer.from(raw.toString().trim()),{'monnify-signature':signature}),e=>e.status===401);
 const paid=await f.api.retrievePayment(event.paymentId);assert.equal(paid.status,'paid');assert.equal(f.calls.length,3);
});
test('non-successful, partial, expired and cancelled payments remain unpaid',async()=>{
 for(const state of ['PENDING','PARTIALLY_PAID','FAILED','CANCELLED','EXPIRED','REVERSED','OVERPAID']){const f=fixture();f.set({state,amount:'0.00'});assert.notEqual((await f.api.retrievePayment(reference)).status,'paid');}
});
test('exact minor-unit conversion rejects malformed, fractional and excessive provider amounts',()=>{
 assert.equal(minor('9000.01'),900001);assert.equal(minor('0.00'),0);for(const value of ['-1','NaN','1e3','1.001',null,'9007199254740992'])assert.throws(()=>minor(value));
});
test('payment identity and callback/checkout host checks cannot be bypassed',async()=>{
 const f=fixture();f.set({echo:'lae-different-reference-123456'});await assert.rejects(f.api.retrievePayment(reference),e=>e.status===502);
 for(const callback of ['http://lae.test','https://user:pass@lae.test'])await assert.rejects(fixture().api.initializeCheckout({quote,email:'artist@fixture.invalid',callback,reference}),e=>e.status===400);
 const hostile=fixture({fetchImpl:async url=>Response.json({requestSuccessful:true,responseCode:'0',responseBody:url.endsWith('/auth/login')?{accessToken:'fixture',expiresIn:3600}:{paymentReference:reference,transactionReference:'MNFY|fixture',checkoutUrl:'https://sdk.monnify.com.attacker.invalid/pay'}})});await assert.rejects(hostile.api.initializeCheckout({quote,email:'a@fixture.invalid',reference,callback:'https://lae.test'}),e=>e.status===502);
});
test('base URLs and test credentials cannot masquerade as live credentials; errors never echo secrets',async()=>{
 for(const changes of [{baseUrl:'https://attacker.invalid'},{baseUrl:'https://api.monnify.com/api/v1'},{apiKey:'MK_TEST_fixture'},{contractCode:'bad'},{secretKey:''}]){const f=fixture(changes);assert.equal(f.api.configured,false);await assert.rejects(f.api.retrievePayment(reference),e=>e.status===503&&!e.message.includes(secret));}
 const f=fixture({fetchImpl:async()=>{throw Error(secret);}});await assert.rejects(f.api.retrievePayment(reference),e=>e.status===502&&!e.message.includes(secret));
});
test('public runtime stays disabled when only live credentials are configured',()=>{
 const env={NODE_ENV:'production',MONNIFY_API_KEY:key,MONNIFY_SECRET_KEY:secret,MONNIFY_CONTRACT_CODE:contract,MONNIFY_BASE_URL:'https://api.monnify.com'};
 const {checkoutRuntime,premiumRuntime}=require('../lib/payments/runtime');const pool={query(){throw Error('No query');}};
 assert.equal(checkoutRuntime({pool,env}).enabled(),false);assert.deepEqual(premiumRuntime({pool,env}).capabilities().providers,[]);
 const policy=require('../config/monnify-payments.json');assert.equal(policy.public_enabled,false);assert.equal(policy.live_acceptance_confirmed,false);
 assert.equal(require('../lib/payments/monnify-runtime').approved({...policy,public_enabled:true,live_acceptance_confirmed:true}),false);
});
test('public acceptance requires an actual verified receipt, not just configuration flags',async()=>{
 const {proof}=require('../lib/payments/monnify-runtime'),policy={public_enabled:true,live_acceptance_confirmed:true,successful_payment_reference:reference};
 let query;const db={query:async sql=>{query=sql;return {rowCount:0};}};await assert.rejects(proof(db,{merchantId:contract},policy)(),e=>e.status===503);assert(query.includes("mode='live'"));await proof({query:async()=>({rowCount:1})},{merchantId:contract},policy)();
});
test('owner-only controlled checkout rejects ordinary users and stale administrator sessions',async()=>{
 const control=require('../lib/payments/monnify-control').create({pool:{query(){throw Error('Must not query');}},env:{}});
 for(const principal of [null,{role:'finance'},{role:'owner',source:'named',mfa_recent:false}])await assert.rejects(control.start(principal,'fixture_request_123456',{}),e=>e.status===403);
});
