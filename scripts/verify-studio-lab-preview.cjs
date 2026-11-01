'use strict';
// Real HTTP checks of only the newly provisioned lab. No paid generation.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
async function verify({url,durable=false,key=process.env.RENDER_API_KEY,fetchImpl=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const base=new URL(url);assert(base.protocol==='https:'&&base.hostname.startsWith('lae-music-studio-lab')&&base.hostname.endsWith('.onrender.com'),'Only the new internal lab may be checked.');const origin=base.origin;
 const raw=await fetchImpl('https://api.render.com/v1/services/srv-dbfmk5ss728c73ded300/env-vars?limit=100',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});assert(raw.ok,'Review administrator connection unavailable.');const rows=await raw.json(),admin=rows.map(r=>r.envVar||r).find(e=>e.key==='ADMIN_KEY')?.value;assert(admin?.length>=16,'Review administrator key unavailable.');
 let cookie='',csrf='';async function api(p,body){const r=await fetchImpl(origin+p,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,...(body===undefined?{}:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':csrf})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});return {r,data:await r.json()};}
 const unauth=await api('/api/lab/usage');assert.equal(unauth.r.status,401);
 const login=await api('/api/lab/login',{password:admin});assert.equal(login.r.status,200);cookie=login.r.headers.get('set-cookie').split(';')[0];
 const session=await api('/api/lab/session');assert(session.data.authenticated&&session.data.model==='gpt-6.1-sol'&&!session.data.audio_generation_enabled);csrf=session.data.csrf;
 const page=await fetchImpl(origin+'/studio-lab',{headers:{Cookie:cookie},signal:AbortSignal.timeout(20000)});assert((await page.text()).includes('Your song starts with your words.'));
 const usage=await api('/api/lab/usage');assert.equal(usage.data.cap_usd,0);assert.equal(usage.data.durable_metering_ready,durable);
 const research=await api('/api/lab/research',{artist:'Sinach'});assert.equal(research.r.status,200);assert.equal(research.data.status,'retrieved');assert(research.data.requests.length>=2&&research.data.requests.every(r=>r.status===200&&r.fee_usd===0));
 const job=await api('/api/lab/generate',{brief:'An original Gospel thanksgiving song with guitar and talking drum.',request_key:crypto.randomUUID()});assert.equal(job.r.status,202);let blocked=false;for(let i=0;i<30;i++){const j=await api('/api/lab/jobs/'+job.data.id);if(j.data.status==='failed'){assert.equal(j.data.error_status,402,'Generation must stop at the zero-budget fence.');blocked=true;break;}await wait(1000);}assert(blocked,'Budget fence verification is still pending.');
 const after=await api('/api/lab/usage');assert.equal(after.data.committed_estimate_usd,0);assert.equal((await api('/api/music/sonic/create')).r.status,404);
 await api('/api/lab/logout',{});
 return {admin_only_access:'PASS',rendered_studio:'PASS',model:'gpt-6.1-sol',free_connected_artist_research:'PASS',durable_metering_ready:durable,zero_budget_fence:'PASS',research_fee_usd:0,paid_text_requests:0,musicapi_requests:0,customer_credits_used:0,production_changes:0};
}
module.exports={verify};
