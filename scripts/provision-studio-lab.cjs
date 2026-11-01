'use strict';
// Temporary FREE internal preview only. No mutation endpoint for production or
// the existing review service is reachable through these API allowlists.
const assert=require('node:assert/strict');
const NAME='lae-music-studio-lab',BRANCH='codex/description-led-studio-lab',REPO='https://github.com/alyeros47-dev/LAE-MUSIC';
const LIVE='srv-db84s7m89jmc73c7l9rg',REVIEW='srv-dbfmk5ss728c73ded300';
function validateService(s,owner){assert(s.id!==LIVE&&s.id!==REVIEW&&s.name===NAME&&s.ownerId===owner&&s.branch===BRANCH&&s.repo?.replace(/\.git$/,'')===REPO&&s.serviceDetails?.plan==='free'&&s.serviceDetails?.runtime==='node'&&!s.serviceDetails?.disk,'Unexpected lab service; no update allowed.');const url=new URL(s.serviceDetails.url);assert(url.protocol==='https:'&&url.hostname.endsWith('.onrender.com')&&!['lae-music.onrender.com','lae-music-review-sandbox.onrender.com'].includes(url.hostname));return url.origin;}
// Render can refresh updatedAt on an existing deploy without a new release.
// Compare deployed identity/state rather than mutable metadata timestamps.
function deploymentIdentity(rows){const d=rows?.[0]?.deploy||rows?.[0];return JSON.stringify({id:d?.id||null,commit:d?.commit?.id||null,status:d?.status||null});}
async function provision({env=process.env,fetchImpl=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),log=console.log}={}){
 assert(env.RENDER_API_KEY,'Render management access unavailable.');assert(/^[a-f0-9]{40}$/.test(env.LAB_COMMIT||''),'An exact candidate commit is required.');
 // Increasing this must follow explicit user USD authorization and rate review.
 const cap=Number(env.LAB_APPROVED_USD||0);assert.equal(cap,0,'Initial provisioning permits no paid text tests.');
 let target=null,durableConfigured=false;
 async function api(kind,suffix,method='GET',body){
  assert.equal(kind,'render','This preview provisioner has no database-management access.');
  if(method!=='GET')assert(method==='POST'&&(suffix==='/services'||target&&suffix===`/services/${target}/deploys`),'Mutation outside the isolated lab refused.');
  const base='https://api.render.com/v1',key=env.RENDER_API_KEY;
  const r=await fetchImpl(base+suffix,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+key,Accept:'application/json','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});assert(r.ok,`${kind} HTTP ${r.status}; no paid-plan fallback or production change is allowed.`);return r.json();
 }
 const live=await api('render','/services/'+LIVE),review=await api('render','/services/'+REVIEW);assert(live.repo.replace(/\.git$/,'')===REPO&&live.name==='LAE-MUSIC'&&review.name==='lae-music-review-sandbox'&&review.ownerId===live.ownerId);
 const before=deploymentIdentity(await api('render','/services/'+LIVE+'/deploys?limit=1')),reviewBefore=deploymentIdentity(await api('render','/services/'+REVIEW+'/deploys?limit=1'));
 let services=[],cursor='';for(let n=0;n<10;n++){const batch=await api('render','/services?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));services.push(...batch.map(x=>x.service));if(batch.length<100)break;assert(n<9&&batch.at(-1).cursor&&batch.at(-1).cursor!==cursor);cursor=batch.at(-1).cursor;}
 const matches=services.filter(s=>s.name===NAME&&s.ownerId===live.ownerId);assert(matches.length<=1,'Ambiguous preview inventory.');let service=matches[0];
 if(service){validateService(service,live.ownerId);const vars=await api('render','/services/'+service.id+'/env-vars?limit=100'),entries=Object.fromEntries(vars.map(v=>[(v.envVar||v).key,(v.envVar||v).value]));assert(entries.STUDIO_LAB_ENVIRONMENT==='description-lab-v1'&&Number(entries.STUDIO_LAB_BUDGET_USD)===0,'Existing preview is not the expected isolated $0 lab.');durableConfigured=!!entries.STUDIO_LAB_DATABASE_URL&&!!entries.STUDIO_LAB_DATABASE_HOST;}
 else{
  const rows=await api('render','/services/'+REVIEW+'/env-vars?limit=100'),existingEnv=Object.fromEntries(rows.map(r=>[(r.envVar||r).key,(r.envVar||r).value]));assert(existingEnv.OPENAI_API_KEY,'Review provider connection unavailable.');
  const liveRows=await api('render','/services/'+LIVE+'/env-vars?limit=100'),liveEnv=Object.fromEntries(liveRows.map(r=>[(r.envVar||r).key,(r.envVar||r).value]));assert((liveEnv.ADMIN_KEY||'').length>=16,'Existing live administrator key unavailable. No key was created.');
  const variables={NODE_ENV:'staging',STUDIO_LAB_ENVIRONMENT:'description-lab-v1',OPENAI_LYRICS_MODEL:'gpt-6.1-sol',OPENAI_API_KEY:existingEnv.OPENAI_API_KEY,ADMIN_KEY:liveEnv.ADMIN_KEY,STUDIO_LAB_BUDGET_USD:'0',STUDIO_LAB_CURRENT_STUDIO:'https://lae-music.com/studio'};
  const result=await api('render','/services','POST',{type:'web_service',name:NAME,ownerId:live.ownerId,repo:REPO,branch:BRANCH,autoDeployTrigger:'off',envVars:Object.entries(variables).map(([key,value])=>({key,value})),serviceDetails:{runtime:'node',plan:'free',region:'oregon',healthCheckPath:'/health',envSpecificDetails:{buildCommand:'npm ci --omit=dev',startCommand:'node scripts/studio-lab-server.cjs'}}});service=result.service||result;validateService(service,live.ownerId);log(JSON.stringify({created:'separate-free-studio-lab',database_connected:false,durable_paid_metering_ready:false,model:'gpt-6.1-sol',approved_text_usd:0,audio_requests:0,production_writes:0,existing_review_writes:0}));
 }
 target=service.id;let deploy=(await api('render','/services/'+target+'/deploys?limit=1'))[0];deploy=deploy?.deploy||deploy;
 if(deploy?.commit?.id!==env.LAB_COMMIT)await api('render','/services/'+target+'/deploys','POST',{commitId:env.LAB_COMMIT,clearCache:'do_not_clear'});
 for(let n=0;n<65;n++){const raw=(await api('render','/services/'+target+'/deploys?limit=1'))[0],d=raw?.deploy||raw;assert(!['build_failed','update_failed','canceled','deactivated'].includes(d?.status),'Separate lab preview failed to build. Existing websites untouched.');if(d?.status==='live'&&d.commit?.id===env.LAB_COMMIT){const origin=validateService(await api('render','/services/'+target),live.ownerId),r=await fetchImpl(origin+'/health',{signal:AbortSignal.timeout(30000)}),h=await r.json();assert(r.ok&&h.studio_lab===true&&h.model==='gpt-6.1-sol'&&h.customer_credit_operations===false&&h.audio_generation_enabled===false&&h.source_commit===env.LAB_COMMIT);assert.equal(deploymentIdentity(await api('render','/services/'+LIVE+'/deploys?limit=1')),before,'Production changed independently during verification.');assert.equal(deploymentIdentity(await api('render','/services/'+REVIEW+'/deploys?limit=1')),reviewBefore,'Existing review changed independently during verification.');return {url:origin+'/studio-lab',service_id:target,source_commit:d.commit.id,production_writes:0,existing_review_writes:0,audio_requests:0,text_budget_usd:0,durable_paid_metering_ready:durableConfigured};}if(n%6===0)log('Waiting for the separate free lab preview; live and review sites remain untouched.');await wait(10000);}
 throw Error('Preview build is pending. Inspect the new lab service; do not recreate the service.');
}
module.exports={provision,validateService,deploymentIdentity};
if(require.main===module)provision().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
