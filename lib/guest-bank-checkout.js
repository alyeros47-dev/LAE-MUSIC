'use strict';
const crypto=require('node:crypto');
const {fail,transaction,idempotent,audit,digest}=require('./transactions');
const COOKIE='lae_guest_payment',AGE=60*86400;
function create({pool,bank,premium,accounts,env=process.env,now=Date.now}){
 let keyPromise;
 // A separate purpose key derives from the existing persistent private server secret.
 // It is never returned, logged, or stored in a customer-readable record.
 async function signingKey(){if(!keyPromise)keyPromise=(async()=>{
  await pool.query('INSERT INTO request_security_settings(id,network_key) VALUES(1,$1) ON CONFLICT(id) DO NOTHING',[crypto.randomBytes(32).toString('hex')]);
  const value=(await pool.query('SELECT network_key FROM request_security_settings WHERE id=1')).rows[0]?.network_key;
  if(!/^[a-f0-9]{64}$/.test(value||''))throw fail(503,'Secure bank checkout is temporarily unavailable.');
  return crypto.createHmac('sha256',Buffer.from(value,'hex')).update('lae-guest-bank-cookie/v1').digest();
 })().catch(e=>{keyPromise=null;throw e;});return keyPromise;}
 async function session(req,bootstrap=false,replace=false){
  const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
  const key=await signingKey(),parts=raw.split('.');let valid=false;
  if(parts.length===3&&/^\d{10}$/.test(parts[0])&&/^[a-f0-9]{64}$/.test(parts[1])&&/^[a-f0-9]{64}$/.test(parts[2])){
   const stamp=Number(parts[0]),expected=crypto.createHmac('sha256',key).update(parts[0]+'.'+parts[1]).digest();
   valid=stamp<=Math.floor(now()/1000)+300&&stamp+AGE>now()/1000&&crypto.timingSafeEqual(expected,Buffer.from(parts[2],'hex'));
  }
  if(valid&&!replace)return {hash:digest(raw)};
  if(!bootstrap)throw fail(403,'Reload the payment page to continue securely.');
  const value=String(Math.floor(now()/1000))+'.'+crypto.randomBytes(32).toString('hex'),token=value+'.'+crypto.createHmac('sha256',key).update(value).digest('hex');
  return {hash:digest(token),cookie:COOKIE+'='+token+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age='+AGE};
 }
 const capabilities=()=>({enabled:!!pool&&bank.capabilities().enabled,payment_before_registration:true,approval_required:true});
 async function current(hash){
  const g=(await pool.query('SELECT id,email,kind,plan,referrer_id,expires_at FROM guest_purchase_orders WHERE session_hash=$1',[hash])).rows[0];
  if(!g)return {purchase:null};
  const m=(await pool.query('SELECT id FROM manual_bank_payments WHERE guest_order_id=$1',[g.id])).rows[0];
  const f=m&&(await pool.query('SELECT artist_order_id,premium_order_id FROM guest_purchase_fulfillments WHERE payment_id=$1',[m.id])).rows[0];
  return {purchase:{...g,role:g.kind==='artist_subscription'?'artist':'listener',payment:m?await bank.get('guest',hash,m.id):null,claimed:!!f}};
 }
 async function start(hash,key,input){
  if(!capabilities().enabled)throw fail(503,'Bank checkout is temporarily unavailable.');
  require('./financial-policy').confirmation(input);
  const email=String(input.email||'').trim().toLowerCase();
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(400,'Enter the email you will use for your account.');
  let product;
  if(input.kind==='artist_subscription')product={...require('./commerce').quote(input.kind,input.plan),membership:require('./membership-terms').terms(input.plan),label:'Annual artist membership · '+require('./publishing-policy').disclosure().package_names[input.plan]};
  else if(input.kind==='premium_listener'){
   const c=require('./premium-pricing').catalog(),p=c.plans.find(x=>x.code===input.plan);if(!c.approved||!p)throw fail(400,'Choose an approved Premium pass.');
   product={...p,kind:input.kind,plan:p.code,pricing_revision:c.revision,label:'Premium listening · '+p.name};
  }else throw fail(400,'Choose an artist package or Premium listening pass.');
  await accounts.rate('guest-bank-email',email,20);
  const g=await transaction(pool,async db=>{
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['guest-bank:'+hash]);
   const old=(await db.query('SELECT * FROM guest_purchase_orders WHERE session_hash=$1',[hash])).rows[0];
   if(old){if(old.email!==email||old.kind!==input.kind||old.plan!==input.plan)throw fail(409,'Finish or cancel your current payment before choosing another product.');return old;}
   await require('./account-roles').emailLock(db,email);
   if((await db.query('SELECT 1 FROM creators WHERE email=$1 UNION ALL SELECT 1 FROM listeners WHERE email=$1',[email])).rowCount)throw Object.assign(fail(409,'This email already has an account. Sign in to purchase with your existing account.'),{code:'existing_account'});
   let ref=null,leader=null;const refId=String(input.ref||'');
   if(refId){if(!/^[1-9][0-9]{0,15}$/.test(refId))throw fail(400,'This referral link is invalid.');const r=(await db.query('SELECT id,email,referred_by FROM creators WHERE id=$1',[refId])).rows[0];if(!r||r.email===email)throw fail(400,'This referral link cannot be used for this purchase.');ref=r.id;if(r.referred_by){const l=(await db.query('SELECT id,email FROM creators WHERE id=$1',[r.referred_by])).rows[0];if(l&&l.email!==email&&String(l.id)!==String(ref))leader=l.id;}}
   await require('./financial-policy').catalog(db);if(input.kind==='premium_listener')await require('./premium-pricing').recordApproval(db,require('./premium-pricing').catalog());
   const id=crypto.randomUUID(),policy=require('./financial-policy').disclosure();
   return (await db.query("INSERT INTO guest_purchase_orders(id,session_hash,email,kind,plan,currency,amount_minor,product_snapshot,referrer_id,team_leader_id,policy_revision,expires_at) VALUES($1,$2,$3,$4,$5,'USD',$6,$7,$8,$9,$10,NOW()+INTERVAL '30 minutes') RETURNING *",[id,hash,email,input.kind,input.plan,product.amount_minor,JSON.stringify(product),ref,leader,policy.revision])).rows[0];
  });
  await bank.start('guest',hash,key,{order_id:g.id,policy_accepted:true,policy_revision:input.policy_revision});
  return current(hash);
 }
 async function claim(hash,key,user){
  return transaction(pool,async db=>{
   const g=(await db.query('SELECT * FROM guest_purchase_orders WHERE session_hash=$1 FOR UPDATE',[hash])).rows[0];if(!g)throw fail(404,'Your payment was not found.');
   if(!user||user.role!==(g.kind==='artist_subscription'?'artist':'listener')||String(user.email).toLowerCase()!==g.email)throw fail(403,'Sign in to the account using the email on this payment.');
   await require('./account-roles').lockAccount(db,user.role,user.id);
   const m=(await db.query('SELECT m.*,r.bank_reference_hash,r.received_at,r.received_minor,r.currency AS received_currency FROM manual_bank_payments m JOIN manual_bank_reviews r ON r.payment_id=m.id AND r.decision=\'approved\' WHERE m.guest_order_id=$1 FOR UPDATE OF m',[g.id])).rows[0];
   if(!m||m.status!=='approved'||m.mode!==require('./affiliate-access').modeForEnv(env))throw fail(409,'Your bank receipt must be approved before the purchased service can activate.');
   return idempotent(db,'guest-bank-claim:'+g.id,key,{role:user.role,id:String(user.id)},async()=>{
    const old=(await db.query('SELECT * FROM guest_purchase_fulfillments WHERE payment_id=$1',[m.id])).rows[0];if(old){if(String(old.artist_id||old.listener_id)!==String(user.id))throw fail(409,'This payment has already been assigned.');return {order_id:old.artist_order_id||old.premium_order_id,role:user.role};}
    const q=(await db.query('SELECT * FROM payment_checkout_quotes WHERE id=$1',[m.quote_id])).rows[0],p=g.product_snapshot,id=crypto.randomUUID(),quote=crypto.randomUUID();let order;
    if(user.role==='artist'){
     order=(await db.query("INSERT INTO commerce_orders(id,artist_id,kind,plan,currency,amount_minor,royalty_percent,direct_referral_percent,expires_at) VALUES($1,$2,'artist_subscription',$3,'USD',$4,$5,$6,NOW()+INTERVAL '30 minutes') RETURNING *",[id,user.id,g.plan,g.amount_minor,p.royalty_percent,p.direct_referral_percent])).rows[0];
     await db.query('INSERT INTO membership_order_terms(order_id,included_generations,publish_track_limit,revision) VALUES($1,$2,$3,$4)',[id,p.membership.included_generations,p.membership.publish_track_limit,p.membership.revision]);
     await db.query('INSERT INTO commerce_order_referral_snapshots(order_id,direct_referrer_id,team_leader_id,policy_revision) VALUES($1,$2,$3,$4)',[id,g.referrer_id,g.team_leader_id,require('./affiliate-framework').REVISION]);
    }else{
     order=(await db.query("INSERT INTO premium_orders(id,listener_id,plan,currency,amount_minor,days,referrer_id,indirect_id,pricing_revision,affiliate_policy_revision,expires_at) VALUES($1,$2,$3,'USD',$4,$5,$6,$7,$8,$9,NOW()+INTERVAL '30 minutes') RETURNING *",[id,user.id,g.plan,g.amount_minor,p.days,g.referrer_id,g.team_leader_id,p.pricing_revision,require('./affiliate-framework').REVISION])).rows[0];
    }
    await db.query("INSERT INTO payment_checkout_quotes(id,order_id,premium_order_id,provider,base_currency,base_minor,charge_currency,charge_minor,rate_snapshot_id,created_at,expires_at) VALUES($1,$2,$3,'manual_bank_transfer','USD',$4,$5,$6,$7,$8,$9)",[quote,user.role==='artist'?id:null,user.role==='listener'?id:null,g.amount_minor,q.charge_currency,q.charge_minor,q.rate_snapshot_id,q.created_at,q.expires_at]);
    await db.query('INSERT INTO payment_policy_acceptances(artist_order_id,premium_order_id,account_id,policy_revision) VALUES($1,$2,$3,$4)',[user.role==='artist'?id:null,user.role==='listener'?id:null,user.id,g.policy_revision]);
    const payment={id:m.bank_reference_hash,orderId:id,quoteId:quote,reference:m.reference,merchantId:m.merchant_id,status:'paid',currency:q.charge_currency,amountMinor:Number(q.charge_minor),mode:m.mode};
    if(user.role==='artist'){
     await db.query("INSERT INTO payment_checkout_attempts(id,order_id,quote_id,provider,merchant_id,merchant_country,mode,reference,status) VALUES($1,$2,$3,'manual_bank_transfer',$4,'NG',$5,$6,'review')",[m.attempt_id,id,quote,m.merchant_id,m.mode,m.reference]);
     await require('./commerce').fulfillPaidOrder(db,order,'manual-bank:'+m.id,{provider:'manual_bank_transfer',merchantId:m.merchant_id,paymentId:m.bank_reference_hash,eventId:'manual-bank:'+m.id,payloadHash:digest({payment:m.id,receipt:m.bank_reference_hash}),mode:m.mode});
     await db.query("INSERT INTO payment_presentments(order_id,attempt_id,quote_id,provider,merchant_id,payment_id,reference,mode,base_currency,base_minor,charge_currency,charge_minor) VALUES($1,$2,$3,'manual_bank_transfer',$4,$5,$6,$7,'USD',$8,$9,$10)",[id,m.attempt_id,quote,m.merchant_id,m.bank_reference_hash,m.reference,m.mode,g.amount_minor,q.charge_currency,q.charge_minor]);
     await db.query("UPDATE payment_checkout_attempts SET status='paid' WHERE id=$1",[m.attempt_id]);await require('./partner-attribution').recordStudioTeam(db,order);
    }else{
     await db.query("INSERT INTO premium_attempts(id,order_id,quote_id,provider,merchant_id,mode,reference,status) VALUES($1,$2,$3,'manual_bank_transfer',$4,$5,$6,'review')",[m.attempt_id,id,quote,m.merchant_id,m.mode,m.reference]);
     await premium.fulfillVerified(db,{name:'manual_bank_transfer',merchantId:m.merchant_id,mode:m.mode},payment);
    }
    await db.query('INSERT INTO guest_purchase_fulfillments(payment_id,guest_order_id,artist_order_id,premium_order_id,artist_id,listener_id) VALUES($1,$2,$3,$4,$5,$6)',[m.id,g.id,user.role==='artist'?id:null,user.role==='listener'?id:null,user.role==='artist'?user.id:null,user.role==='listener'?user.id:null]);
    await audit(db,{type:user.role,id:user.id},'guest_bank.service.activate',m.id,{order_id:id,kind:g.kind,mode:m.mode,bank_approved:true});return {order_id:id,role:user.role};
   });
  });
 }
 return {capabilities,session,current,start,claim};
}
module.exports={create,COOKIE};
