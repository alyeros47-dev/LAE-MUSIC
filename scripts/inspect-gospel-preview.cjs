'use strict';
// Read-only readiness inspection. Never updates a service, environment or database.
const TARGET='srv-dbfmk5ss728c73ded300',ORIGIN='https://lae-music-review-sandbox.onrender.com';
function assess(service,rows){
 if(service.id!==TARGET||service.name!=='lae-music-review-sandbox'||service.type!=='web_service'||service.repo?.replace(/\.git$/,'')!=='https://github.com/alyeros47-dev/LAE-MUSIC'||service.serviceDetails?.url!==ORIGIN)throw Error('Unexpected review service; refused.');
 const env={};for(const row of rows){const x=row.envVar||row;if(typeof x.key!=='string'||typeof x.value!=='string'||Object.hasOwn(env,x.key))throw Error('Invalid environment inventory.');env[x.key]=x.value;}
 if(env.NODE_ENV!=='staging'||env.LAE_REVIEW_ENVIRONMENT!=='pr6-ephemeral-review-v1'||env.DATABASE_URL)throw Error('Sandbox isolation not established. No update is permitted.');
 const persistent=require('../deploy/review-state.cjs').persistentService(service)&&env.LAE_REVIEW_PERSISTENT_STORAGE==='1';
 return {origin:ORIGIN,service:TARGET,branch:service.branch,persistent_storage_verified:persistent,code_only_update_safe:persistent,provider_configuration:{lyrics:!!env.OPENAI_API_KEY,music:!!env.MUSICAPI_API_KEY},production_writes:0,provider_requests:0,environment_changes:0,reason:persistent?'Dedicated review storage is configured; a separately guarded code-only update can retain test data.':'The review database/media are ephemeral. A replacement deployment could discard accounts and files; do not replace it without preserving those records first.'};
}
async function inspect({key=process.env.RENDER_API_KEY,fetchImpl=fetch}={}){
 if(!key)throw Error('RENDER_API_KEY is unavailable in this workflow; no changes made.');
 async function get(path){const r=await fetchImpl('https://api.render.com/v1'+path,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+key,Accept:'application/json'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Read-only Render inspection HTTP '+r.status);return r.json();}
 const service=await get('/services/'+TARGET),rows=await get('/services/'+TARGET+'/env-vars?limit=100');
 if(!Array.isArray(rows)||rows.length>=100)throw Error('Incomplete sandbox environment inventory.');
 const report=assess(service,rows),deploys=await get('/services/'+TARGET+'/deploys?limit=1'),d=deploys[0]?.deploy||deploys[0];
 return {...report,current_deploy:{status:d?.status||null,commit:d?.commit?.id||null}};
}
module.exports={assess,inspect,TARGET,ORIGIN};
if(require.main===module)inspect().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
