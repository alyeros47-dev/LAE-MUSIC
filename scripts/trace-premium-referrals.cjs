'use strict';
// Read-only incident trace. No server startup, migration, receipt verification,
// entitlement activation or financial write. Secret values and emails omitted.
const {inventory,serviceValid}=require('./audit-existing-service.cjs'),{databaseOptions}=require('../lib/database');
const SERVICE='srv-db84s7m89jmc73c7l9rg';
async function trace(){
 const key=process.env.RENDER_API_KEY;if(!key)throw Error('Render read access unavailable');
 const get=async suffix=>{const r=await fetch('https://api.render.com/v1/services/'+SERVICE+suffix,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Service inspection failed');return r.json();};
 const raw=await get(''),service=raw.service||raw;if(service.id!==SERVICE||!serviceValid(service))throw Error('Unexpected service');
 const rows=[];let cursor='';for(let i=0;i<10;i++){const page=await get('/env-vars?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));rows.push(...page);if(page.length<100)break;cursor=page.at(-1)?.cursor;if(!cursor)throw Error('Incomplete settings');}
 const env=inventory(rows),pool=new(require('pg').Pool)({...databaseOptions(env),max:1});let db;
 try{
  db=await pool.connect();await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
  const payments=(await db.query(`SELECT o.id,o.listener_id,o.plan,o.days,o.amount_minor,o.referrer_id,o.indirect_id,o.affiliate_policy_revision,r.verified_at,r.provider,r.mode,l.referred_by AS registration_referrer_id,k.artist_id AS linked_artist_id,COALESCE(rp.policy_revision,o.affiliate_policy_revision) AS effective_revision
   FROM premium_orders o JOIN premium_receipts r ON r.order_id=o.id JOIN listeners l ON l.id=o.listener_id LEFT JOIN account_role_links k ON k.listener_id=l.id LEFT JOIN affiliate_receipt_policies rp ON rp.premium_order_id=o.id
   WHERE r.mode='live' AND r.verified_at>NOW()-INTERVAL '48 hours' ORDER BY r.verified_at DESC LIMIT 8`)).rows;
  const report=[];
  for(const p of payments){
   const commissions=(await db.query('SELECT beneficiary_id,level,percent,amount_minor FROM premium_commissions WHERE order_id=$1',[p.id])).rows;
   const team=(await db.query('SELECT team_leader_id,reserved_minor,policy_revision FROM premium_quarterly_team_sales WHERE order_id=$1',[p.id])).rows;
   const opportunity=(await db.query('SELECT direct_referrer_id,allocation_status,eligibility_snapshot FROM affiliate_purchase_opportunities WHERE premium_order_id=$1',[p.id])).rows[0]||null;
   const eligibility=p.referrer_id?await require('../lib/affiliate-access').status(db,p.referrer_id,{at:p.verified_at,mode:p.mode,policyRevision:p.effective_revision}):null;
   const current=p.referrer_id?await require('../lib/affiliate-access').status(db,p.referrer_id,{mode:p.mode,policyRevision:p.effective_revision}):null;
   const compact=x=>x?{qualified:x.qualified,participating:x.participating,eligible:x.eligible,participation_at:x.participation_at,qualifying_purchase:x.qualifying_purchase?{product:x.qualifying_purchase.product,plan:x.qualifying_purchase.plan,order_id:x.qualifying_purchase.order_id,verified_at:x.qualifying_purchase.verified_at}:null}:null;
   report.push({...p,commissions,quarterly_team:team,unallocated_opportunity:opportunity,referrer_at_payment:compact(eligibility),referrer_now:compact(current)});
  }
  const recentPremium=(await db.query(`SELECT o.id,o.listener_id,o.plan,o.amount_minor,o.referrer_id,o.indirect_id,o.created_at,l.referred_by AS registration_referrer_id,encode(sha256(convert_to(l.email,'UTF8')),'hex') AS buyer_email_digest,a.id AS attempt_id,a.provider,a.mode,a.status,a.reference,(r.order_id IS NOT NULL) AS verified FROM premium_orders o JOIN listeners l ON l.id=o.listener_id LEFT JOIN premium_attempts a ON a.order_id=o.id LEFT JOIN premium_receipts r ON r.order_id=o.id WHERE o.created_at>NOW()-INTERVAL '24 hours' ORDER BY o.created_at DESC LIMIT 12`)).rows;
  const recentArtist=(await db.query(`SELECT o.id,o.artist_id,o.kind,o.plan,o.amount_minor,o.created_at,encode(sha256(convert_to(c.email,'UTF8')),'hex') AS buyer_email_digest,s.direct_referrer_id,a.id AS attempt_id,a.provider,a.mode,a.status,a.reference,(r.order_id IS NOT NULL) AS verified FROM commerce_orders o JOIN creators c ON c.id=o.artist_id LEFT JOIN commerce_order_referral_snapshots s ON s.order_id=o.id LEFT JOIN payment_checkout_attempts a ON a.order_id=o.id LEFT JOIN commerce_receipts r ON r.order_id=o.id WHERE o.created_at>NOW()-INTERVAL '24 hours' ORDER BY o.created_at DESC LIMIT 12`)).rows;
  const gateway=require('../lib/payments/monnify-runtime').adapter(env);let lookups=0;
  for(const o of [...recentPremium,...recentArtist]){if(o.provider==='monnify'&&!o.verified&&lookups<6){lookups++;try{const paid=await gateway.retrieveByReference(o.reference);o.provider_readback={status:paid.status,amount_minor:paid.amountMinor,order_matches:paid.orderId===o.id};}catch{o.provider_readback={status:'lookup_unavailable'};}}if(o.reference){o.reference_suffix=o.reference.slice(-6);delete o.reference;}}
  const initial=(await db.query(`SELECT m.status,m.mode,o.listener_id,o.id AS order_id,k.artist_id,r.verified_at FROM manual_bank_payments m JOIN premium_orders o ON o.id=m.listener_order_id LEFT JOIN account_role_links k ON k.listener_id=o.listener_id LEFT JOIN premium_receipts r ON r.order_id=o.id WHERE m.reference=$1`,['LAE-69C499AABEAC7652'])).rows;
  await db.query('COMMIT');return {read_only:true,production_writes:0,application_mode:require('../lib/affiliate-access').modeForEnv(env),payments:report,recent_premium_orders:recentPremium,recent_artist_orders:recentArtist,provider_status_lookups:lookups,owner_confirmed_first_payment:initial};
 }catch(error){if(db)await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db?.release();await pool.end();}
}
if(require.main===module)trace().then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{console.error('Read-only referral trace could not complete. No payment, account or commission was changed; private values omitted.');process.exitCode=1;});
module.exports={trace};
