'use strict';
// Resume only the already-created schema-only test branch and new lab service.
// No production database connection or production/review write is permitted.
const assert=require('node:assert/strict');
const {validateService}=require('./provision-studio-lab.cjs');
const PROJECT='restless-brook-43273058',BRANCH='br-delicate-queen-b422rl34',ENDPOINT='ep-fancy-sun-b4r56zue',SERVICE='srv-dbjqalc9v7es73as270g',ROLE='lae_studio_lab_owner';
async function complete({env=process.env,fetchImpl=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 assert(env.RENDER_API_KEY&&env.NEON_API_KEY,'Separate lab management access unavailable.');
 async function api(kind,p,method='GET',body){
  if(method!=='GET')assert(kind==='neon'?method==='POST'&&p===`/branches/${BRANCH}/databases`:method==='PUT'&&[`/services/${SERVICE}/env-vars/STUDIO_LAB_DATABASE_URL`,`/services/${SERVICE}/env-vars/STUDIO_LAB_DATABASE_HOST`].includes(p),'Only the empty test database and two new lab environment variables may be changed.');
  const base=kind==='neon'?'https://console.neon.tech/api/v2/projects/'+PROJECT:'https://api.render.com/v1',key=kind==='neon'?env.NEON_API_KEY:env.RENDER_API_KEY;
  const r=await fetchImpl(base+p,{method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Object.assign(Error(`${kind} ${method} ${p}: HTTP ${r.status}; existing sites unchanged.`),{status:r.status});return r.status===204?null:r.json();
 }
 const service=await api('render','/services/'+SERVICE);validateService(service,service.ownerId);
 const entries=Object.fromEntries((await api('render',`/services/${SERVICE}/env-vars?limit=100`)).map(r=>[(r.envVar||r).key,(r.envVar||r).value]));assert(entries.STUDIO_LAB_ENVIRONMENT==='description-lab-v1'&&entries.STUDIO_LAB_BUDGET_USD==='0');
 const b=(await api('neon','/branches/'+BRANCH)).branch;assert(b.id===BRANCH&&b.name==='lae-studio-description-lab'&&['parent-schema','schema-only'].includes(b.init_source)&&b.default!==true&&b.primary!==true&&b.current_state==='ready');
 const endpoint=(await api('neon','/endpoints/'+ENDPOINT)).endpoint;assert(endpoint.id===ENDPOINT&&endpoint.branch_id===BRANCH&&endpoint.host.endsWith('.neon.tech')&&endpoint.type==='read_write');
 let uri=entries.STUDIO_LAB_DATABASE_URL;
 if(uri){const u=new URL(uri);assert(u.hostname===endpoint.host&&u.pathname==='/lae_studio_lab'&&u.username===ROLE,'Existing lab database binding differs; no replacement allowed.');}
 else{
  const secret=await api('neon',`/branches/${BRANCH}/roles/${ROLE}/reveal_password`);assert(typeof secret.password==='string'&&secret.password.length>=16,'Test-role password could not be retrieved; no existing password was reset.');
  const u=new URL('postgresql://'+endpoint.host+'/lae_studio_lab');u.username=ROLE;u.password=secret.password;u.searchParams.set('sslmode','require');uri=u.href;
  // Neon can return 423 while the test compute is idle. Wake ONLY this new
  // schema-only endpoint with SELECT 1; never connect to the parent endpoint.
  const warm=new URL(uri);warm.pathname='/neondb';const probe=new(require('pg').Pool)({connectionString:warm.href,max:1,connectionTimeoutMillis:30000});try{await probe.query('SELECT 1');}catch{throw Error('The isolated schema-only test compute could not be woken; no production database was contacted.');}finally{await probe.end();}
  let ready=false;for(let i=0;i<15;i++){
   const list=await api('neon',`/branches/${BRANCH}/databases`),existing=list.databases.find(d=>d.name==='lae_studio_lab');if(existing){assert(existing.owner_name===ROLE);ready=true;break;}
   try{await api('neon',`/branches/${BRANCH}/databases`,'POST',{database:{name:'lae_studio_lab',owner_name:ROLE}});}
   catch(e){if(e.status!==423)throw e;}
   await wait(2000);
  }assert(ready,'Empty test database is not ready; no production workaround was attempted.');
 }
 // Initialize/inspect ONLY the new empty lab database, using the new lab role.
 const {databaseUrl,createStore}=require('../lib/studio-lab-store'),settings={NODE_ENV:'staging',STUDIO_LAB_DATABASE_URL:uri,STUDIO_LAB_DATABASE_HOST:endpoint.host};databaseUrl(settings);
 const pool=new(require('pg').Pool)({connectionString:uri,max:1,connectionTimeoutMillis:25000});try{const r=await pool.query('SELECT current_database() AS database,current_user AS role');assert(r.rows[0].database==='lae_studio_lab'&&r.rows[0].role===ROLE);const store=createStore({pool,cap:0});await store.init();assert.equal((await store.status()).committed_estimate_usd,0);}finally{await pool.end();}
 if(!entries.STUDIO_LAB_DATABASE_URL){await api('render',`/services/${SERVICE}/env-vars/STUDIO_LAB_DATABASE_URL`,'PUT',{value:uri});await api('render',`/services/${SERVICE}/env-vars/STUDIO_LAB_DATABASE_HOST`,'PUT',{value:endpoint.host});}
 return {isolated_metering_database:'PASS',service_id:SERVICE,branch_id:BRANCH,expires_at:b.expires_at,cap_usd:0,production_writes:0,existing_review_writes:0,password_resets:0};
}
module.exports={complete};
