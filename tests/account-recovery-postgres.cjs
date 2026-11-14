'use strict';
// Disposable local PostgreSQL only. Delivery is an explicit in-memory mailbox,
// not proof of delivery through the production email provider.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const {runtime}=require('./runtime.cjs'),{createAccountSecurity}=require('../lib/account-security');
const target=require('./ci-database.cjs').ciDatabase();
async function isolated(run){
 const control=new Pool({connectionString:target.href}),schema='password_repair_'+crypto.randomBytes(5).toString('hex');await control.query('CREATE SCHEMA '+schema);
 const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});
 try{await run(pool);}finally{await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
}
test('existing account security remains compatible with original credentials and linked profiles',async t=>isolated(async pool=>{await require('./account-security-postgres.cjs')(t,{pool});}));
test('email-only recovery locates the correct identity without changing accounts or granting paid access',async t=>isolated(async pool=>{
 const delivered=[],accounts=createAccountSecurity({pool,mailer:{enabled:()=>true,send:async m=>delivered.push(m)},emailKey:'ab'.repeat(32),publicOrigin:'https://lae.test'});
 const app=await runtime({pool,accountService:accounts,env:{NODE_ENV:'test',STUDIO_RELEASE_WORKER_ENABLED:'false'}});accounts.stop();
 const api=async(path,body,cookie)=>{const r=await app.request(path,{method:body===undefined?'GET':'POST',body,headers:cookie?{cookie}:{}});return {status:r.status,data:r.json(),cookie:[r.headers['set-cookie']||[]].flat().map(x=>x.split(';')[0]).join('; ')};};
 const password='OriginalLegacyPassword123',salt=crypto.randomBytes(16).toString('hex'),hash=crypto.scryptSync(password,salt,64).toString('hex'),email='legacy_artist@recovery.invalid';
 const artist=(await pool.query("INSERT INTO creators(display_name,email,password_salt,password_hash,plan,country) VALUES('Legacy artist',$1,$2,$3,'starter','Nigeria') RETURNING id",[email,salt,hash])).rows[0];
 const login=(role,emailValue=email,pw=password)=>api('/api/platform/account/login',{role,email:emailValue,password:pw});
 await t.test('original scrypt password survives generic login, logout and new sessions unchanged',async()=>{
  const a=await login('listener',' '+email.toUpperCase()+' ');assert.equal(a.status,200);assert.equal(a.data.role,'artist');assert.equal(String(a.data.user.id),String(artist.id));
  assert.equal((await api('/api/logout',{},a.cookie)).status,200);assert.equal((await login('artist')).status,200);
  const stored=(await pool.query('SELECT password_salt,password_hash FROM creators WHERE id=$1',[artist.id])).rows[0];assert.deepEqual(stored,{password_salt:salt,password_hash:hash});
 });
 await t.test('artist and unknown addresses receive the same response; only the existing artist receives a reset',async()=>{
  const known=await api('/api/platform/account/reset-request',{email:' '+email.toUpperCase()+' '}),unknown=await api('/api/platform/account/reset-request',{email:'missing@recovery.invalid'});assert.equal(known.status,202);assert.deepEqual(known.data,unknown.data);
  assert.equal(await accounts.deliverOne(),true);assert.equal(delivered.length,1);assert.equal(delivered[0].role,'artist');assert.equal(delivered[0].email,email);
  const link=Object.fromEntries(new URLSearchParams(new URL(delivered[0].url).hash.slice(1)));
  assert.equal((await api('/api/platform/account/reset-password',{...link,newPassword:'RecoveredLegacyPassword123'})).status,200);
  assert.equal((await login('listener',email,'RecoveredLegacyPassword123')).status,200);assert.equal((await login('artist')).status,401);
  assert.equal((await api('/api/platform/account/reset-password',{...link,newPassword:'ReusedLegacyPassword123'})).status,400);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM listeners WHERE email=$1',[email])).rows[0].n,0);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_subscriptions WHERE artist_id=$1',[artist.id])).rows[0].n,0);
 });
 await t.test('a linked listener and artist receive one link that updates both existing profiles',async()=>{
  const body={name:'Linked recovery',email:'linked@recovery.invalid',password,confirmPassword:password,country:'Nigeria',plan:'starter'};
  const listener=await api('/api/listener/register',body),artist=await api('/api/register',body);assert.equal(listener.status,201);assert.equal(artist.status,201);
  const before=(await pool.query('SELECT artist_id,listener_id FROM account_role_links WHERE artist_id=$1',[artist.data.user.id])).rows;
  assert.equal((await api('/api/platform/account/reset-request',{email:body.email})).status,202);const n=delivered.length;assert(await accounts.deliverOne());assert.equal(await accounts.deliverOne(),false);assert.equal(delivered.length,n+1);
  const link=Object.fromEntries(new URLSearchParams(new URL(delivered.at(-1).url).hash.slice(1)));assert.equal((await api('/api/platform/account/reset-password',{...link,newPassword:'LinkedRecoveredPassword123'})).status,200);
  for(const role of ['artist','listener']){const r=await login(role,body.email,'LinkedRecoveredPassword123');assert.equal(r.status,200);assert.equal(r.data.role,role);assert.equal((await login(role,body.email,password)).status,401);}
  assert.deepEqual((await pool.query('SELECT artist_id,listener_id FROM account_role_links WHERE artist_id=$1',[artist.data.user.id])).rows,before);
 });
 accounts.stop();
}));
