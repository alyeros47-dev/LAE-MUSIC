'use strict';
// Recover one already-paid purchase through the existing verified-payment API.
const {inventory,serviceValid}=require('./audit-existing-service.cjs');
const {databaseOptions}=require('../lib/database');
const SERVICE='srv-db84s7m89jmc73c7l9rg',ORIGIN='https://lae-music.com';
const ATTEMPT='2c68609e-6405-4c5e-a7dc-309ae6f46d2b',REFERENCE='laep-6213b4f8e4932442cda65caef5edf2b96967',AMOUNT=81028;
async function reconcile(){
 const key=process.env.RENDER_API_KEY;if(!key)throw Error('Secure service access is unavailable.');
 const get=async suffix=>{const r=await fetch('https://api.render.com/v1/services/'+SERVICE+suffix,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Existing service configuration is unavailable.');return r.json();};
 const raw=await get(''),service=raw.service||raw;if(service.id!==SERVICE||!serviceValid(service))throw Error('Production identity mismatch.');
 const env=inventory(await get('/env-vars?limit=100'));if(!env.ADMIN_KEY)throw Error('Existing administrator authentication is unavailable.');
 const pool=new(require('pg').Pool)({...databaseOptions(env),max:1});let db,cookie;
 const read=async()=>{db=await pool.connect();try{await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");const row=(await db.query(`SELECT a.reference,a.order_id,a.quote_id,a.benefit_hold,o.listener_id,q.charge_currency,q.charge_minor,r.verified_at,e.expires_at,
   EXISTS(SELECT 1 FROM premium_reversals x WHERE x.order_id=o.id) AS reversed,EXISTS(SELECT 1 FROM premium_payment_reviews x WHERE x.order_id=o.id) AS held
   FROM premium_attempts a JOIN premium_orders o ON o.id=a.order_id JOIN payment_checkout_quotes q ON q.id=a.quote_id
   LEFT JOIN premium_receipts r ON r.order_id=o.id LEFT JOIN premium_entitlements e ON e.order_id=o.id
   WHERE a.id=$1 AND a.provider='monnify' AND a.mode='live'`,[ATTEMPT])).rows[0];await db.query('COMMIT');return row;}finally{await db.query('ROLLBACK').catch(()=>{});db.release();db=null;}};
 const api=async(path,body)=>{const r=await fetch(ORIGIN+path,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});const data=await r.json();if(!r.ok)throw Error('Existing payment API could not complete verification ('+r.status+').');return {r,data};};
 try{
  const row=await read();if(!row||row.reference!==REFERENCE||row.charge_currency!=='NGN'||Number(row.charge_minor)!==AMOUNT||row.benefit_hold||row.reversed||row.held)throw Error('The identified paid purchase does not match; no activation attempted.');
  if(!row.verified_at){
   const paid=await require('../lib/payments/monnify-runtime').adapter(env).retrieveByReference(REFERENCE);
   if(paid.status!=='paid'||paid.currency!=='NGN'||paid.amountMinor!==AMOUNT||paid.orderId!==row.order_id||paid.quoteId!==row.quote_id)throw Error('Monnify did not confirm the exact payment binding.');
   const login=await api('/api/admin/login',{password:env.ADMIN_KEY});cookie=(login.r.headers.getSetCookie?.()||[login.r.headers.get('set-cookie')]).filter(Boolean).map(s=>s.split(';')[0]).join('; ');if(!cookie)throw Error('No administrator session established.');
   const result=await api('/api/platform/admin/monnify/verify',{role:'listener',attempt_id:ATTEMPT});if(result.data.active!==true)throw Error('Verified payment did not produce active Premium.');
  }
  const after=await read();if(!after?.verified_at||new Date(after.expires_at)<=new Date()||after.held||after.reversed)throw Error('Active purchased membership could not be confirmed.');
  return {premium_active:true,verified_receipt:true,listener_id:after.listener_id,expires_at:after.expires_at,new_charges:0,activation_via_existing_verified_payment_api:true,direct_database_writes:0};
 }finally{if(cookie)await api('/api/admin/logout',{}).catch(()=>{});await pool.end();}
}
if(require.main===module)reconcile().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={reconcile};
