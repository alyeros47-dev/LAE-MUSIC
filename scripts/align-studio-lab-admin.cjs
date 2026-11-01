'use strict';
// Use the owner's existing LIVE administrator key in the private lab. The live
// service is read-only here: never rotate its key or change its configuration.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const LIVE='srv-db84s7m89jmc73c7l9rg',LAB='srv-dbjqalc9v7es73as270g',REVIEW='srv-dbfmk5ss728c73ded300',REPO='https://github.com/alyeros47-dev/LAE-MUSIC';
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(),crypto.createHash('sha256').update(b).digest());
async function align({key=process.env.RENDER_API_KEY,fetchImpl=fetch}={}){
 assert(key,'Render management connection unavailable.');
 async function api(p,method='GET',body){assert(method==='GET'||method==='PUT'&&p===`/services/${LAB}/env-vars/ADMIN_KEY`,'Only the new lab administrator variable may be changed.');const r=await fetchImpl('https://api.render.com/v1'+p,{method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)});assert(r.ok,'Administrator alignment HTTP '+r.status);return r.status===204?null:r.json();}
 async function vars(id){const rows=await api(`/services/${id}/env-vars?limit=100`);assert(Array.isArray(rows)&&rows.length<100,'Incomplete environment inventory.');return Object.fromEntries(rows.map(r=>[(r.envVar||r).key,(r.envVar||r).value]));}
 const live=await api('/services/'+LIVE),lab=await api('/services/'+LAB),review=await api('/services/'+REVIEW);
 assert(live.id===LIVE&&live.name==='LAE-MUSIC'&&live.branch==='main'&&live.repo.replace(/\.git$/,'')===REPO);
 assert(lab.id===LAB&&lab.name==='lae-music-studio-lab'&&lab.branch==='codex/description-led-studio-lab'&&lab.repo.replace(/\.git$/,'')===REPO&&lab.ownerId===live.ownerId);
 assert(review.id===REVIEW&&review.name==='lae-music-review-sandbox'&&review.ownerId===live.ownerId);
 const source=await vars(LIVE),target=await vars(LAB),oldReview=await vars(REVIEW);
 assert(typeof source.ADMIN_KEY==='string'&&source.ADMIN_KEY.length>=16,'Existing live administrator key is unavailable. No key was created or reset.');
 assert(target.STUDIO_LAB_ENVIRONMENT==='description-lab-v1'&&target.NODE_ENV!=='production'&&target.STUDIO_LAB_BUDGET_USD==='0');
 const matched=equal(source.ADMIN_KEY,target.ADMIN_KEY),reviewMatched=equal(source.ADMIN_KEY,oldReview.ADMIN_KEY);
 if(!matched)await api(`/services/${LAB}/env-vars/ADMIN_KEY`,'PUT',{value:source.ADMIN_KEY});
 const after=await vars(LAB),sourceAfter=await vars(LIVE),reviewAfter=await vars(REVIEW);
 assert(equal(after.ADMIN_KEY,source.ADMIN_KEY)&&equal(sourceAfter.ADMIN_KEY,source.ADMIN_KEY)&&reviewAfter.ADMIN_KEY===oldReview.ADMIN_KEY);
 for(const name of Object.keys(target).filter(n=>n!=='ADMIN_KEY'))assert(after[name]===target[name],'An unrelated lab variable changed.');
 return {lab_matches_live_before:matched,review_matches_live:reviewMatched,lab_matches_live_after:true,preview_key_updated:!matched,production_writes:0,review_writes:0,keys_created:0,keys_reset:0,secret_values_logged:false};
}
module.exports={align};
