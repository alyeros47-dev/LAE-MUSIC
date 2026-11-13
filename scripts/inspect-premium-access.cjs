'use strict';
// Bounded, read-only diagnosis of the existing paid-listener activation path.
const {inventory,serviceValid}=require('./audit-existing-service.cjs');
const {databaseOptions}=require('../lib/database');
const SERVICE='srv-db84s7m89jmc73c7l9rg';
async function inspect(){
 const key=process.env.RENDER_API_KEY;if(!key)throw Error('Secure Render read access is unavailable.');
 const get=async suffix=>{const r=await fetch('https://api.render.com/v1/services/'+SERVICE+suffix,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Existing service configuration is unavailable.');return r.json();};
 const raw=await get(''),service=raw.service||raw;if(service.id!==SERVICE||!serviceValid(service))throw Error('Production service identity mismatch.');
 const env=inventory(await get('/env-vars?limit=100')),pool=new(require('pg').Pool)({...databaseOptions(env),max:1});let db;
 try{
  db=await pool.connect();await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
  const rows=(await db.query(`SELECT a.id AS attempt_id,a.reference,a.status,a.benefit_hold,a.created_at,o.listener_id,o.plan,l.email,q.charge_currency,q.charge_minor,r.verified_at,
   e.starts_at,e.expires_at,EXISTS(SELECT 1 FROM premium_reversals x WHERE x.order_id=o.id) AS reversed,
   EXISTS(SELECT 1 FROM premium_payment_reviews x WHERE x.order_id=o.id) AS held,
   (SELECT COUNT(*)::int FROM listener_sessions s WHERE s.listener_id=l.id AND s.expires_at>NOW()) AS active_sessions,
   (SELECT COUNT(*)::int FROM offline_devices d WHERE d.listener_id=l.id AND d.revoked_at IS NULL) AS offline_devices,
   (SELECT COUNT(*)::int FROM offline_grants g WHERE g.listener_id=l.id) AS offline_grants
   FROM premium_attempts a JOIN premium_orders o ON o.id=a.order_id JOIN listeners l ON l.id=o.listener_id
   JOIN payment_checkout_quotes q ON q.id=a.quote_id LEFT JOIN premium_receipts r ON r.order_id=o.id
   LEFT JOIN premium_entitlements e ON e.order_id=o.id
   WHERE a.provider='monnify' AND a.created_at>NOW()-INTERVAL '7 days' ORDER BY a.created_at DESC LIMIT 10`)).rows;
  await db.query('COMMIT');
  const adapter=require('../lib/payments/monnify-runtime').adapter(env);
  for(const row of rows){
   const email=row.email;row.email=email.replace(/^(.{2}).*(@.*)$/,'$1***$2');
   row.matches_owner_supplied_email=email.toLowerCase()==='laemusic067@gmail.com';
   row.active=Boolean(row.verified_at&&row.starts_at&&new Date(row.starts_at)<=new Date()&&new Date(row.expires_at)>new Date()&&!row.reversed&&!row.held);
   if(!row.verified_at){try{const payment=await adapter.retrieveByReference(row.reference);row.provider_status=payment.status;row.provider_amount_minor=payment.amountMinor;row.provider_binding_present=Boolean(payment.orderId&&payment.quoteId);}catch(e){row.provider_lookup_error=e.message;}}
  }
  return {read_only:true,production_writes:0,new_charges:0,payments:rows};
 }finally{if(db){await db.query('ROLLBACK').catch(()=>{});db.release();}await pool.end();}
}
if(require.main===module)inspect().then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{console.error('Premium access inspection could not complete; no data changed and no credentials logged.');process.exitCode=1;});
module.exports={inspect};
