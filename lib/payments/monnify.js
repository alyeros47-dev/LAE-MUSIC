'use strict';
const crypto=require('node:crypto');
const {fail}=require('../transactions');
const shared=require('./common');
const REFERENCE=/^laep?-[A-Za-z0-9-]{16,100}$/;
function minor(value){
 const s=String(value??'');if(!/^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$/.test(s))throw fail(502,'Invalid Monnify amount.');
 const [whole,part='']=s.split('.'),n=BigInt(whole)*100n+BigInt(part.padEnd(2,'0'));
 if(n>BigInt(Number.MAX_SAFE_INTEGER))throw fail(502,'Invalid Monnify amount.');return Number(n);
}
function createMonnify({apiKey='',secretKey='',contractCode='',baseUrl='',reviewed=false,mode='live',paymentMethods=['CARD','ACCOUNT_TRANSFER'],fetchImpl=fetch,now=Date.now}={}){
 const base=String(baseUrl).replace(/\/$/,'');
 const configured=['live','test'].includes(mode)&&base===(mode==='live'?'https://api.monnify.com':'https://sandbox.monnify.com')&&typeof apiKey==='string'&&apiKey.length>=8&&!/\s/.test(apiKey)&&typeof secretKey==='string'&&secretKey.length>=12&&/^[0-9]{6,40}$/.test(String(contractCode))&&(mode!=='live'||!/^MK_TEST_/i.test(apiKey));
 const merchantId=String(contractCode),currencies=['NGN'],checkoutHosts=mode==='live'?['sdk.monnify.com','checkout.monnify.com']:['sandbox.sdk.monnify.com'];
 let token=null,expires=0,authenticating=null;
 function ready(){if(!configured)throw fail(503,'Monnify server credentials or API address are not configured correctly.');}
 async function wire(path,authorization,method='GET',body){
  let response;try{response=await fetchImpl(base+path,{method,headers:{Authorization:authorization,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(12000)});}catch{throw fail(502,'Monnify could not be reached. Keep your payment reference and check again before retrying.');}
  if(!response.ok)throw fail(502,'Monnify could not confirm this request. Keep the reference for verification.');
  let length=0;const chunks=[];try{for await(const chunk of response.body){length+=chunk.length;if(length>256000)throw Error();chunks.push(Buffer.from(chunk));}}catch{throw fail(502,'Monnify returned an incomplete or oversized response. Keep the reference for verification.');}
  let result;try{result=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail(502,'Monnify returned an unreadable response.');}
  if(result?.requestSuccessful!==true||String(result.responseCode)!=='0'||!result.responseBody||typeof result.responseBody!=='object')throw fail(502,'Monnify did not confirm this request.');return result.responseBody;
 }
 async function accessToken(){
  ready();if(token&&expires>now()+30000)return token;
  if(!authenticating)authenticating=(async()=>{const d=await wire('/api/v1/auth/login','Basic '+Buffer.from(apiKey+':'+secretKey).toString('base64'),'POST');if(typeof d.accessToken!=='string'||!d.accessToken||d.accessToken.length>8192||!Number.isFinite(Number(d.expiresIn))||Number(d.expiresIn)<=30)throw fail(502,'Monnify authentication could not be confirmed.');token=d.accessToken;expires=now()+Math.min(Number(d.expiresIn),86400)*1000;return token;})().finally(()=>{authenticating=null;});
  return authenticating;
 }
 async function request(path,method='GET',body){return wire(path,'Bearer '+await accessToken(),method,body);}
 function authenticate(raw,headers){
  ready();if(!Buffer.isBuffer(raw)||!raw.length||raw.length>200000)throw fail(400,'Invalid Monnify notification.');
  const signature=headers?.['monnify-signature'];if(typeof signature!=='string'||! /^[a-fA-F0-9]{128}$/.test(signature)||!shared.equal(signature.toLowerCase(),crypto.createHmac('sha512',secretKey).update(raw).digest('hex')))throw fail(401,'Invalid Monnify signature.');return shared.parseEvent(raw);
 }
 async function verifyEvent(raw,headers){const e=authenticate(raw,headers);if(e.eventType!=='SUCCESSFUL_TRANSACTION'||!REFERENCE.test(e.eventData?.paymentReference||''))throw fail(400,'Unsupported Monnify payment event.');return {id:shared.eventId(e.eventType,raw),paymentId:e.eventData.paymentReference};}
 async function retrievePayment(reference){
  ready();if(typeof reference!=='string'||!REFERENCE.test(reference))throw fail(400,'Invalid Monnify payment reference.');
  const found=await request('/api/v1/merchant/transactions/query?paymentReference='+encodeURIComponent(reference));
  if(found.paymentReference!==reference||typeof found.transactionReference!=='string'||!/^MNFY\|[A-Za-z0-9|_-]{1,150}$/.test(found.transactionReference))throw fail(502,'Monnify payment identity could not be confirmed.');
  const d=await request('/api/v2/transactions/'+encodeURIComponent(found.transactionReference));
  if(d.paymentReference!==reference||d.transactionReference!==found.transactionReference||(d.contractCode!==undefined&&String(d.contractCode)!==merchantId)||d.currency!=='NGN')throw fail(502,'Monnify payment binding could not be confirmed.');
  const meta=shared.metadata(d.metaData);
  return {id:reference,providerTransactionId:d.transactionReference,reference,merchantId,mode,orderId:String(meta.lae_order_id||''),quoteId:String(meta.lae_quote_id||''),currency:d.currency,amountMinor:minor(d.amountPaid),status:d.paymentStatus==='PAID'?'paid':String(d.paymentStatus||'unknown').toLowerCase(),account_scope:'authenticated_api_key'};
 }
 async function initializeCheckout({quote,email,callback,reference}){
  ready();if(reviewed!==true)throw fail(503,'Monnify checkout is not approved.');shared.validateQuote(quote,'monnify',currencies);
  if(!REFERENCE.test(reference||'')||typeof email!=='string'||email.length>254||!email.includes('@'))throw fail(400,'Invalid checkout details.');
  const methods=paymentMethods.filter(x=>['CARD','ACCOUNT_TRANSFER','USSD','PHONE_NUMBER'].includes(x));if(!methods.length)throw fail(503,'Monnify payment methods are unavailable.');
  const d=await request('/api/v1/merchant/transactions/init-transaction','POST',{amount:Number((Number(quote.charge_minor)/100).toFixed(2)),customerName:email.split('@')[0],customerEmail:email,paymentReference:reference,paymentDescription:'LAE-MUSIC purchase',currencyCode:'NGN',contractCode:merchantId,redirectUrl:shared.callbackUrl(callback),paymentMethods:methods,metaData:{lae_order_id:quote.order_id,lae_quote_id:quote.id}});
  if(d.paymentReference!==reference||typeof d.transactionReference!=='string'||!d.transactionReference.startsWith('MNFY|'))throw fail(502,'Monnify checkout identity could not be confirmed.');
  return {reference,url:shared.redirectUrl(d.checkoutUrl,checkoutHosts)};
 }
 async function unavailableRefund(){throw fail(503,'Monnify refunds require a separately verified provider refund record.');}
 return {name:'monnify',merchantId,mode,configured,currencies,checkoutHosts,verified:configured&&reviewed===true,verifyEvent,retrievePayment,retrieveByReference:retrievePayment,initializeCheckout,retrieveRefund:unavailableRefund,submitRefund:unavailableRefund,authenticate};
}
module.exports={createMonnify,minor};
