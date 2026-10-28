'use strict';
const crypto=require('node:crypto');
const {fail}=require('../transactions');
const money=require('../currency');
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length>512||b.length>512)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function parseEvent(raw){if(!Buffer.isBuffer(raw)||!raw.length||raw.length>200000)throw fail(400,'Invalid payment event.');try{const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data;}catch{throw fail(400,'Invalid payment event JSON.');}}
function eventId(type,raw){return type+':'+crypto.createHash('sha256').update(raw).digest('hex');}
function validateQuote(q,provider,allowed){if(!q||q.provider!==provider||!/^[a-f0-9-]{36}$/.test(q.id||'')||!/^[a-f0-9-]{36}$/.test(q.order_id||'')||!(q.base_currency==='USD'||q.product_scope==='premium_listener'&&q.base_currency==='NGN'&&q.charge_currency==='NGN')||!Number.isSafeInteger(Number(q.charge_minor))||Number(q.charge_minor)<=0||new Date(q.expires_at).getTime()<=Date.now()||!Number.isFinite(new Date(q.expires_at).getTime())||!allowed.includes(q.charge_currency))throw fail(400,'A current server-issued checkout quote is required.');money.currencyCode(q.charge_currency);}
function redirectUrl(value,hosts){let url;try{url=new URL(value);}catch{throw fail(502,'The payment provider returned an invalid checkout URL.');}if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts.includes(url.hostname))throw fail(502,'The payment provider returned an unapproved checkout host.');return url.href;}
function callbackUrl(value){let u;try{u=new URL(value);}catch{throw fail(400,'Invalid payment callback URL.');}if(u.protocol!=='https:'||u.username||u.password||u.hash)throw fail(400,'The configured payment callback must use HTTPS.');return u.href;}
function metadata(value){if(value===null||value===undefined||value==='')return {};let data=value;try{if(typeof value==='string')data=JSON.parse(value);}catch{throw fail(502,'The payment provider returned invalid metadata.');}if(!data||typeof data!=='object'||Array.isArray(data))throw fail(502,'The payment provider returned invalid metadata.');return data;}
function createClient(base,key,fetchImpl=fetch){return async(path,method='GET',data)=>{
 const r=await fetchImpl(base+path,{method,headers:{Authorization:'Bearer '+key,Accept:'application/json',...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw fail(502,'The payment provider request failed. Reconcile the reference before retrying checkout.');
 let size=0;const chunks=[];for await(const chunk of r.body){size+=chunk.length;if(size>256000)throw fail(502,'The payment provider response is too large.');chunks.push(Buffer.from(chunk));}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail(502,'The payment provider returned an unreadable response.');}
 };}
module.exports={equal,parseEvent,eventId,validateQuote,redirectUrl,callbackUrl,createClient,metadata};
