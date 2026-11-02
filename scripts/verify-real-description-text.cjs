'use strict';
// One owner-authorized, bounded real text generation. No audio, purchase, live
// data write, artist-wallet debit or provider retry is performed here.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
async function verify({env=process.env,fetchImpl=fetch,brief,expectedArtist='Sinach'}={}){
 assert(env.RENDER_API_KEY&&env.LAE_REAL_TEXT_TEST==='owner-authorized','Explicit real-text verification context is required.');
 async function vars(id){const r=await fetchImpl(`https://api.render.com/v1/services/${id}/env-vars?limit=100`,{headers:{Authorization:'Bearer '+env.RENDER_API_KEY},signal:AbortSignal.timeout(20000)});assert(r.ok,'Provider configuration inspection failed.');return Object.fromEntries((await r.json()).map(v=>[(v.envVar||v).key,(v.envVar||v).value]));}
 const live=await vars('srv-db84s7m89jmc73c7l9rg'),lab=await vars('srv-dbjqalc9v7es73as270g');assert(live.OPENAI_API_KEY,'Existing live OpenAI connection is absent.');
 const settings={NODE_ENV:'staging',STUDIO_LAB_DATABASE_URL:lab.STUDIO_LAB_DATABASE_URL,STUDIO_LAB_DATABASE_HOST:lab.STUDIO_LAB_DATABASE_HOST};require('../lib/studio-lab-store').databaseUrl(settings);
 assert(new URL(settings.STUDIO_LAB_DATABASE_URL).hostname!==new URL(live.DATABASE_URL).hostname,'Production database access is prohibited in this test.');
 const pool=new(require('pg').Pool)({connectionString:settings.STUDIO_LAB_DATABASE_URL,max:2,connectionTimeoutMillis:20000});
 const store=require('../lib/studio-lab-store').createStore({pool,cap:1});let providerPosts=0;
 const meteredFetch=async(url,options={})=>{const r=await fetchImpl(url,options);if(url==='https://api.openai.com/v1/responses'){providerPosts++;if(!r.ok){let err={};try{err=await r.clone().json();}catch{}console.log(JSON.stringify({provider_http:r.status,provider_error_code:err.error?.code||null,provider_error_type:err.error?.type||null,parameter:err.error?.param||null,provider_message:String(err.error?.message||'').replaceAll(live.OPENAI_API_KEY,'[REDACTED]').replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]').slice(0,300),model:'gpt-6.1-sol'}));}}return r;};
 try{
  await store.init();const run=await store.begin('owner-controlled-real-text-verification',crypto.randomUUID());
  const core=require('../lib/studio-lab').createLab({store,key:live.OPENAI_API_KEY,privacyKey:lab.ADMIN_KEY,fetchImpl:meteredFetch});
  const input=require('../lib/studio-lab-prompts').request({brief:brief||'Write an original three-minute Gospel thanksgiving song about a nurse completing her training while caring for her family. English and natural Yoruba, including the meaningful phrase Mo dupe. I want an expansive melodic chorus and expressive phrasing informed by Sinnach, the Nigerian Gospel singer (I may have misspelled her name), without copying her songs, melodies or exact voice. Use warm highlife guitar, talking drum and melodic bass, not a generic keyboard worship arrangement. Keep the story specific to finishing her training, not poverty, hunger or a road story. Give complete lyrics with a resolved ending and matching detailed production instructions.'});
  const result=await core.run(input,run);assert.equal(result.status,'ready','The real test returned a clarification or non-ready result.');assert(result.lyrics.length>100&&result.detailed_style.length>100&&result.provider_style.length<=1000);assert(result.artist_research.some(a=>a.resolved_name.toLowerCase().includes(expectedArtist.toLowerCase())),'The misspelled artist reference was not resolved.');
  require('node:fs').mkdirSync('artifacts',{recursive:true});require('node:fs').writeFileSync('artifacts/real-description-text.json',JSON.stringify(result,null,2));
  const usage=await store.status();return {real_text_generation:'PASS',model:'gpt-6.1-sol',provider_requests:providerPosts,lyrics_characters:result.lyrics.length,detailed_style_characters:result.detailed_style.length,engine_prompt_characters:result.provider_style.length,researched_artists:result.artist_research.map(a=>a.resolved_name),usage:result.usage,committed_estimate_usd:usage.committed_estimate_usd,hard_test_cap_usd:1,audio_requests:0,customer_credits_used:0,production_writes:0};
 }finally{await pool.end();}
}
module.exports={verify};
