'use strict';
// One owner-confirmed payment through the existing administrator API. This does
// not infer bank settlement from a screenshot or write directly to the database.
const {serviceValid,inventory}=require('./audit-existing-service.cjs');
const {databaseOptions}=require('../lib/database');
const ID='srv-db84s7m89jmc73c7l9rg',ORIGIN='https://lae-music.com';
async function approve({confirmed,reference,amountMinor,key=process.env.RENDER_API_KEY,fetcher=fetch,dbFactory=options=>new(require('pg').Pool)(options)}={}){
 if(confirmed!==true||!/^LAE-[A-F0-9]{16}$/.test(reference||'')||!Number.isSafeInteger(amountMinor)||amountMinor<1||!key)throw Error('One exact Premium payment and the owner’s bank-receipt confirmation are required.');
 async function render(path){const r=await fetcher('https://api.render.com/v1/services/'+ID+path,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Cannot read existing service configuration.');return r.json();}
 const raw=await render(''),s=raw.service||raw;if(s.id!==ID||!serviceValid(s))throw Error('Production service identity mismatch.');
 const env=inventory(await render('/env-vars?limit=100'));if(!env.ADMIN_KEY)throw Error('Existing administrator sign-in is unavailable.');
 let cookie;
 async function api(path,body){const r=await fetcher(ORIGIN+path,{method:body?'POST':'GET',headers:{Origin:ORIGIN,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(path.endsWith('/review')?{'Idempotency-Key':'owner-bank-confirmed-'+reference}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});let data;try{data=await r.json();}catch{throw Error('Administrator API returned an unreadable response.');}return {r,data};}
 let payment;
 try{
  const login=await api('/api/admin/login',{password:env.ADMIN_KEY});if(login.r.status!==200)throw Error('Existing administrator sign-in was refused; no payment approved. Use the normal owner session.');
  cookie=(login.r.headers.getSetCookie?.()||[login.r.headers.get('set-cookie')]).filter(Boolean).map(x=>x.split(';')[0]).join('; ');if(!cookie)throw Error('Administrator session was not established.');
  const list=await api('/api/platform/admin/manual-payments');if(list.r.status!==200||!Array.isArray(list.data.payments))throw Error('Cannot inspect administrator payment queue.');
  const matches=list.data.payments.filter(p=>p.reference===reference);if(matches.length!==1)throw Error('The owner-confirmed payment is not uniquely identifiable.');payment=matches[0];
  if(payment.mode!=='live'||payment.charge_currency!=='NGN'||Number(payment.charge_minor)!==amountMinor||!payment.listener_order_id||payment.guest_order_id||!payment.product_label?.startsWith('Premium listening'))throw Error('Payment does not match the confirmed direct Premium purchase and amount.');
  if(!['submitted','approved'].includes(payment.status))throw Error('This payment has no submitted receipt or has a final rejection.');
  if(payment.status==='submitted'){
   const payload={decision:'approved',receipt_verified:true,note:'Owner confirmed the matching deposit in the business bank account.'};
   // Before the receipt-UI release, use only the actual details already submitted.
   // Never substitute the LAE reference for a bank transaction or invent a date.
   if(payment.transfer_reference&&payment.transferred_at){
    const bankRef=payment.transfer_reference.toUpperCase().replace(/\s+/g,'');
    if(!/^[A-Z0-9_.:/-]{6,160}$/.test(bankRef)||bankRef===payment.reference)throw Error('The older submission needs the new receipt-only approval flow; no bank reference was invented.');
    Object.assign(payload,{bank_reference:bankRef,received_amount:(amountMinor/100).toFixed(2),currency:'NGN',received_at:payment.transferred_at});
   }
   const reviewed=await api('/api/platform/admin/manual-payments/'+payment.id+'/review',payload);if(reviewed.r.status!==200||reviewed.data.payment?.status!=='approved')throw Error('Existing payment validation did not approve the receipt; no alternate activation was attempted.');
  }
 }finally{if(cookie)await api('/api/admin/logout',{}).catch(()=>{});}
 const pool=dbFactory({...databaseOptions(env),max:1});let db;
 try{
  db=await pool.connect();await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
  const result=(await db.query("SELECT m.status,(SELECT COUNT(*)::int FROM premium_receipts pr WHERE pr.order_id=m.listener_order_id) AS receipt_count,(SELECT COUNT(*)::int FROM premium_entitlements pe WHERE pe.order_id=m.listener_order_id) AS purchased_term_count,EXISTS(SELECT 1 FROM premium_entitlements pe JOIN premium_receipts pr ON pr.order_id=pe.order_id WHERE pr.mode='live' AND pe.listener_id=o.listener_id AND pe.starts_at<=NOW() AND pe.expires_at>NOW() AND NOT EXISTS(SELECT 1 FROM premium_reversals rev WHERE rev.order_id=pe.order_id) AND NOT EXISTS(SELECT 1 FROM premium_payment_reviews hold WHERE hold.order_id=pe.order_id)) AS premium_active FROM manual_bank_payments m JOIN premium_orders o ON o.id=m.listener_order_id WHERE m.id=$1",[payment.id])).rows[0];
  await db.query('COMMIT');if(result?.status!=='approved'||result.receipt_count!==1||result.purchased_term_count!==1||!result.premium_active)throw Error('Approval needs follow-up: active Premium entitlement did not verify. Do not charge again.');
  return {payment_reference:reference,charge_currency:'NGN',charge_minor:amountMinor,status:'approved',premium_active:true,verified_receipts:1,purchased_terms:1,approval_via_existing_admin_api:true,new_payment_charges:0,direct_database_writes:0};
 }catch(error){if(db)await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db?.release();await pool.end();}
}
if(require.main===module){
 if(process.env.GITHUB_REPOSITORY!=='alyeros47-dev/LAE-MUSIC'||!['refs/heads/codex/simple-receipt-payments','refs/heads/main'].includes(process.env.GITHUB_REF))throw Error('Unexpected owner-authorized workflow identity.');
 approve({confirmed:process.env.LAE_OWNER_CONFIRMED_BANK_RECEIPT==='true',reference:process.env.LAE_CONFIRMED_PAYMENT_REFERENCE,amountMinor:Number(process.env.LAE_CONFIRMED_PAYMENT_MINOR)}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={approve};
