'use strict';
const crypto=require('node:crypto');
const {fail,audit,transaction}=require('./transactions');
const {verifyPassword}=require('./passwords');
const config=Object.freeze({artist:{table:'creators',sessions:'sessions',owner:'creator_id',cookie:'lae_session'},listener:{table:'listeners',sessions:'listener_sessions',owner:'listener_id',cookie:'lae_listener'}});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function roleConfig(role){if(!Object.hasOwn(config,role))throw fail(400,'Choose listener or artist access.');return config[role];}
async function members(db,role,id){const r=roleConfig(role),link=(await db.query('SELECT artist_id,listener_id FROM account_role_links WHERE '+(role==='artist'?'artist_id':'listener_id')+'=$1',[id])).rows[0];return link?[{role:'artist',id:link.artist_id},{role:'listener',id:link.listener_id}]:[{role,id}];}
async function emailLock(db,email){await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['account-email:'+String(email).trim().toLowerCase()]);}
async function lockAccount(db,role,id){const r=roleConfig(role),initial=(await db.query('SELECT email FROM '+r.table+' WHERE id=$1',[id])).rows[0];if(!initial)throw fail(401,'Sign in again.');await emailLock(db,initial.email);let user;for(const m of await members(db,role,id)){const row=(await db.query('SELECT * FROM '+roleConfig(m.role).table+' WHERE id=$1 FOR UPDATE',[m.id])).rows[0];if(m.role===role)user=row;}if(!user)throw fail(401,'Sign in again.');return user;}
async function issueSessions(db,role,id,token,label){const group=await members(db,role,id);for(const m of group){const r=roleConfig(m.role);await db.query('INSERT INTO '+r.sessions+"(token_hash,"+r.owner+",expires_at,created_at,client_label) VALUES($1,$2,NOW()+INTERVAL '7 days',NOW(),$3)",[hash(token),m.id,label]);}return group.map(m=>m.role);}
function sessionCookies(role,result){const cookies=(result.sessionRoles||[role]).map(kind=>roleConfig(kind).cookie+'='+result.token+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800');return cookies.length===1?cookies[0]:cookies;}
function clearCookies(roles){const cookies=roles.map(role=>roleConfig(role).cookie+'=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');return cookies.length===1?cookies[0]:cookies;}
async function password(db,role,id,hashed,keepToken){const group=await members(db,role,id);for(const m of group){const r=roleConfig(m.role);await db.query('UPDATE '+r.table+' SET password_salt=$1,password_hash=$2 WHERE id=$3',[hashed.salt,hashed.hash,m.id]);await db.query('DELETE FROM '+r.sessions+' WHERE '+r.owner+'=$1'+(keepToken?' AND token_hash<>$2':''),keepToken?[m.id,hash(keepToken)]:[m.id]);await db.query('UPDATE account_action_tokens SET consumed_at=NOW() WHERE '+r.owner+'=$1 AND consumed_at IS NULL',[m.id]);}return group.map(m=>m.role);}
function create({pool,accounts,deviceLabel}){
 async function status(role,id){const r=roleConfig(role),user=(await pool.query('SELECT email FROM '+r.table+' WHERE id=$1',[id])).rows[0];if(!user)throw fail(401,'Sign in again.');const group=await members(pool,role,id);return {linked:group.length===2,roles:group.map(m=>m.role),email:user.email,partner_uses_artist:true};}
 async function connect(role,id,token,input,userAgent){roleConfig(role);if(!input||input.confirm!==true)throw fail(400,'Confirm that these roles will share your current email and password.');await accounts.rate('account-roles:'+role,String(id),10);return transaction(pool,async db=>{
  const source=await lockAccount(db,role,id),r=roleConfig(role);if(!token||!(await db.query('SELECT 1 FROM '+r.sessions+' WHERE '+r.owner+'=$1 AND token_hash=$2 AND expires_at>clock_timestamp()',[id,hash(token)])).rowCount)throw fail(401,'Your session expired. Sign in again.');
  if(!await verifyPassword(input.currentPassword,source))throw fail(403,'Your current LAE-MUSIC password is incorrect.');
  const existing=await members(db,role,id);if(existing.length===2){const value=crypto.randomBytes(32).toString('hex'),sessionRoles=await issueSessions(db,role,id,value,deviceLabel(userAgent));return {token:value,sessionRoles,linked:true};}
  const targetRole=role==='artist'?'listener':'artist',targetConfig=roleConfig(targetRole);let target=(await db.query('SELECT * FROM '+targetConfig.table+' WHERE email=$1 FOR UPDATE',[source.email])).rows[0];
  if(target){if(!await verifyPassword(input.existingPassword||input.currentPassword,target))throw fail(409,'An existing '+targetRole+' profile uses this email. Enter that profile’s current password to connect it safely.');if((await members(db,targetRole,target.id)).length!==1)throw fail(409,'That profile is already connected. Contact support.');}
  else {const name=String(input.name||source.display_name).trim(),country=String(input.country||source.country||'').trim();if(name.length<2||name.length>100)throw fail(400,'Enter a display name of 2–100 characters.');if(targetRole==='artist'&&(country.length<2||country.length>100))throw fail(400,'Enter your country to add artist and partner access.');
   let referrer=null;const product=String(input.product||'starter'),ref=String(input.ref||'');if(targetRole==='artist'){if(!['starter','growth','professional'].includes(product))throw fail(400,'Choose a valid artist package.');if(ref){if(!/^[1-9][0-9]{0,15}$/.test(ref))throw fail(400,'Invalid referral link.');const sponsor=(await db.query('SELECT id,email FROM creators WHERE id=$1',[ref])).rows[0];if(!sponsor||sponsor.email.trim().toLowerCase()===source.email.trim().toLowerCase())throw fail(400,'This referral cannot be used for your account.');referrer=sponsor.id;}}
   const args=[name,source.email,source.password_salt,source.password_hash];target=targetRole==='artist'?(await db.query('INSERT INTO creators(display_name,email,password_salt,password_hash,plan,country,referred_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[...args,product,country,referrer])).rows[0]:(await db.query('INSERT INTO listeners(display_name,email,password_salt,password_hash) VALUES($1,$2,$3,$4) RETURNING *',args)).rows[0];
  }
  await db.query('INSERT INTO account_role_links(artist_id,listener_id) VALUES($1,$2)',role==='artist'?[source.id,target.id]:[target.id,source.id]);
  await password(db,role,id,{salt:source.password_salt,hash:source.password_hash});
  await audit(db,{type:role,id},'account.roles.connect',String(id),{roles:['artist','listener'],target_role:targetRole});
  const value=crypto.randomBytes(32).toString('hex'),sessionRoles=await issueSessions(db,role,id,value,deviceLabel(userAgent));return {token:value,sessionRoles,linked:true};
 });}
 return {status,connect};
}
module.exports={roleConfig,members,emailLock,lockAccount,issueSessions,sessionCookies,clearCookies,password,create};
