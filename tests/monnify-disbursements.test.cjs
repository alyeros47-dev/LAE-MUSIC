'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {create,normalized}=require('../lib/payments/monnify-disbursements');
const reference='lae-wd-'+'a'.repeat(32),secret='sandbox_fixture_secret_not_live',beneficiary={accountNumber:'0123456789',bankCode:'058',accountName:'Sandbox Customer'};
function fixture(enabled=true){
 const calls=[];let state='SUCCESS',failTransfer=false;
 const api=create({apiKey:'MK_TEST_fixture_key',secretKey:secret,contractCode:'1000000001',baseUrl:'https://sandbox.monnify.com',sourceAccount:'9999999999',mode:'test',allowTransfers:()=>enabled,fetchImpl:async(url,o)=>{
  assert(url.startsWith('https://sandbox.monnify.com/api/'));calls.push({url,method:o.method,body:o.body&&JSON.parse(o.body)});let d;
  if(url.endsWith('/auth/login'))d={accessToken:'sandbox-only-token',expiresIn:3600};
  else {assert.equal(o.headers.Authorization,'Bearer sandbox-only-token');
   if(url.endsWith('/banks'))d=[{code:'058',name:'Fixture Bank'}];
   else if(url.includes('/account/validate?'))d=beneficiary;
   else if(url.includes('/wallet-balance?'))d={accountNumber:'9999999999',currency:'NGN',availableBalance:1000};
   else {if(url.endsWith('/single')&&failTransfer)throw Error('A response was lost after submission');d={reference,transactionReference:'MFDS-fixture-001',status:state,amount:97,currency:'NGN',destinationAccountNumber:beneficiary.accountNumber,destinationAccountName:beneficiary.accountName,destinationBankCode:beneficiary.bankCode,sourceAccountNumber:'9999999999'};}
  }
  return Response.json({requestSuccessful:true,responseCode:'0',responseBody:d});
 }});return {api,calls,state:s=>{state=s;},loseTransferResponse:()=>{failTransfer=true;}};
}
test('payout reads use the documented sandbox name enquiry, wallet and status APIs',async()=>{
 const f=fixture();assert.deepEqual(await f.api.banks(),[{code:'058',name:'Fixture Bank'}]);assert.deepEqual(await f.api.verifyAccount(beneficiary.accountNumber,beneficiary.bankCode),beneficiary);assert.equal((await f.api.walletBalance()).availableMinor,100000);
 const s=await f.api.status(reference);assert.equal(s.status,'successful');assert.equal(s.amountMinor,9700);assert.equal(f.calls.filter(c=>c.url.endsWith('/auth/login')).length,1);assert(f.calls.some(c=>c.url.includes('/api/v2/disbursements/account/validate?')));
});
test('disabled transfers perform no provider request and cannot be enabled with caller data',async()=>{
 const f=fixture(false);await assert.rejects(f.api.initiate({reference,amountMinor:9700,beneficiary,enabled:true,verified:true}),e=>e.status===503);assert.equal(f.calls.length,0);
});
test('initiation sends the exact server-approved Naira amount and verified beneficiary',async()=>{
 const f=fixture();await f.api.initiate({reference,amountMinor:9700,beneficiary});const c=f.calls.find(c=>c.url.endsWith('/single'));assert.deepEqual(c.body,{amount:97,reference,narration:'LAE-MUSIC affiliate withdrawal',destinationBankCode:'058',destinationAccountNumber:'0123456789',destinationAccountName:'Sandbox Customer',currency:'NGN',sourceAccountNumber:'9999999999',async:true});assert.equal(c.method,'POST');assert(!JSON.stringify(c.body).includes(secret));
});
for(const [provider,status]of [['PENDING','pending'],['IN_PROGRESS','pending'],['AWAITING_PROCESSING','pending'],['PENDING_AUTHORIZATION','authorization_required'],['OTP_EMAIL_DISPATCH_FAILED','authorization_required'],['SUCCESS','successful'],['COMPLETED','successful'],['FAILED','failed'],['EXPIRED','failed'],['REVERSED','reversed'],['NEW_UNDOCUMENTED_STATE','unknown']])test('provider state remains distinct: '+provider,async()=>{const f=fixture();f.state(provider);assert.equal((await f.api.status(reference)).status,status);});
test('lost initiation response is uncertain; it does not cause an automatic second transfer',async()=>{
 const f=fixture();f.loseTransferResponse();await assert.rejects(f.api.initiate({reference,amountMinor:9700,beneficiary}),e=>e.status===502);assert.equal(f.calls.filter(c=>c.url.endsWith('/single')).length,1);assert.equal((await f.api.status(reference)).status,'successful');assert.equal(f.calls.filter(c=>c.url.endsWith('/single')).length,1);
});
test('provider OTP authorization is followed by status retrieval and never returned or stored',async()=>{
 const f=fixture();assert.equal((await f.api.authorize(reference,'123456')).status,'successful');const auth=f.calls.find(c=>c.url.endsWith('/validate-otp'));assert.deepEqual(auth.body,{reference,authorizationCode:'123456'});assert(f.calls.at(-1).url.includes('/single/summary?'));
});
test('signed payout webhooks identify the existing reference without confirming a bank credit',()=>{
 const f=fixture();for(const eventType of ['SUCCESSFUL_DISBURSEMENT','FAILED_DISBURSEMENT','REVERSED_DISBURSEMENT']){const raw=Buffer.from(JSON.stringify({eventType,eventData:{reference}}));const n=f.api.notification(raw,{'monnify-signature':crypto.createHmac('sha512',secret).update(raw).digest('hex')});assert.equal(n.reference,reference);assert(!Object.hasOwn(n,'paid'));assert(!Object.hasOwn(n,'status'));}assert.equal(f.calls.length,0);
});
test('malformed or unknown provider states do not invent a successful transfer',()=>{assert.throws(()=>normalized({reference:'unmatched'}));assert.equal(normalized({reference,amount:1,status:'UNRECOGNIZED'}).status,'unknown');});

