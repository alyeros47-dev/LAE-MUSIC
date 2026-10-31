'use strict';
const crypto=require('node:crypto'),{fail,transaction,audit}=require('./transactions');
const {accountRole,sessionToken,deviceLabel}=require('./account-security');
const {hashPassword,verifyPassword}=require('./passwords');
const providers=require('./social-providers');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex'),random=()=>crypto.randomBytes(32).toString('hex');
const COOKIE='__Host-lae_social',FLOW_COOKIE='__Host-lae_social_flow',UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function readCookie(req,name){return String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||'';}
function cookie(name,value,maxAge=1200){return name+'='+value+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age='+maxAge;}
function appendCookies(res,values){const previous=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',[...(previous?Array.isArray(previous)?previous:[previous]:[]),...values]);}
function contextOf(input={}){
 if(!['artist','listener','partner'].includes(input.role))throw fail(400,'Choose an artist, listener or partner account.');
 const ref=String(input.ref||'');if(ref&&!/^[1-9][0-9]{0,15}$/.test(ref))throw fail(400,'Invalid referral link.');
 const product=String(input.product||'');if(product&&!['starter','growth','professional'].includes(product))throw fail(400,'Choose a valid artist package.');
 return {role:input.role,ref,product,premium:input.return==='premium'};
}
function destination(context,role){if(role==='listener')return context.premium?'/premium'+(context.ref?'?ref='+encodeURIComponent(context.ref):''):'/library';if(context.ref&&context.product)return '/workspace?'+new URLSearchParams({tab:'plans',ref:context.ref,product:context.product});return context.role==='partner'?'/partners':'/workspace';}
function create({pool,env={},accounts,me,listenerMe,exchange=providers.exchangeIdentity}={}){
 const configs=providers.configuration(env);
 const available=()=>({origin:Object.values(configs)[0].origin,providers:pool?Object.values(configs).filter(c=>c.enabled).map(c=>({id:c.id,name:c.name})):[]});
 function config(id){const c=Object.hasOwn(configs,id)?configs[id]:null;if(!pool||!c?.enabled)throw fail(503,'This social sign-in provider is not configured. Use email and password.');return c;}
 function browser(req){const token=readCookie(req,COOKIE);if(!/^[a-f0-9]{64}$/.test(token))throw fail(400,'This sign-in session expired. Please start again.');return digest(token);}
 function host(req,c){if(String(req.headers.host||'').toLowerCase()!==new URL(c.origin).host)throw fail(400,'Continue social sign-in on the configured LAE-MUSIC website.');}
 function pendingRef(req){const id=readCookie(req,FLOW_COOKIE);if(!UUID.test(id))throw fail(400,'This sign-in session expired. Please start again.');return [id,browser(req)];}
 async function start(req,res,input){
  const c=config(input?.provider);host(req,c);const context=contextOf(input),role=context.role==='listener'?'listener':'artist';
  const intent=input.intent||'signin';if(!['signin','register','link'].includes(intent))throw fail(400,'Invalid sign-in action.');
  let owner=null,sessionHash=null;if(intent==='link'){owner=await (role==='artist'?me(req):listenerMe(req));if(!owner)throw fail(401,'Sign in to connect this social account.');sessionHash=digest(sessionToken(req,role));}
  const old=readCookie(req,COOKIE),token=/^[a-f0-9]{64}$/.test(old)?old:random(),state=random(),verifier=crypto.randomBytes(32).toString('base64url'),nonce=random();
  await accounts.rate('social-start',req.clientAddress||req.socket?.remoteAddress||'unknown',20,900);
  await pool.query('DELETE FROM social_auth_flows WHERE id IN (SELECT id FROM social_auth_flows WHERE expires_at<NOW() LIMIT 1000)');
  await pool.query('INSERT INTO social_auth_flows(id,provider,client_id,role,intent,state_hash,browser_hash,verifier,nonce_hash,context,link_owner_id,link_session_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[crypto.randomUUID(),c.id,c.clientId,role,intent,digest(state),digest(token),c.id==='google'?verifier:null,digest(nonce),context,owner?.id||null,sessionHash]);
  appendCookies(res,[cookie(COOKIE,token),cookie(FLOW_COOKIE,'',0)]);return {url:providers.authorizationUrl(c,{state,verifier,nonce})};
 }
 async function issueSession(db,role,user,req,action){const r=accountRole(role),token=random();const sessionRoles=await require('./account-roles').issueSessions(db,role,user.id,token,deviceLabel(req.headers['user-agent']));await audit(db,{type:role,id:user.id},action,String(user.id));return {token,role,sessionRoles,user:{id:user.id,display_name:user.display_name,email:user.email}};}
 function setSession(res,result){const value=require('./account-roles').sessionCookies(result.role,result);appendCookies(res,[...(Array.isArray(value)?value:[value]),cookie(FLOW_COOKIE,'',0)]);}
 async function callback(req,res,id,params){
  const c=config(id);host(req,c);const state=params.get('state');if(params.getAll('state').length!==1||params.getAll('code').length>1||!/^[a-f0-9]{64}$/.test(state||''))throw fail(400,'Invalid social sign-in state.');
  const claimed=await pool.query("UPDATE social_auth_flows SET status='exchanging' WHERE state_hash=$1 AND browser_hash=$2 AND provider=$3 AND client_id=$4 AND status='pending' AND expires_at>NOW() RETURNING *",[digest(state),browser(req),id,c.clientId]);
  if(!claimed.rowCount)throw fail(400,'This social sign-in was already used or has expired.');const flow=claimed.rows[0];
  try{
   const code=params.get('code');if(params.has('error')||typeof code!=='string'||!code||code.length>8000)throw fail(400,'Social sign-in was cancelled or could not be completed.');
   const identity=providers.normalizedIdentity(await exchange(c,flow,code));
   // Only a previously linked immutable provider ID can immediately sign into an existing account.
   if(flow.intent!=='link'){
    const result=await transaction(pool,async db=>{
     const found=await db.query('SELECT * FROM social_identities WHERE provider=$1 AND client_id=$2 AND subject=$3 AND (role=$4 OR $5) ORDER BY (role=$4) DESC',[id,c.clientId,identity.subject,flow.role,flow.intent==='signin']);
     if(!found.rowCount)return null;const link=found.rows[0],r=accountRole(link.role),user=await require('./account-roles').lockAccount(db,link.role,link[r.owner]);if(!user)throw fail(401,'This account is unavailable.');
     const session=await issueSession(db,link.role,user,req,'account.social.signin');await db.query("UPDATE social_auth_flows SET status='completed',verifier=NULL,nonce_hash=NULL,identity=NULL WHERE id=$1",[flow.id]);return session;
    });if(result){setSession(res,result);const target=new URL(destination(flow.context,result.role),c.origin);target.searchParams.set('social_role',result.role);return target.pathname+target.search;}
   }
   await pool.query("UPDATE social_auth_flows SET status='ready',verifier=NULL,nonce_hash=NULL,identity=$2 WHERE id=$1",[flow.id,identity]);appendCookies(res,[cookie(FLOW_COOKIE,flow.id)]);return '/join?social=complete';
  }catch(error){await pool.query("UPDATE social_auth_flows SET status='failed',verifier=NULL,nonce_hash=NULL,identity=NULL WHERE id=$1",[flow.id]);throw error;}
 }
 async function getPending(req,db=pool,lock=false){if(!pool)throw fail(503,'Social sign-in is unavailable. Use email and password.');const [id,binding]=pendingRef(req);const row=(await db.query("SELECT * FROM social_auth_flows WHERE id=$1 AND browser_hash=$2 AND status='ready' AND expires_at>NOW()"+(lock?' FOR UPDATE':''),[id,binding])).rows[0];if(!row)throw fail(400,'This sign-in session expired. Please start again.');if(config(row.provider).clientId!==row.client_id)throw fail(400,'Social sign-in settings changed. Please start again.');return row;}
 async function pending(req){const f=await getPending(req),u=f.intent==='link'?await (f.role==='artist'?me(req):listenerMe(req)):null;return {provider:f.provider,provider_name:configs[f.provider].name,role:f.role,link:f.intent==='link',name:u?.display_name||f.identity.name,email:u?.email||f.identity.email,email_verified:f.identity.email_verified===true};}
 async function finish(req,res,input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['name','email','country','password'].includes(k)))throw fail(400,'Invalid social account details.');
  const initial=await getPending(req);await accounts.rate('social-finish',initial.browser_hash,15,900);
  if(initial.intent!=='link'&&typeof input.email==='string'&&input.email.length<=254)await accounts.rate('social-link-account:'+initial.role,input.email.trim().toLowerCase(),30,900);
  let result;try{result=await transaction(pool,async db=>{
   const f=await getPending(req,db,true),r=accountRole(f.role),identity=providers.normalizedIdentity(f.identity);let user;
   // Serialize one provider identity, including simultaneous callbacks/profile completion.
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['social:'+f.provider+':'+f.client_id+':'+identity.subject+':'+f.role]);
   if(f.intent==='link'){
    if(digest(sessionToken(req,f.role))!==f.link_session_hash)throw fail(401,'Sign in again before connecting this social account.');
    const session=await db.query('SELECT 1 FROM '+r.sessions+' WHERE token_hash=$1 AND '+r.owner+'=$2 AND expires_at>NOW()',[f.link_session_hash,f.link_owner_id]);if(!session.rowCount)throw fail(401,'Sign in again before connecting this social account.');
    user=await require('./account-roles').lockAccount(db,f.role,f.link_owner_id);if(!user)throw fail(401,'This account is unavailable.');
   }else{
    const mapped=(await db.query('SELECT * FROM social_identities WHERE provider=$1 AND client_id=$2 AND subject=$3 AND role=$4',[f.provider,f.client_id,identity.subject,f.role])).rows[0];
    if(mapped){user=await require('./account-roles').lockAccount(db,f.role,mapped[r.owner]);if(!user)throw fail(401,'This account is unavailable.');}
    else{
    const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(400,'Enter a valid email address to finish your account.');
    if(identity.email_verified&&email!==identity.email)throw fail(400,'Use the email verified by your social provider.');
    await require('./account-roles').emailLock(db,email);
    user=(await db.query('SELECT * FROM '+r.table+' WHERE email=$1 FOR UPDATE',[email])).rows[0];
    if(user){if(!await verifyPassword(input.password,user))throw fail(409,'An account already uses this email. Enter its existing password to connect this social profile, or sign in normally and connect it from your account.');}
    else{
     const name=typeof input.name==='string'?input.name.trim():'',country=typeof input.country==='string'?input.country.trim():'';
     if(name.length<2||name.length>100)throw fail(400,'Enter a display name of 2–100 characters.');if(f.role==='artist'&&(country.length<2||country.length>100))throw fail(400,'Enter your country.');
     // Random unusable local password: never replaces an existing user's password.
     const password=await hashPassword(input.password||random());let referrer=null;
     if(f.role==='artist'&&f.context.ref){const ref=await db.query('SELECT id,email FROM creators WHERE id=$1',[f.context.ref]);if(!ref.rowCount||ref.rows[0].email.toLowerCase()===email)throw fail(400,'This referral cannot be used for your account.');referrer=ref.rows[0].id;}
     const args=[name,email,password.salt,password.hash];
     user=f.role==='artist'?(await db.query('INSERT INTO creators(display_name,email,password_salt,password_hash,plan,referred_by,country) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[...args,f.context.product||'starter',referrer,country])).rows[0]:(await db.query('INSERT INTO listeners(display_name,email,password_salt,password_hash) VALUES($1,$2,$3,$4) RETURNING *',args)).rows[0];
     if(identity.email_verified)await db.query('UPDATE '+r.table+' SET email_verified_at=NOW() WHERE id=$1',[user.id]);await audit(db,{type:f.role,id:user.id},'account.social.register',String(user.id));
    }
    }
   }
   const existing=await db.query('SELECT * FROM social_identities WHERE provider=$1 AND client_id=$2 AND subject=$3 AND role=$4',[f.provider,f.client_id,identity.subject,f.role]);
   if(existing.rowCount&&String(existing.rows[0][r.owner])!==String(user.id))throw fail(409,'This social profile is already connected to another account.');
   if(!existing.rowCount)await db.query('INSERT INTO social_identities(id,provider,client_id,subject,role,creator_id,listener_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),f.provider,f.client_id,identity.subject,f.role,f.role==='artist'?user.id:null,f.role==='listener'?user.id:null]);
   await audit(db,{type:f.role,id:user.id},'account.social.connect',String(user.id),{provider:f.provider});
   const session=await issueSession(db,f.role,user,req,'account.social.signin');await db.query("UPDATE social_auth_flows SET status='completed',identity=NULL,verifier=NULL,nonce_hash=NULL WHERE id=$1",[f.id]);return {...session,destination:f.intent==='link'?'/account?role='+f.role:destination(f.context,f.role)};
  });}catch(error){if(error.code==='23505')throw fail(409,'This account or provider connection already exists. Use its existing sign-in or connect a different provider.');throw error;}setSession(res,result);return {role:result.role,user:result.user,destination:result.destination};
 }
 async function connections(role,id){const r=accountRole(role);return (await pool.query('SELECT provider,created_at FROM social_identities WHERE '+r.owner+'=$1 ORDER BY created_at',[id])).rows;}
 return {available,start,callback,pending,finish,connections};
}
module.exports={create,contextOf,destination,readCookie,appendCookies,cookie,COOKIE,FLOW_COOKIE};
