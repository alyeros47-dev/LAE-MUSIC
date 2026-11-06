'use strict';
// Owner-authorized, read-only release support. No server startup or migrations.
const {serviceValid,inventory}=require('./audit-existing-service.cjs');
const {databaseOptions}=require('../lib/database');
const ID='srv-db84s7m89jmc73c7l9rg';
async function inspect({key=process.env.RENDER_API_KEY,fetcher=fetch,dbFactory=options=>new(require('pg').Pool)(options)}={}){
 if(!key)throw Error('Render read access is unavailable.');
 async function get(path){const r=await fetcher('https://api.render.com/v1/services/'+ID+path,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Render inspection failed.');return r.json();}
 const raw=await get(''),service=raw.service||raw;if(service.id!==ID||!serviceValid(service))throw Error('Unexpected production service.');
 const env=inventory(await get('/env-vars?limit=100')),pool=dbFactory({...databaseOptions(env),max:1});let db;
 try{
  db=await pool.connect();await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
  const rows=(await db.query("SELECT m.id,m.status,m.reference,m.product_label,m.mode,q.charge_currency, q.charge_minor,(s.payment_id IS NOT NULL) AS confirmation_submitted,(s.proof IS NOT NULL) AS receipt_available,(s.transfer_reference IS NOT NULL) AS legacy_bank_reference_available,(s.transferred_at IS NOT NULL) AS legacy_transfer_time_available,(m.guest_order_id IS NOT NULL) AS account_setup_after_payment FROM manual_bank_payments m JOIN payment_checkout_quotes q ON q.id=m.quote_id LEFT JOIN manual_bank_submissions s ON s.payment_id=m.id WHERE m.status IN ('awaiting_transfer','submitted') AND (m.listener_order_id IS NOT NULL OR EXISTS(SELECT 1 FROM guest_purchase_orders g WHERE g.id=m.guest_order_id AND g.kind='premium_listener')) ORDER BY m.created_at DESC LIMIT 20")).rows;
  const administration=(await db.query('SELECT named_enabled FROM admin_auth_settings WHERE id=1')).rows[0];
  await db.query('COMMIT');
  return {read_only:true,production_writes:0,pending_premium_payments:rows.map(r=>({...r,charge_minor:Number(r.charge_minor)})),named_admin_authentication_enabled:administration?.named_enabled===true};
 }catch(error){if(db)await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db?.release();await pool.end();}
}
if(require.main===module)inspect().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Pending-payment inspection failed. No payment or account was changed.');process.exitCode=1;});
module.exports={inspect};
