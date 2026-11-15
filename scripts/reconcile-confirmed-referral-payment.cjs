'use strict';
// Repair the one identified, provider-confirmed existing checkout through the
// normal verification service. Never create a purchase or bypass receipt guards.
const {inventory,serviceValid}=require('./audit-existing-service.cjs'),{databaseOptions}=require('../lib/database');
const SERVICE='srv-db84s7m89jmc73c7l9rg',ORDER='f96c6325-140a-4584-b750-d9e230b8210c',ATTEMPT='82ab2a94-d83e-436f-8336-428868ae23c0';
async function main(){
 if(process.env.LAE_RECONCILE_IDENTIFIED_PAYMENT!=='true')throw Error('The identified payment repair must be explicitly enabled');
 const key=process.env.RENDER_API_KEY;if(!key)throw Error('Service access unavailable');
 const get=async suffix=>{const r=await fetch('https://api.render.com/v1/services/'+SERVICE+suffix,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Service read failed');return r.json();};
 const raw=await get(''),service=raw.service||raw;if(service.id!==SERVICE||!serviceValid(service))throw Error('Unexpected service');
 const rows=[];let cursor='';for(let i=0;i<10;i++){const p=await get('/env-vars?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));rows.push(...p);if(p.length<100)break;cursor=p.at(-1)?.cursor;if(!cursor)throw Error('Incomplete settings');}
 const env=inventory(rows),pool=new(require('pg').Pool)({...databaseOptions(env),max:2});
 try{
  const p=(await pool.query(`SELECT o.id,o.listener_id,o.plan,o.amount_minor,o.referrer_id,a.provider,a.mode,a.reference,q.charge_minor,q.charge_currency FROM premium_orders o JOIN premium_attempts a ON a.order_id=o.id JOIN payment_checkout_quotes q ON q.id=a.quote_id WHERE o.id=$1 AND a.id=$2`,[ORDER,ATTEMPT])).rows[0];
  if(!p||String(p.listener_id)!=='31'||p.plan!=='quarterly'||Number(p.amount_minor)!==180||String(p.referrer_id)!=='3'||p.provider!=='monnify'||p.mode!=='live'||p.charge_currency!=='NGN'||Number(p.charge_minor)!==243373)throw Error('The identified checkout no longer matches the incident');
  const gateway=require('../lib/payments/monnify-runtime').adapter(env),verified=await gateway.retrieveByReference(p.reference);
  if(verified.status!=='paid'||verified.orderId!==ORDER||verified.amountMinor!==Number(p.charge_minor)||verified.currency!==p.charge_currency)throw Error('Monnify did not independently confirm the exact original purchase');
  const before=await require('../lib/affiliate-access').status(pool,3,{mode:'live',policyRevision:require('../lib/partner-policy').PREMIUM_REVISION});
  await require('../lib/payments/monnify-control').create({pool,env}).listenerVerify(p.listener_id,ATTEMPT);
  const receipt=(await pool.query('SELECT mode,verified_at FROM premium_receipts WHERE order_id=$1',[ORDER])).rows[0],commissions=(await pool.query('SELECT beneficiary_id,level,percent,amount_minor FROM premium_commissions WHERE order_id=$1',[ORDER])).rows;
  if(!receipt||receipt.mode!=='live')throw Error('Purchase reconciliation did not produce its verified receipt');
  const account=(await pool.query('SELECT COUNT(*)::int AS count FROM premium_entitlements WHERE order_id=$1 AND listener_id=$2',[ORDER,p.listener_id])).rows[0];
  return {payment_reconciled:true,new_charge_created:false,receipt_count:1,premium_entitlement_count:account.count,referrer_id:p.referrer_id,referrer_qualified:before.qualified,referrer_participating:before.participating,commissions};
 }finally{await pool.end();}
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(JSON.stringify({reconciled:false,reason:String(e.message).replace(/https?:\/\/\S+/g,'[address omitted]').slice(0,240),http_status:e.status||null}));process.exitCode=1;});
