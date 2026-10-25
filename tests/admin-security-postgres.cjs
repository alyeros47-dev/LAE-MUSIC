'use strict';
// Runs last: confirmed named enrollment intentionally ends shared-key access in this disposable DB.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {runtime}=require('./runtime.cjs'),{createAdminAuth}=require('../lib/admin-auth'),totp=require('../lib/totp');
const {transaction}=require('../lib/transactions'),context=require('../lib/request-context');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
module.exports=async(t,{pool})=>{
 let time=Date.now();const env={NODE_ENV:'test',ADMIN_KEY:'isolated-named-owner-key-123456',ADMIN_MFA_KEY:'cd'.repeat(32),STUDIO_RELEASE_WORKER_ENABLED:'false'};
 const make=extra=>createAdminAuth({pool,env,now:()=>time,...extra});const service=make();
 const app=await runtime({pool,adminService:service,env});
 const api=async(path,{body,cookie,headers={}}={})=>{const r=await app.request(path,{method:body===undefined?'GET':'POST',body,headers:{...(cookie?{cookie}:{}),...headers,'user-agent':'Mozilla/5.0 named-operator-fixture'}});const cookies=r.headers['set-cookie'];return {status:r.status,data:r.json(),cookie:(Array.isArray(cookies)?cookies.find(x=>x.startsWith('__Host-lae_operator=')):cookies)?.split(';')[0]};};
 const proof=u=>{time+=31000;return {password:u.password,code:totp.hotp(u.secret,Math.floor(time/30000))};};
 const principal=u=>service.resolve({headers:{cookie:u.cookie}});
 const signIn=async u=>{const r=await api('/api/admin/login',{body:{email:u.email,...proof(u)}});assert.equal(r.status,200,JSON.stringify(r.data));u.cookie=r.cookie;return r;};
 let owner,legacy,finance,content,support,pending;
 await t.test('owner enrollment requires configured encryption and the original shared-key session and does not enable access early',async()=>{
  assert.equal((await api('/api/platform/admin/auth/status')).data.mode,'shared_key');
  const login=await api('/api/admin/login',{body:{password:env.ADMIN_KEY}});assert.equal(login.status,200);legacy=login.cookie;
  owner={display_name:'CI Named Owner',email:'named-owner@admin-ci.invalid',password:'OwnerStrongPassword1234'};
  assert.equal((await api('/api/platform/admin/auth/bootstrap/start',{body:{...owner,admin_key:env.ADMIN_KEY}})).status,401);
  await assert.rejects(make({env:{...env,ADMIN_MFA_KEY:''}}).bootstrap(await principal({cookie:legacy}),{...owner,admin_key:env.ADMIN_KEY}),e=>e.status===503);
  assert.equal((await api('/api/platform/admin/auth/bootstrap/start',{cookie:legacy,body:{...owner,admin_key:'wrong'}})).status,403);
  const r=await api('/api/platform/admin/auth/bootstrap/start',{cookie:legacy,body:{...owner,admin_key:env.ADMIN_KEY}});assert.equal(r.status,200);pending=r.data;owner.secret=r.data.secret;owner.id=r.data.id;
  const stored=(await pool.query('SELECT * FROM admin_operators WHERE id=$1',[owner.id])).rows[0];assert.equal(stored.status,'enrolling');assert(!stored.sealed_factor.includes(owner.secret));assert.equal(stored.enrollment_hash,hash(pending.challenge));assert.notEqual(stored.password_hash,owner.password);
  assert.equal((await api('/api/platform/admin/auth/status')).data.mode,'shared_key');assert.equal((await api('/api/platform/admin/overview',{cookie:legacy})).status,200);
  assert.equal((await api('/api/platform/admin/auth/bootstrap/confirm',{cookie:legacy,body:{challenge:pending.challenge,code:'invalid'}})).status,401);
 });
 await t.test('confirming owner authenticator atomically enables named mode, issues private recovery codes and invalidates every shared-key session',async()=>{
  const r=await api('/api/platform/admin/auth/bootstrap/confirm',{cookie:legacy,body:{challenge:pending.challenge,code:proof(owner).code}});assert.equal(r.status,200,JSON.stringify(r.data));owner.cookie=r.cookie;owner.recovery=r.data.recovery_codes;assert.equal(owner.recovery.length,8);assert.match(owner.cookie,/^__Host-lae_operator=[a-f0-9]{64}$/);assert(!JSON.stringify(r.data).includes(owner.secret));
  assert.equal((await api('/api/platform/admin/auth/bootstrap/confirm',{cookie:legacy,body:{challenge:pending.challenge,code:proof(owner).code}})).status,401);
  assert.equal((await api('/api/admin/login',{body:{password:env.ADMIN_KEY}})).status,401);
  assert.equal((await api('/api/platform/admin/overview',{cookie:legacy})).status,401);
  const session=await api('/api/platform/session',{cookie:owner.cookie});assert.equal(session.data.admin,true);assert.equal(session.data.admin_user.email,owner.email);assert.equal(session.data.admin_user.role,'owner');assert.equal(session.data.admin_user.source,'named');assert(!JSON.stringify(session.data).includes('session_hash'));
  assert.equal((await make().status(await principal(owner))).mode,'named');
  const closed=await runtime({pool,env:{...env,ADMIN_MFA_KEY:''}});assert.equal((await closed.request('/api/platform/admin/overview',{headers:{cookie:owner.cookie}})).status,401);
 });
 async function enroll(role){
  const user={display_name:'CI '+role,email:role+'@admin-ci.invalid',password:role+'StrongPassword1234'};
  const invited=await api('/api/platform/admin/operators',{cookie:owner.cookie,body:{...user,role}});assert.equal(invited.status,201,JSON.stringify(invited.data));user.invite=new URLSearchParams(invited.data.enrollment_url.split('#')[1]).get('invite');
  const info=await api('/api/platform/admin/auth/invitation/info',{body:{invite:user.invite}});assert.equal(info.data.role,role);
  const started=await api('/api/platform/admin/auth/enroll/start',{body:{invite:user.invite,password:user.password,role:'owner'}});assert.equal(started.status,200);user.secret=started.data.secret;
  const done=await api('/api/platform/admin/auth/enroll/confirm',{body:{invite:user.invite,challenge:started.data.challenge,code:proof(user).code,role:'owner'}});assert.equal(done.status,200,JSON.stringify(done.data));assert.equal(done.data.operator.role,role);user.cookie=done.cookie;user.recovery=done.data.recovery_codes;user.id=done.data.operator.id;return user;
 }
 await t.test('private invitations bind the recipient and assigned role, and cannot be consumed twice',async()=>{
  finance=await enroll('finance');content=await enroll('content');support=await enroll('support');
  assert.equal((await api('/api/platform/admin/auth/invitation/info',{body:{invite:finance.invite}})).status,400);
  assert.equal((await api('/api/platform/admin/auth/enroll/start',{body:{invite:finance.invite,password:finance.password}})).status,400);
  const records=await api('/api/platform/admin/operators',{cookie:owner.cookie});assert.equal(records.status,200);assert(!JSON.stringify(records.data).includes(finance.invite));assert(!JSON.stringify(records.data).includes('sealed_factor'));assert(!JSON.stringify(records.data).includes('password_hash'));
  const invite=await api('/api/platform/admin/operators',{cookie:owner.cookie,body:{display_name:'Revoked Staff',email:'revoked@admin-ci.invalid',role:'support'}});const token=new URLSearchParams(invite.data.enrollment_url.split('#')[1]).get('invite');
  assert.equal((await api('/api/platform/admin/operators',{cookie:owner.cookie,body:{display_name:'Revoked Staff',email:'revoked@admin-ci.invalid',role:'support'}})).status,409);
  assert.equal((await api('/api/platform/admin/operators/'+invite.data.id+'/revoke-invitation',{cookie:owner.cookie,body:{}})).status,200);
  assert.equal((await api('/api/platform/admin/auth/enroll/start',{body:{invite:token,password:finance.password}})).status,400);
 });
 await t.test('actual HTTP permissions reject cross-role mutations and unknown protected endpoints before changing records',async()=>{
  assert.equal((await api('/api/platform/admin/editorial',{cookie:content.cookie})).status,200);
  assert.equal((await api('/api/platform/admin/moderation',{cookie:content.cookie})).status,200);
  assert.equal((await api('/api/platform/admin/moderation',{cookie:support.cookie})).status,403);
  assert.equal((await api('/api/platform/admin/moderation/comment',{cookie:finance.cookie,body:{}})).status,403);
  assert.equal((await api('/api/platform/admin/commerce',{cookie:finance.cookie})).status,200);
  assert.equal((await api('/api/platform/admin/account-security',{cookie:support.cookie})).status,200);
  for(const u of [finance,content,support])assert.equal((await api('/api/platform/admin/operators',{cookie:u.cookie})).status,403);
  assert.equal((await api('/api/platform/admin/editorial',{cookie:finance.cookie,body:{}})).status,403);
  assert.equal((await api('/api/platform/admin/withdrawal-review',{cookie:content.cookie,body:{id:1,decision:'approved'}})).status,403);
  assert.equal((await api('/api/platform/admin/catalog-action',{cookie:support.cookie,body:{id:1,action:'remove'}})).status,403);
  assert.equal((await api('/api/admin/site',{cookie:finance.cookie,body:{headline:'Forbidden'}})).status,403);
  assert.equal((await api('/api/platform/admin/report?section=audit',{cookie:support.cookie})).status,403);
  assert.equal((await api('/api/platform/admin/unknown-financial-mutation',{cookie:finance.cookie,body:{}})).status,403);
  assert.equal((await api('/api/admin/site',{cookie:owner.cookie,body:{headline:'Forbidden'},headers:{'sec-fetch-site':'cross-site'}})).status,403);
 });
 await t.test('authenticator replay and reused recovery codes fail while concurrent recovery-code login succeeds once',async()=>{
  const same=totp.hotp(support.secret,Math.floor(time/30000));
  await signIn(support);const replay=totp.hotp(support.secret,Math.floor(time/30000));
  assert.equal((await api('/api/admin/login',{body:{email:support.email,password:support.password,code:replay}})).status,401);
  const body={email:support.email,password:support.password,code:support.recovery[0]};const results=await Promise.all([api('/api/admin/login',{body}),api('/api/admin/login',{body})]);assert.deepEqual(results.map(x=>x.status).sort(),[200,401]);assert.equal((await api('/api/admin/login',{body})).status,401);
  assert.equal(typeof same,'string');
 });
 await t.test('sensitive financial reviews require recent MFA and reauthentication rotates the current session without losing other accounts',async()=>{
  const old=finance.cookie;time+=601000;
  assert.equal((await api('/api/platform/admin/commerce',{cookie:finance.cookie})).status,200);
  const blocked=await api('/api/platform/admin/withdrawal-review',{cookie:finance.cookie,body:{id:1,decision:'approved'}});assert.equal(blocked.status,403);assert.equal(blocked.data.code,'admin_reauthentication_required');
  const refreshed=await api('/api/platform/admin/auth/reauthenticate',{cookie:finance.cookie,body:proof(finance)});assert.equal(refreshed.status,200);finance.cookie=refreshed.cookie;assert.notEqual(old,finance.cookie);assert.equal((await api('/api/platform/admin/commerce',{cookie:old})).status,401);
  const permitted=await api('/api/platform/admin/withdrawal-review',{cookie:finance.cookie,body:{id:1,decision:'paid'}});assert.equal(permitted.status,400);
  const own=await api('/api/platform/admin/auth/reauthenticate',{cookie:owner.cookie,body:proof(owner)});assert.equal(own.status,200);owner.cookie=own.cookie;
 });
 await t.test('owner changes use version checks, protect the last owner and immediately revoke demoted or disabled sessions',async()=>{
  let p=await principal(owner);const original=(await pool.query('SELECT auth_version FROM admin_operators WHERE id=$1',[owner.id])).rows[0];
  assert.equal((await api('/api/platform/admin/operators/'+owner.id+'/access',{cookie:owner.cookie,body:{auth_version:original.auth_version,role:'support',status:'active'}})).status,409);
  const version=(await pool.query('SELECT auth_version FROM admin_operators WHERE id=$1',[content.id])).rows[0].auth_version,old=content.cookie;
  assert.equal((await api('/api/platform/admin/operators/'+content.id+'/access',{cookie:owner.cookie,body:{auth_version:version,role:'support',status:'disabled'}})).status,200);
  assert.equal((await api('/api/platform/admin/editorial',{cookie:old})).status,401);
  assert.equal((await api('/api/platform/admin/operators/'+content.id+'/access',{cookie:owner.cookie,body:{auth_version:version,role:'content',status:'active'}})).status,409);
  assert.equal((await api('/api/admin/login',{body:{email:content.email,...proof(content)}})).status,401);
  assert.equal((await api('/api/platform/admin/operators/'+content.id+'/access',{cookie:owner.cookie,body:{auth_version:version+1,role:'content',status:'active'}})).status,200);
  await signIn(content);assert.equal((await api('/api/platform/admin/editorial',{cookie:content.cookie})).status,200);
  assert.equal(p.role,'owner');
 });
 await t.test('authorization fences reject a previously resolved principal after access changes before any ledger or content mutation',async()=>{
  const old=await principal(content);await pool.query('UPDATE admin_operators SET auth_version=auth_version+1 WHERE id=$1',[content.id]);let changed=false;
  await assert.rejects(context.run({adminId:'operator:'+content.id,adminFence:db=>service.fence(db,old,false)},()=>transaction(pool,async()=>{changed=true;})),e=>e.status===401);assert.equal(changed,false);await signIn(content);
 });
 await t.test('own password changes revoke other administrator sessions and preserve the current new credential session',async()=>{
  const old=support.cookie;const r=await api('/api/platform/admin/auth/password',{cookie:support.cookie,body:{...proof(support),newPassword:'UpdatedSupportPassword1234'}});assert.equal(r.status,200,JSON.stringify(r.data));support.cookie=r.cookie;
  assert.equal((await api('/api/platform/admin/account-security',{cookie:old})).status,401);assert.equal((await api('/api/platform/admin/account-security',{cookie:support.cookie})).status,200);
  assert.equal((await api('/api/admin/login',{body:{email:support.email,...proof(support)}})).status,401);support.password='UpdatedSupportPassword1234';await signIn(support);
 });
 await t.test('replacing the authenticator keeps the old factor active until confirmation, then revokes old sessions and recovery codes',async()=>{
  const old=finance.cookie,oldRecovery=finance.recovery[1];const begun=await api('/api/platform/admin/auth/mfa/start',{cookie:finance.cookie,body:proof(finance)});assert.equal(begun.status,200);const next=begun.data;
  assert.equal((await api('/api/platform/admin/commerce',{cookie:old})).status,200);
  const failed=await api('/api/platform/admin/auth/mfa/confirm',{cookie:old,body:{challenge:next.challenge,code:'wrong'}});assert.equal(failed.status,401);
  time+=31000;const r=await api('/api/platform/admin/auth/mfa/confirm',{cookie:old,body:{challenge:next.challenge,code:totp.hotp(next.secret,Math.floor(time/30000))}});assert.equal(r.status,200);finance.cookie=r.cookie;finance.secret=next.secret;finance.recovery=r.data.recovery_codes;
  assert.equal((await api('/api/platform/admin/commerce',{cookie:old})).status,401);
  assert.equal((await api('/api/admin/login',{body:{email:finance.email,password:finance.password,code:oldRecovery}})).status,401);await signIn(finance);
  const rotated=await api('/api/platform/admin/auth/recovery-codes',{cookie:finance.cookie,body:proof(finance)});assert.equal(rotated.status,200);assert.equal(rotated.data.recovery_codes.length,8);
  assert.equal((await api('/api/admin/login',{body:{email:finance.email,password:finance.password,code:finance.recovery[0]}})).status,401);
 });
 await t.test('audits attribute actual operator identities without exposing credentials and logout revokes the named session',async()=>{
  const rows=(await pool.query("SELECT actor_id,action,details FROM platform_audit WHERE action LIKE 'admin.%' AND actor_id LIKE 'operator:%'")).rows;assert(rows.some(x=>x.actor_id==='operator:'+owner.id));assert(rows.some(x=>x.actor_id==='operator:'+finance.id));const text=JSON.stringify(rows);for(const secret of [owner.password,owner.secret,owner.cookie.split('=')[1],owner.recovery[0],finance.secret])assert(!text.includes(secret));
  const old=finance.cookie;assert.equal((await api('/api/admin/logout',{cookie:old,body:{}})).status,200);assert.equal((await api('/api/platform/admin/commerce',{cookie:old})).status,401);
  assert.equal((await make().status()).mode,'named');
 });
};
