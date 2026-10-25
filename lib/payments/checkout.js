'use strict';
const crypto=require('node:crypto');
const {fail,transaction,idempotent,audit}=require('../transactions');
const {createCommerce}=require('../commerce');
const {createCheckoutQuotes}=require('./quotes');
const {redirectUrl}=require('./common');
const merchant=require('../../config/payment-merchant.json');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const PROVIDERS=['paystack','flutterwave'];
function createCheckoutService({pool,rates,adapters={},mode='disabled',merchantCountry=merchant.merchant_country,callbackOrigin=''}={}){
 let origin='';try{const u=new URL(callbackOrigin);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.pathname==='/'&&!u.search&&!u.hash&&u.hostname.replace(/\.$/,'')!=='lae-music.onrender.com')origin=u.origin;}catch{}
 function account(provider){const a=Object.hasOwn(adapters,provider)?adapters[provider]:null;return a&&a.name===provider&&a.configured&&a.verified&&a.mode==='test'&&typeof a.verifyEvent==='function'&&typeof a.retrievePayment==='function'&&typeof a.merchantId==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(a.merchantId)&&Array.isArray(a.currencies)&&a.currencies.some(c=>['NGN','USD'].includes(c))&&typeof a.initializeCheckout==='function'&&typeof a.retrieveByReference==='function'?a:null;}
 function enabled(){return !!pool&&mode==='sandbox'&&merchantCountry==='NG'&&!!origin&&PROVIDERS.some(p=>account(p));}
 function ensure(){if(!enabled())throw fail(503,'Payments are not connected. No money was charged. Verified sandbox account setup is required before checkout opens.');}
 function capabilities(){return {enabled:enabled(),mode:enabled()?'sandbox':'disabled',live_enabled:false,merchant_country:merchantCountry,base_currency:'USD',providers:enabled()?PROVIDERS.filter(p=>account(p)).map(p=>({id:p,name:p==='paystack'?'Paystack':'Flutterwave',currencies:(account(p).currencies||[]).filter(c=>['NGN','USD'].includes(c))})):[]};}
 const quotes=createCheckoutQuotes({pool,rates,accounts:Object.fromEntries(PROVIDERS.map(p=>[p,{configured:!!account(p),currencies:(account(p)?.currencies||[]).filter(c=>['NGN','USD'].includes(c))}]))});
 const binding={
  async validate(db,{order,payment,adapter}){
   if(!order||!UUID.test(payment.quoteId||''))return {ok:false,reason:'checkout_quote_missing'};
   const result=await db.query('SELECT a.*,q.charge_currency,q.charge_minor,q.base_currency,q.base_minor,q.expires_at,q.expires_at>NOW() AS quote_current FROM payment_checkout_attempts a JOIN payment_checkout_quotes q ON q.id=a.quote_id WHERE a.order_id=$1 FOR UPDATE OF a',[order.id]);
   const a=result.rows[0];if(!a)return {ok:false,reason:'checkout_attempt_missing'};
   if(a.quote_id!==payment.quoteId||a.reference!==payment.reference||a.provider!==adapter.name||a.merchant_id!==adapter.merchantId||a.mode!==payment.mode||payment.mode!=='test')return {ok:false,reason:'checkout_binding_mismatch'};
   if(!a.quote_current&&a.status!=='paid')return {ok:false,reason:'checkout_quote_expired'};
   return {ok:true,currency:a.charge_currency,amountMinor:Number(a.charge_minor),attempt:a};
  },
  async fulfill(db,{order,payment,adapter,binding}){
   const a=binding.attempt;
   await db.query('INSERT INTO payment_presentments(order_id,attempt_id,quote_id,provider,merchant_id,payment_id,reference,mode,base_currency,base_minor,charge_currency,charge_minor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[order.id,a.id,a.quote_id,adapter.name,adapter.merchantId,payment.id,payment.reference,'test',order.currency,order.amount_minor,payment.currency,payment.amountMinor]);
   await db.query("UPDATE payment_checkout_attempts SET status='paid',failure_code=NULL,updated_at=NOW() WHERE id=$1",[a.id]);
   await audit(db,{type:'provider',id:adapter.name},'checkout.verified',a.id,{reference:payment.reference,charge_currency:payment.currency,charge_minor:payment.amountMinor,base_currency:order.currency,base_minor:Number(order.amount_minor),mode:'test'});
  }
 };
 const refunds=require('./refunds').createRefunds({pool,account,ensure});
 const services=Object.fromEntries(PROVIDERS.map(p=>[p,createCommerce({pool,adapter:account(p),checkoutBinding:binding})]));
 async function prepare(artistId,input){ensure();if(!input||typeof input!=='object'||Array.isArray(input))throw fail(400,'Invalid checkout details.');return quotes.prepare(artistId,String(input.order_id||''),input.provider,input.currency);}
 async function status(artistId,id){
  if(!UUID.test(id||''))throw fail(400,'Invalid checkout reference.');
  const q=await pool.query('SELECT a.id,a.order_id,a.provider,a.quote_id,a.reference,a.status,a.mode,a.checkout_url,a.failure_code,a.created_at,q.charge_currency,q.charge_minor,q.base_currency,q.base_minor,q.expires_at,q.expires_at>NOW() AS quote_current FROM payment_checkout_attempts a JOIN commerce_orders o ON o.id=a.order_id JOIN payment_checkout_quotes q ON q.id=a.quote_id WHERE a.id=$1 AND o.artist_id=$2',[id,artistId]);
  if(!q.rowCount)throw fail(404,'Your checkout reference was not found.');return publicStatus(q.rows[0]);
 }
 function publicStatus(a){const pending=a.status==='initializing'&&(Date.now()-new Date(a.created_at).getTime()>30000);
  return {...a,status:pending||a.status==='ready'&&!a.quote_current?'review':a.status,checkout_url:a.status==='ready'&&a.quote_current?a.checkout_url:null,notice:a.status==='paid'?'Sandbox payment verified. This is not a real-money transaction.':a.status==='review'||pending||!a.quote_current?'Payment is not confirmed. Keep this reference and check its status before starting another payment.':'Sandbox checkout only. No real money is requested.'};
 }
 async function start(artistId,key,input){
  ensure();if(!input||!UUID.test(input.quote_id||''))throw fail(400,'A valid server-issued checkout quote is required.');
  let claim=null;
  const saved=await transaction(pool,async db=>{
   const actor=await db.query('SELECT id,email FROM creators WHERE id=$1 FOR UPDATE',[artistId]);if(!actor.rowCount)throw fail(401,'Artist sign-in required.');
   return idempotent(db,'checkout:'+artistId,key,{quote_id:input.quote_id},async()=>{
    const q=await db.query('SELECT q.*,o.artist_id,o.status AS order_status,o.expires_at>NOW() AS order_current,q.expires_at>NOW() AS quote_current FROM payment_checkout_quotes q JOIN commerce_orders o ON o.id=q.order_id WHERE q.id=$1 AND o.artist_id=$2 FOR UPDATE OF o',[input.quote_id,artistId]);
    if(!q.rowCount)throw fail(404,'Your checkout quote was not found.');const quote=q.rows[0];
    const old=await db.query('SELECT id,quote_id FROM payment_checkout_attempts WHERE order_id=$1',[quote.order_id]);
    if(old.rowCount){if(old.rows[0].quote_id!==quote.id)throw fail(409,'A checkout already exists for this purchase. Reconcile its reference before changing provider or currency.');return {id:old.rows[0].id};}
    const adapter=account(quote.provider);if(!adapter||!adapter.currencies.includes(quote.charge_currency)||!['NGN','USD'].includes(quote.charge_currency))throw fail(503,'This charge currency is unavailable for the verified account.');
    if(!quote.quote_current||!quote.order_current||quote.order_status!=='pending')throw fail(409,'This purchase quote expired or is unavailable.');
    if(quote.provider==='paystack'&&Number(quote.charge_minor)<(quote.charge_currency==='NGN'?5000:200))throw fail(409,'The quoted amount is below this provider’s currency minimum.');
    const id=crypto.randomUUID(),reference='lae-'+crypto.randomUUID();
    await db.query("INSERT INTO payment_checkout_attempts(id,order_id,quote_id,provider,merchant_id,merchant_country,mode,reference) VALUES($1,$2,$3,$4,$5,'NG','test',$6)",[id,quote.order_id,quote.id,quote.provider,adapter.merchantId,reference]);
    await audit(db,{type:'artist',id:artistId},'checkout.reserve',id,{provider:quote.provider,reference,quote_id:quote.id,mode:'test'});
    claim={id,reference,quote,adapter,email:actor.rows[0].email};return {id};
   });
  });
  if(claim){
   try{
    const link=await claim.adapter.initializeCheckout({quote:claim.quote,email:claim.email,reference:claim.reference,callback:origin+'/workspace?tab=purchases&checkout='+claim.id});
    if(link.reference!==claim.reference)throw Error('Provider reference mismatch');
    const safeUrl=redirectUrl(link.url,claim.quote.provider==='paystack'?['checkout.paystack.com']:['checkout.flutterwave.com']);
    await transaction(pool,async db=>{const r=await db.query("UPDATE payment_checkout_attempts SET status='ready',checkout_url=$2,updated_at=NOW() WHERE id=$1 AND status='initializing' RETURNING id",[claim.id,safeUrl]);if(r.rowCount)await audit(db,{type:'provider',id:claim.quote.provider},'checkout.ready',claim.id,{reference:claim.reference});});
   }catch{
    // Includes a provider timeout, a process crash on persistence, or a definite rejection.
    // A second POST or gateway failover is unsafe until the same reference is reconciled.
    await transaction(pool,async db=>{const changed=await db.query("UPDATE payment_checkout_attempts SET status='review',failure_code='initialization_uncertain',updated_at=NOW() WHERE id=$1 AND status='initializing' RETURNING id",[claim.id]);if(changed.rowCount)await audit(db,{type:'provider',id:claim.quote.provider},'checkout.review',claim.id,{reason:'initialization_uncertain'});});
   }
  }
  return status(artistId,saved.id);
 }
 async function webhook(provider,raw,headers){ensure();if(!PROVIDERS.includes(provider)||!account(provider))throw fail(503,'This payment provider is unavailable.');const a=account(provider);if(typeof a.lifecycleNotice==='function'){const notice=a.lifecycleNotice(raw,headers);if(notice)return refunds.notice(provider,notice);}return services[provider].ingest(raw,headers);}
 async function reconcile(artistId,id){
  ensure();const a=await status(artistId,id);if(a.status==='paid')return a;const adapter=account(a.provider);if(!adapter)throw fail(503,'This payment account is unavailable.');
  let claimed=false;
  await transaction(pool,async db=>{const scope='checkout-lookup:'+a.id;await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[scope]);const recent=await db.query("SELECT 1 FROM platform_requests WHERE scope=$1 AND created_at>NOW()-INTERVAL '15 seconds' LIMIT 1",[scope]);if(recent.rowCount)return;await idempotent(db,scope,crypto.randomUUID(),{id:a.id},async()=>{claimed=true;return {lookup_started:true};});});
  if(!claimed)return status(artistId,id);
  try{await services[a.provider].reconcileReference(a.reference);}catch(error){await audit(pool,{type:'artist',id:artistId},'checkout.lookup_pending',id,{reason:'provider_verification_unavailable'});throw fail(503,'Payment verification is unavailable. Keep this reference; another charge has not been requested.');}
  return status(artistId,id);
 }
 async function list(artistId){const rows=await pool.query('SELECT a.id,a.order_id,a.provider,a.quote_id,a.reference,a.status,a.mode,a.checkout_url,a.failure_code,a.created_at,q.charge_currency,q.charge_minor,q.base_currency,q.base_minor,q.expires_at,q.expires_at>NOW() AS quote_current FROM payment_checkout_attempts a JOIN commerce_orders o ON o.id=a.order_id JOIN payment_checkout_quotes q ON q.id=a.quote_id WHERE o.artist_id=$1 ORDER BY a.created_at DESC LIMIT 100',[artistId]);return rows.rows.map(publicStatus);}
 async function report(){return (await pool.query('SELECT a.id,a.order_id,a.provider,a.merchant_id,a.merchant_country,a.mode,a.reference,a.status,a.failure_code,a.created_at,q.base_currency,q.base_minor,q.charge_currency,q.charge_minor,p.payment_id,p.verified_at FROM payment_checkout_attempts a JOIN payment_checkout_quotes q ON q.id=a.quote_id LEFT JOIN payment_presentments p ON p.attempt_id=a.id ORDER BY a.created_at DESC LIMIT 200')).rows;}
 return {enabled,capabilities,prepare,start,status,list,reconcile,webhook,report,refunds};
}
module.exports={createCheckoutService};
