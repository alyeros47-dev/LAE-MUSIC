'use strict';
const crypto=require('node:crypto');
const {fail}=require('./transactions');
const money=require('./currency'),PLANS=require('./plans');
const SOURCE='exchangerate-api',ENDPOINT='https://open.er-api.com/v6/latest/USD',MAX_AGE=36*3600000;
function validate(data,now){
 if(!data||data.result!=='success'||data.base_code!=='USD'||!data.rates||data.rates.USD!==1||!Number.isSafeInteger(data.time_last_update_unix)||!Number.isSafeInteger(data.time_next_update_unix))throw fail(503,'Exchange rates are unavailable.');
 const at=data.time_last_update_unix*1000,next=data.time_next_update_unix*1000;
 if(at>now+300000||now-at>MAX_AGE||next<=at||next-at>48*3600000||next>now+48*3600000)throw fail(503,'Exchange rates are out of date.');
 const rates={};for(const {code}of money.options().currencies){const r=data.rates[code];if(typeof r==='number'&&Number.isFinite(r)&&r>0&&r<=1e9)rates[code]=String(r);}
 if(rates.USD!=='1')throw fail(503,'Invalid USD reference rate.');
 return {id:crypto.randomUUID(),source:SOURCE,as_of:new Date(at).toISOString(),next_update:new Date(next).toISOString(),rates};
}
async function boundedJson(response){if(!response.ok)throw fail(503,'The exchange-rate service is unavailable.');if(Number(response.headers?.get('content-length'))>512000)throw fail(503,'Invalid exchange-rate response.');let size=0;const chunks=[];for await(const part of response.body){size+=part.length;if(size>512000)throw fail(503,'Invalid exchange-rate response.');chunks.push(Buffer.from(part));}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail(503,'Invalid exchange-rate response.');}}
function createExchangeRates({pool=null,fetchImpl=fetch,now=Date.now,env=process.env}={}){
 let cached=null,inFlight=null,nextTry=0,loaded=false;
 const fresh=s=>s&&now()-new Date(s.as_of).getTime()<=MAX_AGE&&new Date(s.as_of).getTime()<=now()+300000;
 async function snapshot(){
  if(env.FX_RATE_SOURCE==='disabled')throw fail(503,'Currency conversion is temporarily unavailable.');
  if(env.FX_RATE_SOURCE&&!['exchangerate-api','disabled'].includes(env.FX_RATE_SOURCE))throw fail(503,'The configured exchange-rate source is unsupported.');
  if(!loaded&&pool){loaded=true;const r=await pool.query('SELECT id,source,as_of,next_update,rates FROM currency_rate_snapshots WHERE source=$1 ORDER BY as_of DESC LIMIT 1',[SOURCE]);if(r.rowCount)cached=r.rows[0];}
  if(fresh(cached)&&now()<new Date(cached.next_update).getTime()+300000)return cached;
  if(inFlight)return inFlight;
  if(now()<nextTry){if(fresh(cached))return cached;throw fail(503,'Currency conversion is temporarily unavailable.');}
  nextTry=now()+3600000;
  inFlight=(async()=>{
   try{const response=await fetchImpl(ENDPOINT,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});const s=validate(await boundedJson(response),now());
    if(pool){const result=await pool.query('INSERT INTO currency_rate_snapshots(id,source,as_of,next_update,rates) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source,as_of) DO NOTHING RETURNING id,source,as_of,next_update,rates',[s.id,s.source,s.as_of,s.next_update,JSON.stringify(s.rates)]);if(result.rowCount)cached=result.rows[0];else cached=(await pool.query('SELECT id,source,as_of,next_update,rates FROM currency_rate_snapshots WHERE source=$1 AND as_of=$2',[SOURCE,s.as_of])).rows[0];}else cached=s;
    return cached;
   }catch{if(fresh(cached))return cached;throw fail(503,'Currency conversion is temporarily unavailable. USD prices remain valid.');}finally{inFlight=null;}
  })();return inFlight;
 }
 async function pricing({country,currency,locale='en'}={}){
  currency=money.selectCurrency(country,currency);if(typeof locale!=='string'||locale.length>40)throw fail(400,'Invalid display language.');try{new Intl.NumberFormat(locale);}catch{throw fail(400,'Invalid display language.');}
  let s=null,error=null;if(currency!=='USD'){try{s=await snapshot();if(!s.rates[currency])error='No current rate is available for this currency.';}catch{error='Local estimates are temporarily unavailable. USD prices remain valid.';}}
  const products={};for(const [plan,p]of Object.entries(PLANS))for(const kind of ['artist_subscription','studio_generation']){const usd=Math.round((kind==='artist_subscription'?p.usd:p.additionalGenerationUsd)*100),local=currency==='USD'?usd:!error&&s?money.convertUsd(usd,s.rates[currency],currency):null;products[kind+':'+plan]={usd_minor:usd,currency,local_minor:local,fraction_digits:money.fractionDigits(currency),formatted:local===null?null:money.format(local,currency,locale)};}
  for(const p of require('./premium-pricing').catalog().plans){const local=currency==='USD'?p.usd_minor:!error&&s?money.convertUsd(p.usd_minor,s.rates[currency],currency):null;products['premium_listener:'+p.code]={usd_minor:p.usd_minor,currency,local_minor:local,price_status:p.price_status,fraction_digits:money.fractionDigits(currency),formatted:local===null?null:money.format(local,currency,locale)};}
  return {base_currency:'USD',display_currency:currency,country:country||null,display_only:true,conversion_available:!error,as_of:s?.as_of||null,source:s?{name:'ExchangeRate-API',url:'https://www.exchangerate-api.com'}:null,notice:error||'Local prices are estimates. The payment currency and total must be confirmed before checkout.',products};
 }
 return {snapshot,pricing};
}
module.exports={createExchangeRates,validate,MAX_AGE};
