'use strict';
// Customer adapter for the verified description interpreter/composer. Reuses
// existing account entitlements, lyric credits, history and request journal.
// No lab flag, administrator key, new purchase, schema migration or $0 lab cap.
const crypto=require('node:crypto'),credits=require('./credits');
const {transaction,idempotent,digest,requestKey,fail}=require('./transactions');
const prompts=require('./studio-lab-prompts'),{createLab}=require('./studio-lab');
const {createResearch}=require('./studio-lab-research');
function enabled(env=process.env){return env.LAE_DESCRIPTION_STUDIO_DISABLED!=='1'&&!!env.OPENAI_API_KEY;}
function metering(pool,artistId,reference){
 const scope='description-cost:'+artistId;
 async function reserve(run,phase,maxCost){const key=run+'_'+phase;const r=await pool.query('INSERT INTO platform_requests(scope,request_key,payload_hash,result) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING request_key',[scope,key,digest({run,phase}),JSON.stringify({state:'reserved',phase,reserved_estimate_usd:maxCost,model:prompts.MODEL})]);if(!r.rowCount)throw fail(409,'This request is already being checked. Please reopen it instead of submitting again.');return {id:key,key};}
 async function record(id,data,cost){await pool.query('UPDATE platform_requests SET result=result || $3::jsonb WHERE scope=$1 AND request_key=$2',[scope,id,JSON.stringify({state:'recorded',estimated_usd:cost,model:data.model,service_tier:data.service_tier,provider_request_id:data.id,usage:data.usage})]);}
 async function uncertain(id){await pool.query('UPDATE platform_requests SET result=result || $3::jsonb WHERE scope=$1 AND request_key=$2',[scope,id,JSON.stringify({state:'uncertain'})]);}
 async function research(run,requests){await pool.query('INSERT INTO platform_requests(scope,request_key,payload_hash,result) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',['description-research:'+artistId,run,digest({run}),JSON.stringify({requests})]);}
 async function checkFresh(hashes){return transaction(pool,async db=>{await db.query('SELECT pg_advisory_xact_lock($1)',[3811050]);const previous=await db.query("SELECT result FROM platform_requests WHERE scope='description-fingerprints' ORDER BY created_at DESC LIMIT 64");if(previous.rows.some(r=>prompts.similar(hashes,r.result.hashes||[])))return false;await db.query('INSERT INTO platform_requests(scope,request_key,payload_hash,result) VALUES($1,$2,$3,$4)',['description-fingerprints',reference,digest(hashes),JSON.stringify({hashes})]);return true;});}
 return {reserve,record,uncertain,research,checkFresh};
}
function customerOutput(result){return {title:result.title,lyrics:result.lyrics,style:result.style,detailed_style:result.detailed_style,duration_seconds:result.duration_seconds,description_request_id:result.description_request_id,description_mode:true,model:prompts.MODEL,uploadCode:null};}
function create({pool,me,validOrigin,body,json,env=process.env,grant=async()=>{},fetchImpl=fetch,makeCore=createLab}={}){
 const jobs=new Map(),research=createResearch({fetchImpl});
 const scope=user=>user.owner?'description-owner:'+user.id:'lyrics:'+user.id;
 async function refund(user,key,reference){if(user.owner)await pool.query('UPDATE platform_requests SET result=$3 WHERE scope=$1 AND request_key=$2',[scope(user),key,JSON.stringify({status:'failed',reference})]);else await credits.refundLyrics(pool,user.id,reference,key);}
 async function generate(user,key,input,reference){
  const store=metering(pool,user.id,reference),core=makeCore({store,key:env.OPENAI_API_KEY,privacyKey:env.ADMIN_KEY||env.OPENAI_API_KEY,fetchImpl,research});
  try{
   const result=await core.run({...input,variation:reference},reference);
   if(result.status!=='ready'){await refund(user,key,reference);return {status:result.status,question:result.question};}
   if(!result.audio_ready)throw fail(409,'This draft repeated too much earlier work. Your lyrics credit has been restored; try a fresh interpretation.');
   const output={title:result.title,lyrics:result.lyrics,style:result.provider_style,detailed_style:result.detailed_style,duration_seconds:result.duration_seconds,description_request_id:reference,description_mode:true};
   let saved;if(user.owner){saved={...output,model:prompts.MODEL,uploadCode:null};await pool.query('UPDATE platform_requests SET result=$3 WHERE scope=$1 AND request_key=$2',[scope(user),key,JSON.stringify({status:'completed',output:saved})]);}else saved=await credits.completeLyrics(pool,user.id,reference,key,output,prompts.MODEL);
   return {status:'ready',...customerOutput(saved)};
  }catch(error){
   const pending=await pool.query("SELECT 1 FROM platform_requests WHERE scope=$1 AND request_key LIKE $2 AND result->>'state' IN ('uncertain','reserved') LIMIT 1",['description-cost:'+user.id,reference+'_%']);
   if(pending.rowCount)throw Object.assign(fail(503,'Your request needs a confirmation check before another attempt. Your draft is saved; please contact support with this reference: '+reference),{code:'verification_required'});
   await refund(user,key,reference);
   if(error.status===409)throw error;
   throw fail(502,'We could not complete this song draft. Your lyrics credit was restored. Please try again.');
  }
 }
 async function handler(req,res,url){
  if(!url.pathname.startsWith('/api/music/description/'))return false;
  if(!enabled(env)){json(res,503,{error:'Songwriting is temporarily unavailable. Your existing drafts are safe.'});return true;}
  const member=await me(req),user=req.adminPrincipal?.role==='owner'?{id:'owner-'+req.adminPrincipal.id,owner:true}:member;if(!user){json(res,401,{error:'Sign in to your LAE-MUSIC account to create or reopen your song.'});return true;}
  try{
   if(url.pathname==='/api/music/description/start'&&req.method==='POST'){
    if(!validOrigin(req))throw fail(403,'Refresh this page before generating.');
    const value=await body(req,70000),input=prompts.request({brief:value.idea,answer:value.answer}),key=requestKey(req.headers['idempotency-key']);
    if(!user.owner){await require('./artist-access').requirePackage(pool,user.id,env);await grant(user.id);}
    const payload={mode:'description-v1',idea:input.brief,answer:input.answer,model:prompts.MODEL};
    let reservation,created=false;
    if(user.owner){const entry=await transaction(pool,db=>idempotent(db,scope(user),key,payload,async()=>{created=true;return {status:'pending',reference:crypto.randomUUID()};}));if(entry.status==='completed')reservation={replay:entry.output};else{reservation={reference:entry.reference};if(!created){json(res,202,{id:entry.reference,status:'running'});return true;}}}
    else{try{reservation=await credits.reserveLyrics(pool,user.id,key,payload,{requireArtistPackage:true,accessEnv:env});}catch(error){if(error.status===409){const old=await pool.query('SELECT payload_hash,result FROM platform_requests WHERE scope=$1 AND request_key=$2',[scope(user),key]);if(old.rows[0]?.payload_hash===digest(payload)&&old.rows[0]?.result?.status==='pending'){json(res,202,{id:old.rows[0].result.reference,status:'running'});return true;}}throw error;}}
    if(reservation.replay){json(res,200,{status:'complete',result:{status:'ready',...customerOutput(reservation.replay)}});return true;}
    const id=reservation.reference,job={artistId:user.id,status:'running',created:Date.now()};jobs.set(id,job);
    for(const [old,j]of jobs)if(j.created<Date.now()-3600000&&j.status!=='running')jobs.delete(old);
    Promise.resolve().then(()=>generate(user,key,input,id)).then(result=>{job.result=result;job.status='complete';},error=>{job.status='failed';job.error=error.message;job.error_status=error.status||502;job.code=error.code||null;});
    json(res,202,{id,status:'running'});return true;
   }
   if(req.method==='GET'&&url.pathname.startsWith('/api/music/description/jobs/')){
    const id=url.pathname.split('/').at(-1);if(!/^[a-f0-9-]{36}$/.test(id))throw fail(404,'Song draft not found.');
    const job=jobs.get(id);if(job&&String(job.artistId)===String(user.id)){json(res,200,{id,status:job.status,result:job.result,error:job.error,error_status:job.error_status,code:job.code});return true;}
    const record=await pool.query("SELECT result FROM platform_requests WHERE scope=$1 AND (result->>'reference'=$2 OR result->'output'->>'description_request_id'=$2) LIMIT 1",[scope(user),id]);
    if(!record.rowCount)throw fail(404,'This song draft was not found in your account.');
    const saved=record.rows[0].result;if(saved.status==='completed'){json(res,200,{id,status:'complete',result:{status:'ready',...customerOutput(saved.output)}});return true;}
    if(saved.status==='failed'){json(res,200,{id,status:'failed',error:user.owner?'This draft could not be completed. Please start a new draft.':'This draft could not be completed. Your lyrics credit was restored.',error_status:502});return true;}
    json(res,200,{id,status:'failed',code:'verification_required',error_status:503,error:'This request needs a confirmation check. Your draft is safe; contact support with reference '+id+' before starting again.'});return true;
   }
   throw fail(404,'Songwriting request not found.');
  }catch(error){json(res,error.status||503,{error:error.status?error.message:'Songwriting is temporarily unavailable. Your draft is saved.'});return true;}
 }
 return {handler};
}
module.exports={create,enabled,metering,customerOutput};
