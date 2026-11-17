'use strict';
// Separate from the working collection adapter. All writes require an explicit
// server-owned enablement callback; an API key or client flag cannot enable them.
const crypto=require('node:crypto'),{fail}=require('../transactions');
const {minor,createMonnify}=require('./monnify');
const REF=/^lae-wd-[a-f0-9]{32}$/;
const states={SUCCESS:'successful',COMPLETED:'successful',FAILED:'failed',EXPIRED:'failed',REVERSED:'reversed',PENDING_AUTHORIZATION:'authorization_required',OTP_EMAIL_DISPATCH_FAILED:'authorization_required',PENDING:'pending',AWAITING_PROCESSING:'pending',IN_PROGRESS:'pending'};
function normalized(d){
 if(!d||!REF.test(d.reference||''))throw fail(502,'Monnify returned an invalid payout reference.');
 const complete=d.currency==='NGN'&&/^\d{10}$/.test(d.destinationAccountNumber||'')&&/^\d{3,9}$/.test(d.destinationBankCode||'')&&typeof d.transactionReference==='string'&&/^MFDS[|A-Za-z0-9_-]{4,156}$/.test(d.transactionReference);
 return {reference:d.reference,providerReference:typeof d.transactionReference==='string'?d.transactionReference:null,status:['successful','reversed'].includes(states[d.status||d.transactionStatus])&&!complete?'unknown':states[d.status||d.transactionStatus]||'unknown',amountMinor:minor(d.amount),currency:d.currency||null,bankCode:d.destinationBankCode||null,accountNumber:d.destinationAccountNumber||null,accountName:d.destinationAccountName||null,sourceAccount:d.sourceAccountNumber||null};
}
function create({apiKey='',secretKey='',contractCode='',baseUrl='',mode='live',sourceAccount='',allowTransfers=()=>false,fetchImpl=fetch,now=Date.now}={}){
 const auth=createMonnify({apiKey,secretKey,contractCode,baseUrl,mode,reviewed:true,fetchImpl,now}),base=String(baseUrl).replace(/\/$/,'');let token,expiry=0,flight;
 const ready=()=>{if(!auth.configured)throw fail(503,'Monnify payout credentials are not configured for this environment.');};
 async function wire(path,authorization,method='GET',data){
  let r;try{r=await fetchImpl(base+path,{method,headers:{Authorization:authorization,Accept:'application/json',...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw fail(502,'Payout confirmation is unavailable. The same reference must be checked before retrying.');}
  let body;try{let size=0,chunks=[];for await(const b of r.body){size+=b.length;if(size>256000)throw Error();chunks.push(Buffer.from(b));}body=JSON.parse(Buffer.concat(chunks).toString());}catch{throw fail(502,'Monnify returned an unreadable payout response.');}
  if(!r.ok||body?.requestSuccessful!==true||String(body?.responseCode)!=='0'||!body.responseBody){const error=fail(502,'Monnify has not confirmed this payout request. Recheck its reference.');error.providerCode=/^[A-Z0-9]{1,8}$/.test(String(body?.responseCode))?String(body.responseCode):null;throw error;}
  return body.responseBody;
 }
 async function request(path,method='GET',data){
  ready();if(!token||expiry<=now()+30000){if(!flight)flight=wire('/api/v1/auth/login','Basic '+Buffer.from(apiKey+':'+secretKey).toString('base64'),'POST').then(d=>{if(typeof d.accessToken!=='string'||!d.accessToken||d.accessToken.length>8192||!Number.isFinite(Number(d.expiresIn))||Number(d.expiresIn)<=30)throw fail(502,'Monnify payout authentication was not confirmed.');token=d.accessToken;expiry=now()+Math.min(Number(d.expiresIn),86400)*1000;}).finally(()=>{flight=null;});await flight;}
  return wire(path,'Bearer '+token,method,data);
 }
 function maySend(){ready();if(allowTransfers()!==true||!/^\d{10}$/.test(sourceAccount))throw fail(503,'Bank payouts remain disabled until merchant approval, wallet funding and payout rules are verified.');}
 async function banks(){const d=await request('/api/v1/banks');if(!Array.isArray(d))throw fail(502,'The bank list is unavailable.');return d.filter(x=>/^\d{3,9}$/.test(x.code||'')&&typeof x.name==='string').map(x=>({code:x.code,name:x.name}));}
 async function verifyAccount(accountNumber,bankCode){if(!/^\d{10}$/.test(accountNumber||'')||!/^\d{3,9}$/.test(bankCode||''))throw fail(400,'Enter a valid bank and ten-digit account number.');const d=await request('/api/v2/disbursements/account/validate?accountNumber='+encodeURIComponent(accountNumber)+'&bankCode='+encodeURIComponent(bankCode));if(d.accountNumber!==accountNumber||d.bankCode!==bankCode||typeof d.accountName!=='string'||!d.accountName.trim()||d.accountName.length>200)throw fail(502,'The bank account name could not be confirmed.');return {accountNumber,bankCode,accountName:d.accountName.trim()};}
 async function walletBalance(){if(!/^\d{10}$/.test(sourceAccount))throw fail(503,'The Monnify payout wallet is not configured.');const d=await request('/api/v2/disbursements/wallet-balance?accountNumber='+encodeURIComponent(sourceAccount));if(d.accountNumber!==sourceAccount||d.currency!=='NGN')throw fail(502,'Monnify returned a different payout wallet.');return {availableMinor:minor(d.availableBalance),currency:'NGN'};}
 async function initiate({reference,amountMinor,beneficiary}){maySend();if(!REF.test(reference||'')||!Number.isSafeInteger(amountMinor)||amountMinor<1||amountMinor>1e13||!/^\d{10}$/.test(beneficiary?.accountNumber||'')||!/^\d{3,9}$/.test(beneficiary?.bankCode||'')||typeof beneficiary?.accountName!=='string'||!beneficiary.accountName.trim()||beneficiary.accountName.length>200)throw fail(400,'Invalid payout details.');return normalized(await request('/api/v2/disbursements/single','POST',{amount:Number((amountMinor/100).toFixed(2)),reference,narration:'LAE-MUSIC affiliate withdrawal',destinationBankCode:beneficiary.bankCode,destinationAccountNumber:beneficiary.accountNumber,destinationAccountName:beneficiary.accountName,currency:'NGN',sourceAccountNumber:sourceAccount,async:true}));}
 async function status(reference){if(!REF.test(reference||''))throw fail(400,'Invalid payout reference.');const value=normalized(await request('/api/v2/disbursements/single/summary?reference='+encodeURIComponent(reference)));if(value.reference!==reference)throw fail(502,'Monnify returned a different payout reference.');return value;}
 async function authorize(reference,otp){maySend();if(!REF.test(reference||'')||!/^\d{4,10}$/.test(otp||''))throw fail(400,'Enter the provider authorization code.');await request('/api/v2/disbursements/single/validate-otp','POST',{reference,authorizationCode:otp});return status(reference);}
 async function settlement(reference){
  const payment=await auth.retrieveByReference(reference);
  if(payment.status!=='paid')throw fail(409,'The original payment is not verified as paid.');
  const d=await request('/api/v1/settlement-detail?transactionReference='+encodeURIComponent(payment.providerTransactionId)),t=d.transaction;
  const merchant=Array.isArray(d.beneficiaries)?d.beneficiaries.filter(b=>b.beneficiaryType==='MERCHANT_CONTRACT'&&String(b.beneficiaryCode)===auth.merchantId):[];
  if(!t||t.transactionReference!==payment.providerTransactionId||t.paymentReference!==reference||t.currency!==payment.currency||minor(t.amountPaid)!==payment.amountMinor||merchant.length!==1||merchant[0].settlementStatus!=='SUCCESS')throw fail(409,'The original merchant payment has not been confirmed as settled.');
  const b=merchant[0],i=b.settlementInformation;
  if(!i||typeof i.settlementReference!=='string'||!i.settlementReference||i.settlementReference.length>160||!i.settledDate)throw fail(409,'The settlement reference is unavailable.');
  const receivedMinor=Math.min(minor(t.settlementAmount),minor(b.beneficiaryIncome),minor(i.settlementAmount));
  if(receivedMinor<1||receivedMinor>payment.amountMinor)throw fail(409,'The settled payment amount needs review.');
  return {reference,paymentId:payment.id,orderId:payment.orderId,quoteId:payment.quoteId,currency:payment.currency,paidMinor:payment.amountMinor,receivedMinor,settlementReference:i.settlementReference,merchantId:auth.merchantId,mode,settled:true};
 }
 function notification(raw,headers){const e=auth.authenticate(raw,headers);if(!['SUCCESSFUL_DISBURSEMENT','FAILED_DISBURSEMENT','REVERSED_DISBURSEMENT'].includes(e.eventType)||!REF.test(e.eventData?.reference||''))throw fail(400,'Unsupported payout notification.');return {reference:e.eventData.reference,id:crypto.createHash('sha256').update(raw).digest('hex')};}
 return {configured:auth.configured,mode,merchantId:auth.merchantId,sourceAccount,banks,verifyAccount,walletBalance,initiate,status,authorize,notification,settlement};
}
module.exports={create,normalized,REF};