test('a success or reversal label without complete transfer identity stays unconfirmed',()=>{for(const status of ['SUCCESS','COMPLETED','REVERSED'])assert.equal(normalized({reference,amount:1,status}).status,'unknown');});
test('funding reads the actual merchant settlement, not a payment-success flag or webhook claim',async()=>{
 const paymentRef='laep-'+'c'.repeat(32),oid='10000000-0000-4000-8000-000000000001',qid='10000000-0000-4000-8000-000000000002',calls=[];let settlementState='SUCCESS';
 const api=create({apiKey:'MK_TEST_fixture_key',secretKey:secret,contractCode:'1000000001',baseUrl:'https://sandbox.monnify.com',mode:'test',fetchImpl:async(url,o)=>{
  calls.push({url,method:o.method});let d;
  if(url.endsWith('/auth/login'))d={accessToken:'fixture-token',expiresIn:3600};
  else if(url.includes('/transactions/query?'))d={paymentReference:paymentRef,transactionReference:'MNFY|fixture|001'};
  else if(url.includes('/api/v2/transactions/'))d={paymentReference:paymentRef,transactionReference:'MNFY|fixture|001',currency:'NGN',amountPaid:'2700.00',paymentStatus:'PAID',metaData:{lae_order_id:oid,lae_quote_id:qid}};
  else if(url.includes('/settlement-detail?'))d={transaction:{paymentReference:paymentRef,transactionReference:'MNFY|fixture|001',currency:'NGN',amountPaid:'2700.00',settlementAmount:'2690.00'},beneficiaries:[{beneficiaryType:'MERCHANT_CONTRACT',beneficiaryCode:'1000000001',beneficiaryIncome:'2690.00',settlementStatus:settlementState,settlementInformation:{settlementReference:'settlement-fixture',settledDate:'17/11/2026',settlementAmount:'2690.00'}}]};else throw Error('Unexpected endpoint');
  return Response.json({requestSuccessful:true,responseCode:'0',responseBody:d});
 }});
 const proof=await api.settlement(paymentRef);assert.equal(proof.settled,true);assert.equal(proof.receivedMinor,269000);assert.equal(proof.paidMinor,270000);assert.equal(proof.orderId,oid);assert.equal(proof.currency,'NGN');assert(calls.every(c=>c.method==='GET'||c.url.endsWith('/auth/login')));
 settlementState='PENDING';await assert.rejects(api.settlement(paymentRef),e=>e.status===409);
});
