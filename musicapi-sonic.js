'use strict';
const API='https://api.musicapi.ai/api/v1/sonic';
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000){const e=new Error('Request too large');e.status=413;throw e}}try{return JSON.parse(raw)}catch{const e=new Error('Invalid JSON request');e.status=400;throw e}}
function songs(data){const items=Array.isArray(data)?data:Array.isArray(data?.data)?data.data:Array.isArray(data?.songs)?data.songs:[];return items.map(s=>({clip_id:String(s.clip_id||s.music_id||s.id||''),title:String(s.title||'Generated song'),audio_url:s.audio_url||s.audioUrl||s.audio||'',image_url:s.image_url||s.imageUrl||s.image||'',state:String(s.state||s.status||'').toLowerCase(),duration:Number(s.duration)||null})).filter(s=>/^https:\/\//.test(s.audio_url))}
async function remote(path,method,payload){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);try{const r=await fetch(API+path,{method,headers:{Authorization:'Bearer '+process.env.MUSICAPI_API_KEY,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined,signal:controller.signal});const j=await r.json().catch(()=>({}));if(!r.ok||j.code&&j.code!==200&&r.status!==202){const e=new Error(String(j.message||j.error||j.type||'Music provider request failed'));e.status=r.status;e.reviewLimit=r.headers?.get?.('x-lae-review-limit')==='reached';e.reviewRejected=r.headers?.get?.('x-lae-review-rejected')==='before-provider';e.uncertainResponse=r.ok===true||Number(j.code)>=500;e.usableResult=songs(j.data||j.results||j).length>0;e.acceptanceEvidence=!!(j.task_id||j.data?.task_id||j.data?.id);throw e}return j}finally{clearTimeout(timeout)}}
module.exports=async function handleMusicAPI(req,res,p,{me,pool,validOrigin}){
 if(!p.startsWith('/api/music/sonic/'))return false;
 if(!['GET','POST'].includes(req.method)&&!(req.method==='HEAD'&&p==='/api/music/sonic/output'))return send(res,405,{error:'Method not allowed'}),true;
 if(req.method==='POST'&&!validOrigin(req))return send(res,403,{error:'Invalid origin'}),true;
 const user=await me(req);
 if(!user)return send(res,401,{error:'Sign in to your LAE-MUSIC artist account first.'}),true;
 if(!pool)return send(res,503,{error:'Music studio database unavailable'}),true;
 if(!process.env.MUSICAPI_API_KEY)return send(res,503,{error:'MusicAPI key is not configured on Render'}),true;
 if(p==='/api/music/sonic/output')return require('./lib/studio-output').create({pool,provider:module.exports.releaseProvider}).handle(req,res,new URL(req.url,'http://localhost'),async()=>user);


 if(p==='/api/music/sonic/upload-code'&&req.method==='POST'){
  try{const b=await body(req);const permit=await require('./lib/music-upload-codes').issue({pool,provider:module.exports.releaseProvider,artistId:user.id,taskId:String(b?.task_id||''),clipId:String(b?.clip_id||'')});return send(res,200,{uploadCode:permit.uploadCode,title:permit.title,task_id:permit.task_id,clip_id:permit.clip_id}),true;}catch(e){return send(res,e.status||503,{error:e.status?e.message:'The upload code could not be prepared. Your generated song is preserved; try again without generating another song.'}),true;}
 }
 if(p==='/api/music/sonic/create'&&req.method==='POST'){
  let b;try{b=await body(req)}catch(e){return send(res,e.status||400,{error:e.message}),true}if(!b||typeof b!=='object'||Array.isArray(b))return send(res,400,{error:'Invalid song request'}),true;
  try{require('./lib/studio-launch').assertStyle(b.musicDnaStyle);if(b.creationMode==='own'){b.style=require('./lib/studio-launch').ownLyricsStyle(b,user.id,req.headers?.['idempotency-key']);}}catch(e){return send(res,e.status||400,{error:e.message}),true;}
  const title=String(b.title||'').trim(),lyrics=String(b.lyrics||'').trim(),style=String(b.style||'').trim();
  if(title.length<2||title.length>80||lyrics.length<20||lyrics.length>5000||style.length<3||style.length>1000)return send(res,400,{error:'Enter a title, lyrics and music style within the permitted lengths.'}),true;
  let targetDuration;try{targetDuration=require('./lib/studio-limits').durationSeconds(b.duration);require('./lib/studio-limits').validateLyrics(lyrics,targetDuration);}catch(error){return send(res,error.status||400,{error:error.message}),true;}
  const requestKey=req.headers?.['idempotency-key'];
  if(typeof requestKey!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey))return send(res,400,{error:'A valid Idempotency-Key is required. Retry with the same key.'}),true;
  const payloadHash=require('node:crypto').createHash('sha256').update(JSON.stringify({title,lyrics,style,useVoice:b.useVoice===true,...(b.duration===undefined?{}:{duration:targetDuration})})).digest('hex');
  const replay=async(db)=>{const old=await db.query('SELECT payload_hash,task_reference,result FROM studio_request_keys WHERE artist_id=$1 AND request_key=$2',[user.id,requestKey]);if(!old.rowCount)return null;if(old.rows[0].payload_hash!==payloadHash)return {code:409,data:{error:'This generation key was already used for different instructions.'}};return {code:200,data:old.rows[0].result||{task_id:old.rows[0].task_reference,status:'pending',replayed:true}}};
  const previous=await replay(pool);if(previous)return send(res,previous.code,previous.data),true;
  // A saved voice is optional. Only look up a persona when the member explicitly opts in.
    const recent=await pool.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE ((task_id LIKE 'sonic-%' AND status='pending') OR (status IN ('pending','running'))))::int AS active FROM sonic_test_tasks WHERE creator_id=$1 AND (created_at>NOW()-INTERVAL '24 hours' OR status IN ('pending','running') OR (task_id LIKE 'sonic-%' AND status='pending'))",[user.id]);
  if(recent.rows[0].active>0)return send(res,429,{error:'Your previous song is still processing. Please wait before starting another.'}),true;
  if(recent.rows[0].total>=5)return send(res,429,{error:'Safety limit: 5 generation requests per account per 24 hours.'}),true;
  let voiceId=null;
  if(b.useVoice===true){const v=await pool.query("SELECT persona_id FROM artist_voice_profiles WHERE creator_id=$1 AND status='ready'",[user.id]);voiceId=v.rows[0]?.persona_id;if(!voiceId)return send(res,409,{error:'Train your voice profile before selecting Use My Voice'}),true}
  // Reserve one included generation atomically before calling the paid music provider.
  const client=await pool.connect();let reservation=null,trial=false;
  try{
   await client.query('BEGIN');
   const locked=await client.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[user.id]);
   if(!locked.rowCount){await client.query('ROLLBACK');return send(res,404,{error:'Artist account not found'}),true}
   const repeated=await replay(client);if(repeated){await client.query('COMMIT');return send(res,repeated.code,repeated.data),true}
   const active=await client.query("SELECT COUNT(*)::int AS n FROM sonic_test_tasks WHERE creator_id=$1 AND ((task_id LIKE 'sonic-%' AND status='pending') OR (status IN ('pending','running')))",[user.id]);
   if(active.rows[0].n>0){await client.query('ROLLBACK');return send(res,429,{error:'Your previous song is still processing. Please wait before starting another.'}),true}
   const daily=await client.query("SELECT COUNT(*)::int AS n FROM sonic_test_tasks WHERE creator_id=$1 AND created_at>NOW()-INTERVAL '24 hours'",[user.id]);
   if(daily.rows[0].n>=5){await client.query('ROLLBACK');return send(res,429,{error:'Safety limit: 5 generation requests per account per 24 hours.'}),true}
   const sub=await client.query("SELECT id,plan FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' AND starts_at<=NOW() AND expires_at>NOW() AND NOT payment_hold ORDER BY expires_at DESC LIMIT 1 FOR UPDATE",[user.id]);
   const ref='sonic-'+require('node:crypto').randomBytes(16).toString('hex');
   const openReview=process.env.LAE_REVIEW_TEST_OPEN==='1'&&require('./lib/review-testing').enabled(process.env);
   const artistTesting=require('./lib/artist-test-access');
   if(artistTesting.enabled(process.env)&&await artistTesting.remaining(client,user.id)>0){await artistTesting.reserve(client,user.id,ref);trial='artist';}
   if(!trial&&(!sub.rowCount||openReview)){
    if(artistTesting.enabled(process.env)&&!sub.rowCount){await client.query('ROLLBACK');return send(res,402,{error:'Your two complimentary music-generation requests have been used or reserved. No payment was taken.'}),true}
    if(!(process.env.LAE_REVIEW_TEST_ACCESS==='1'&&require('./lib/review-testing').enabled(process.env))){await client.query('ROLLBACK');return send(res,402,{error:'An active paid artist package is required to generate music.'}),true}
    try{await require('./lib/review-testing').reserve(client,user.id,ref);trial=true;}catch(error){await client.query('ROLLBACK');return send(res,error.status||503,{error:error.status?error.message:'Sandbox test allowance unavailable'}),true}
   }
   if(!trial){
   const limits={starter:2,growth:3,professional:6};
   const limit=limits[sub.rows[0].plan]||0;
   const usage=await client.query("SELECT COUNT(*)::int AS used FROM artist_studio_usage WHERE subscription_id=$1 AND purchase_order_id IS NULL",[sub.rows[0].id]);
   let purchase=null;
   if(usage.rows[0].used>=limit){
    const extra=await client.query('SELECT p.order_id FROM studio_purchased_credits p LEFT JOIN payment_refund_cases h ON h.order_id=p.order_id LEFT JOIN artist_studio_usage u ON u.purchase_order_id=p.order_id WHERE p.artist_id=$1 AND u.id IS NULL AND COALESCE(h.benefit_hold,FALSE)=FALSE ORDER BY p.created_at,p.order_id LIMIT 1 FOR UPDATE OF p',[user.id]);
    if(!extra.rowCount){await client.query('ROLLBACK');return send(res,402,{error:'Your included studio generations are exhausted. Additional generations require a verified purchase.'}),true}
    purchase=extra.rows[0].order_id;
   }
   await client.query("INSERT INTO artist_studio_usage(subscription_id,artist_id,generation_reference,purchase_order_id) VALUES($1,$2,$3,$4)",[sub.rows[0].id,user.id,ref,purchase]);
   }
   await client.query("INSERT INTO sonic_test_tasks(task_id,creator_id,status) VALUES($1,$2,'pending')",[ref,user.id]);
   await client.query('INSERT INTO studio_request_keys(artist_id,request_key,payload_hash,task_reference,reservation_reference) VALUES($1,$2,$3,$4,$4)',[user.id,requestKey,payloadHash,ref]);
   await client.query('COMMIT');reservation=ref;
  }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
  const release=async()=>{if(!reservation)return;const db=await pool.connect();try{await db.query('BEGIN');await db.query('DELETE FROM sonic_test_tasks WHERE task_id=$1 AND creator_id=$2',[reservation,user.id]);await db.query('DELETE FROM artist_studio_usage WHERE generation_reference=$1 AND artist_id=$2',[reservation,user.id]);if(trial==='artist')await require('./lib/artist-test-access').settle(db,user.id,reservation,'restored');if(trial===true)await db.query('DELETE FROM review_trial_usage WHERE generation_reference=$1 AND artist_id=$2',[reservation,user.id]);await db.query('UPDATE studio_request_keys SET result=$3 WHERE artist_id=$1 AND request_key=$2',[user.id,requestKey,JSON.stringify({status:'failed',error:'The provider rejected this request. The generation credit was restored. Prepare a new request before retrying.'})]);await db.query('COMMIT');reservation=null}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error('[sonic] failed to release generation reservation',e.message)}finally{db.release()}};
  if(process.env.LAE_REVIEW_TEST_OPEN==='1'&&require('./lib/review-testing').enabled(process.env))require('./lib/review-testing').authorizeProvider(user.id,reservation,'musicapi');
  let result;
  try { result=await remote('/create','POST',{task_type:voiceId?'persona_music':'create_music',...(voiceId?{persona_id:voiceId,audio_weight:0.8,variety:'off'}:{}),custom_mode:true,mv:'sonic-v6',title,prompt:lyrics,tags:style,duration:targetDuration,make_instrumental:false}); }
  catch(e){const providerStatus=Number(e.status)||0;const uncertain=!e.reviewRejected&&(e.uncertainResponse===true||e.usableResult===true||e.acceptanceEvidence===true||!providerStatus||providerStatus>=500||providerStatus===408||providerStatus===409||providerStatus===425);if(!uncertain)await release();console.error('[sonic/create] provider failure',e.status||'','uncertain_acceptance='+uncertain,'reservation='+String(reservation||''));if(uncertain)return send(res,503,{error:'Music provider connection was interrupted or timed out. Your request may have been accepted. Do not retry immediately; contact support to reconcile the reserved generation.',reference:reservation,status:'verification_required'}),true;const code=providerStatus;const message=e.reviewLimit?'This sandbox’s shared music-generation test capacity has been used. No extra provider request was made.':code===401||code===403?'Music provider rejected the API key or account permissions. Check MUSICAPI_API_KEY and provider access.':code===402||code===429?'Music provider credits or rate limit may be exhausted. Check your MusicAPI.ai balance and limits.':code===400||code===422?'Music provider rejected the song request or model settings. Check Render logs for the provider message.':e.name==='AbortError'?'Music provider timed out. Please retry shortly.':'Music provider request failed: '+String(e.message||'Unknown error').slice(0,180);return send(res,502,{error:message}),true}
  const id=String(result.task_id||result.data?.task_id||'');
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(id)){console.error('[sonic/create] unrecognized provider task reference',String(id).slice(0,150),'reservation='+reservation);return send(res,503,{error:'The music provider responded without a usable task reference. The generation is reserved for reconciliation; contact support before retrying.',reference:reservation,status:'verification_required'}),true}
  try{const db=await pool.connect();try{await db.query('BEGIN');const saved=await db.query('UPDATE sonic_test_tasks SET task_id=$1 WHERE task_id=$2 AND creator_id=$3 RETURNING task_id',[id,reservation,user.id]);if(!saved.rowCount)throw Error('Reserved generation task missing');const used=trial==='artist'?await require('./lib/artist-test-access').attach(db,user.id,reservation,id):trial?await db.query('UPDATE review_trial_usage SET generation_reference=$1 WHERE generation_reference=$2 AND artist_id=$3 RETURNING artist_id AS id',[id,reservation,user.id]):await db.query('UPDATE artist_studio_usage SET generation_reference=$1 WHERE generation_reference=$2 AND artist_id=$3 RETURNING id',[id,reservation,user.id]);if(!used.rowCount)throw Error('Reserved generation usage missing');await db.query('UPDATE studio_request_keys SET task_reference=$3 WHERE artist_id=$1 AND request_key=$2',[user.id,requestKey,id]);await db.query('COMMIT');reservation=null}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}finally{db.release()}}catch(e){console.error('[sonic/create] task persistence failed',e.message,'reservation='+reservation,'providerTask='+id);return send(res,503,{reference:reservation,status:'verification_required',error:'Song request was accepted by the music provider, but LAE-MUSIC could not save its task reference. Contact support before retrying to avoid spending credits twice.'}),true}
  return send(res,200,{task_id:id,status:'pending'}),true;
 }
 if(p==='/api/music/sonic/premium-wav'&&req.method==='POST'){
  if(process.env.LAE_REVIEW_TEST_OPEN==='1'&&require('./lib/review-testing').enabled(process.env))return send(res,503,{error:'WAV conversion is outside the free audio-generation test. Preview your generated songs in the studio.'}),true;
  let b;try{b=await body(req)}catch(e){return send(res,e.status||400,{error:e.message}),true}if(!b||typeof b!=='object'||Array.isArray(b))return send(res,400,{error:'Invalid WAV request'}),true;
  const taskId=String(b.task_id||''),clipId=String(b.clip_id||'');
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(taskId)||!/^[a-zA-Z0-9_-]{8,128}$/.test(clipId))return send(res,400,{error:'Invalid song reference'}),true;
  const owned=await pool.query("SELECT task_id FROM sonic_test_tasks WHERE task_id=$1 AND creator_id=$2 AND status='succeeded'",[taskId,user.id]);
  if(!owned.rowCount)return send(res,403,{error:'Only your completed songs can be downloaded'}),true;
  const original=await remote('/task/'+encodeURIComponent(taskId),'GET');
  const tracks=songs(original.data||original.results||original);
  if(!tracks.some(t=>t.clip_id===clipId))return send(res,403,{error:'This clip does not belong to your generation'}),true;
  const result=await remote('/download','POST',{clip_id:clipId,formats:['wav']});
  const wav=result.data?.files?.find(f=>f.format==='wav')?.file_url;
  if(wav&&/^https:\/\//.test(wav))return send(res,200,{status:'ready',url:wav}),true;
  if(result.type==='not_ready'||result.status==='processing'||result.code===202||result.message?.toLowerCase().includes('prepar'))return send(res,202,{status:'processing',message:'WAV is being prepared. Check again shortly.'}),true;
  return send(res,502,{error:'Provider did not return a WAV file yet'}),true;
 }
 if(p==='/api/music/sonic/status'&&req.method==='GET'){
  let id=new URL(req.url,'http://localhost').searchParams.get('id')||'';
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(id))return send(res,400,{error:'Invalid task ID'}),true;
  let submitting=false;
  if(id.startsWith('sonic-')){const mapping=await pool.query('SELECT task_reference,result,created_at FROM studio_request_keys WHERE artist_id=$1 AND reservation_reference=$2',[user.id,id]);if(mapping.rowCount){const known=mapping.rows[0];if(known.result?.status==='failed')return send(res,200,{task_id:id,status:'failed',songs:[],error:known.result.error}),true;id=known.task_reference;submitting=Date.now()-new Date(known.created_at).getTime()<60000;}}
  const owned=await pool.query('SELECT task_id,status,usable_output_seen,EXISTS(SELECT 1 FROM artist_test_generations a WHERE a.artist_id=$2 AND a.task_reference=$1) AS complimentary FROM sonic_test_tasks WHERE task_id=$1 AND creator_id=$2',[id,user.id]);
  if(!owned.rowCount)return send(res,404,{error:'Song request not found for this account'}),true;
  if(owned.rows[0].status==='failed')return send(res,200,{task_id:id,status:'failed',songs:[],error:'Generation failed; the included generation has been released.'}),true;
  if(id.startsWith('sonic-')&&submitting)return send(res,202,{task_id:id,status:'pending',songs:[],message:'The provider submission is still being confirmed. Keep this request open; do not submit another generation.'}),true;
  if(id.startsWith('sonic-'))return send(res,202,{task_id:id,status:'verification_required',songs:[],error:'Music provider response is unresolved. Contact support with this reference; do not submit another generation until it is reconciled.'}),true;
  const result=await remote('/task/'+encodeURIComponent(id),'GET');
  const state=String(result.status||result.state||result.data?.status||result.data?.state|| (result.code===102?'running':'pending')).toLowerCase();
  const actualState=String(result.status||result.state||result.data?.status||result.data?.state||'').toLowerCase();
  const available=songs(result.data||result.results||result);
  const found=available.filter(s=>s.state?['succeeded','completed','success'].includes(s.state):!['pending','running','processing','in_progress','streaming'].includes(actualState)&&!s.audio_url.includes('audiopipe.suno.ai'));
  const usable=available.length>0;
  const awaiting=available.some(s=>['pending','running','processing','in_progress','streaming'].includes(s.state));
  const status=owned.rows[0].status==='succeeded'?'succeeded':['failed','error','cancelled','canceled'].includes(state)?found.length||owned.rows[0].usable_output_seen?'verification_required':'failed':found.length&&!awaiting?'succeeded':state==='succeeded'?'running':['running','processing','in_progress'].includes(state)?'running':'pending';
  const db=await pool.connect();let finalStatus=status;try{await db.query('BEGIN');const updated=await db.query("UPDATE sonic_test_tasks SET usable_output_seen=usable_output_seen OR $4,status=CASE WHEN status='failed' AND $4 THEN 'verification_required' WHEN status IN ('succeeded','failed') THEN status WHEN $1='failed' AND (usable_output_seen OR $4) THEN 'verification_required' ELSE $1 END WHERE task_id=$2 AND creator_id=$3 RETURNING status,usable_output_seen",[status,id,user.id,usable]);if(!updated.rowCount)throw Error('Generation task disappeared during status update');finalStatus=updated.rows[0].status;if(['failed','verification_required'].includes(finalStatus))await db.query('INSERT INTO studio_failure_decisions(task_reference,artist_id,decision,provider_state,response_hash,had_usable_output) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[id,user.id,finalStatus==='failed'?'credit_restored':'held_for_review',state.slice(0,64),require('node:crypto').createHash('sha256').update(JSON.stringify(result)).digest('hex'),updated.rows[0].usable_output_seen===true]);if(finalStatus==='failed')await db.query('DELETE FROM artist_studio_usage WHERE artist_id=$1 AND generation_reference=$2',[user.id,id]);if(owned.rows[0].complimentary&&['failed','succeeded'].includes(finalStatus))await require('./lib/artist-test-access').settle(db,user.id,id,finalStatus==='failed'?'restored':'completed');if(finalStatus==='failed'&&process.env.LAE_REVIEW_TEST_ACCESS==='1'&&require('./lib/review-testing').enabled(process.env))await db.query('DELETE FROM review_trial_usage WHERE artist_id=$1 AND generation_reference=$2',[user.id,id]);await db.query('COMMIT')}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}finally{db.release()}
  return send(res,200,{task_id:id,status:finalStatus==='succeeded'&&(awaiting||available.length&&!found.length)?'running':finalStatus,songs:finalStatus==='failed'||awaiting?[]:found,error:finalStatus==='failed'?String(result.message||result.error||'Generation failed'):finalStatus==='verification_required'?'The provider reports conflicting failure and audio results. Your credit remains reserved for review; do not submit another generation.':undefined}),true;
 }
 return send(res,404,{error:'Unknown music endpoint'}),true;
};

// Read-only completed-output adapter shared by the durable release importer.
module.exports.releaseProvider={
 configured:()=>!!process.env.MUSICAPI_API_KEY,
 async clips(taskId){
  if(!process.env.MUSICAPI_API_KEY)throw Object.assign(Error('Completed songs are temporarily unavailable.'),{status:503});
  let result;try{result=await remote('/task/'+encodeURIComponent(taskId),'GET');}catch{throw Object.assign(Error('Completed songs could not be retrieved. Please try again later.'),{status:502});}
  const state=String(result.status||result.data?.status||'').toLowerCase();
  if(['failed','error','cancelled','canceled'].includes(state))throw Object.assign(Error('The provider no longer reports this generation as completed.'),{status:409});
  const output=songs(result.data||result.results||result).filter(s=>s.state?['succeeded','completed','success'].includes(s.state):!['pending','running','processing','streaming'].includes(state)&&!s.audio_url.includes('audiopipe.suno.ai'));
  if(!output.length)throw Object.assign(Error('Wait until the provider finishes your song before saving.'),{status:409});return output;
 }
};
