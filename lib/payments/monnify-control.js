'use strict';
const {fail,audit,transaction,idempotent}=require('../transactions');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function create({pool,rates,env=process.env}={}){
 const services=require('./monnify-runtime').create({pool,rates,env,controlled:true});
 async function owner(principal){if(!principal||principal.role!=='owner')throw fail(403,'Only the platform owner can run a live payment test.');if(principal.source==='named'&&!principal.mfa_recent)throw fail(403,'Verify your administrator session before a live payment test.');if(!services.configured)throw fail(503,'Monnify server configuration is incomplete.');}
 async function start(principal,key,input){
  await owner(principal);if(input?.confirm_real_payment!==true||!['artist','listener'].includes(input.role))throw fail(400,'Choose an existing account and confirm this is a real payment checkout.');
  const table=input.role==='listener'?'listeners':'creators';
  let id;
  if(Number.isSafeInteger(Number(input.account_id))&&Number(input.account_id)>0)id=String(input.account_id);
  else if(typeof input.email==='string'&&input.email.length<=254&&input.email.includes('@')){const q=await pool.query('SELECT id FROM '+table+' WHERE LOWER(email)=LOWER($1)',[input.email.trim()]);id=q.rows[0]?.id;}
  if(!id)throw fail(404,'Existing account not found. Sign into the matching artist or listener account first.');
  const prepared=await transaction(pool,db=>idempotent(db,'monnify-acceptance:'+String(principal.id||'owner'),key,input,async()=>{
   let order,quote;
   if(input.role==='listener'){
    const q=await pool.query('SELECT id FROM listeners WHERE id=$1',[id]);if(!q.rowCount)throw fail(404,'Listener account not found.');
    order=await services.premium.prepare(id,key,{plan:input.plan});
    quote=await services.premium.prepareQuote(id,{order_id:order.id,provider:'monnify',currency:'NGN'});
   }else{
    order=await require('../commerce').createCommerce({pool}).create(id,key,{kind:input.kind,plan:input.plan});
    quote=await services.checkout.prepare(id,{order_id:order.id,provider:'monnify',currency:'NGN'});
   }
   return {order,quote,account_id:id};
  }));
  const {order,quote,account_id:accountId}=prepared;
  let checkout=input.role==='listener'?await services.premium.checkout(accountId,key,{quote_id:quote.id}):await services.checkout.start(accountId,key,{quote_id:quote.id});
  if(input.role==='listener')checkout={...checkout,id:checkout.attempt_id,order_id:order.id,status:checkout.checkout_status,mode:'live',base_minor:quote.base_minor,base_currency:quote.base_currency};
  await audit(pool,{type:'admin',id:principal.id||'owner'},'monnify.acceptance.checkout',order.id,{role:input.role,account_id:id,quote_id:quote.id});
  return {order_id:order.id,checkout,charge_currency:quote.charge_currency,charge_minor:quote.charge_minor,notice:'Real payment checkout. No service activates until Monnify confirms payment.'};
 }
 async function artistVerify(id,attempt){if(!UUID.test(attempt||''))throw fail(400,'Invalid checkout reference.');const q=await pool.query("SELECT 1 FROM payment_checkout_attempts WHERE id=$1 AND provider='monnify'",[attempt]);return q.rowCount?services.checkout.reconcile(id,attempt):null;}
 async function listenerVerify(id,attempt){if(!UUID.test(attempt||''))throw fail(400,'Invalid checkout reference.');const q=await pool.query("SELECT 1 FROM premium_attempts WHERE id=$1 AND provider='monnify'",[attempt]);return q.rowCount?services.premium.verify(id,attempt):null;}
 async function verify(principal,input){
  await owner(principal);if(!['artist','listener'].includes(input?.role)||!UUID.test(input.attempt_id||''))throw fail(400,'Choose the payment to check.');
  const table=input.role==='listener'?'premium_attempts':'payment_checkout_attempts',orders=input.role==='listener'?'premium_orders':'commerce_orders',column=input.role==='listener'?'listener_id':'artist_id';
  const q=await pool.query('SELECT o.'+column+' AS account_id FROM '+table+' a JOIN '+orders+" o ON o.id=a.order_id WHERE a.id=$1 AND a.provider='monnify'",[input.attempt_id]);
  if(!q.rowCount)throw fail(404,'Monnify payment not found.');
  return input.role==='listener'?services.premium.verify(q.rows[0].account_id,input.attempt_id):services.checkout.reconcile(q.rows[0].account_id,input.attempt_id);
 }
 async function status(principal){if(!principal||principal.role!=='owner')throw fail(403,'Only the platform owner can view live payment tests.');return {configured:services.configured,public_enabled:require('./monnify-runtime').approved(),notice:services.configured?(require('./monnify-runtime').approved()?'Monnify is available to customers. This page is for administrator payment checks.':'Private live payment test. Public Monnify payments remain closed until a real payment is verified.'):'Monnify server configuration is incomplete. Check the four server environment variables before starting a payment.'};}
 async function webhook(raw,headers){
  // Authenticate before routing, ignoring browser-provided success parameters.
  require('./monnify-runtime').adapter(env).authenticate(raw,headers);
  return await services.premium.owns('monnify',raw)?services.premium.webhook('monnify',raw,headers):services.checkout.webhook('monnify',raw,headers);
 }
 return {start,verify,status,artistVerify,listenerVerify,webhook,configured:services.configured};
}
module.exports={create};
