'use strict';
const API='https://api.musicapi.ai/api/v1/sonic';
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000){const e=new Error('Request too large');e.status=413;throw e}}try{return JSON.parse(raw)}catch{const e=new Error('Invalid JSON request');e.status=400;throw e}}
function songs(data){const items=Array.isArray(data)?data:Array.isArray(data?.data)?data.data:Array.isArray(data?.songs)?data.songs:[];return items.map(s=>({clip_id:String(s.clip_id||s.music_id||s.id||''),title:String(s.title||'Generated song'),audio_url:s.audio_url||s.audioUrl||s.audio||'',image_url:s.image_url||s.imageUrl||s.image||''})).filter(s=>/^https:\/\//.test(s.audio_url))}
async function remote(path,method,payload){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);try{const r=await fetch(API+path,{method,headers:{Authorization:'Bearer '+process.env.MUSICAPI_API_KEY,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined,signal:controller.signal});const j=await r.json().catch(()=>({}));if(!r.ok||j.code&&j.code!==200&&r.status!==202){const e=new Error(String(j.message||j.error||j.type||'Music provider request failed'));e.status=r.status;throw e}return j}finally{clearTimeout(timeout)}}
module.exports=async function handleMusicAPI(req,res,p,{me,pool,validOrigin}){
 if(!p.startsWith('/api/music/sonic/'))return false;
 if(!['GET','POST'].includes(req.method))return send(res,405,{error:'Method not allowed'}),true;
 if(req.method==='POST'&&!validOrigin(req))return send(res,403,{error:'Invalid origin'}),true;
 const user=await me(req);
 if(!user)return send(res,401,{error:'Sign in to your LAE-MUSIC artist account first.'}),true;
 if(!pool)return send(res,503,{error:'Music studio database unavailable'}),true;
 if(!process.env.MUSICAPI_API_KEY)return send(res,503,{error:'MusicAPI key is not configured on Render'}),true;


 if(p==='/api/music/sonic/create'&&req.method==='POST'){
  let b;try{b=await body(req)}catch(e){return send(res,e.status||400,{error:e.message}),true}if(!b||typeof b!=='object'||Array.isArray(b))return send(res,400,{error:'Invalid song request'}),true;
  const title=String(b.title||'').trim(),lyrics=String(b.lyrics||'').trim(),style=String(b.style||'').trim();
  if(title.length<2||title.length>120||lyrics.length<20||lyrics.length>6000||style.length<3||style.length>2000)return send(res,400,{error:'Enter a title, lyrics and music style within the permitted lengths.'}),true;
  // A saved voice is optional. Only look up a persona when the member explicitly opts in.
    const recent=await pool.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE ((task_id LIKE 'sonic-%' AND status='pending') OR (status IN ('pending','running') AND created_at>NOW()-INTERVAL '15 minutes')))::int AS active FROM sonic_test_tasks WHERE creator_id=$1 AND (created_at>NOW()-INTERVAL '24 hours' OR (task_id LIKE 'sonic-%' AND status='pending'))",[user.id]);
  if(recent.rows[0].active>0)return send(res,429,{error:'Your previous song is still processing. Please wait before starting another.'}),true;
  if(recent.rows[0].total>=5)return send(res,429,{error:'Safety limit: 5 generation requests per account per 24 hours.'}),true;
  let voiceId=null;
  if(b.useVoice===true){const v=await pool.query("SELECT persona_id FROM artist_voice_profiles WHERE creator_id=$1 AND status='ready'",[user.id]);voiceId=v.rows[0]?.persona_id;if(!voiceId)return send(res,409,{error:'Train your voice profile before selecting Use My Voice'}),true}
  // Reserve one included generation atomically before calling the paid music provider.
  const client=await pool.connect();let reservation=null;
  try{
   await client.query('BEGIN');
   const locked=await client.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[user.id]);
   if(!locked.rowCount){await client.query('ROLLBACK');return send(res,404,{error:'Artist account not found'}),true}
   const active=await client.query("SELECT COUNT(*)::int AS n FROM sonic_test_tasks WHERE creator_id=$1 AND ((task_id LIKE 'sonic-%' AND status='pending') OR (status IN ('pending','running') AND created_at>NOW()-INTERVAL '15 minutes'))",[user.id]);
   if(active.rows[0].n>0){await client.query('ROLLBACK');return send(res,429,{error:'Your previous song is still processing. Please wait before starting another.'}),true}
   const daily=await client.query("SELECT COUNT(*)::int AS n FROM sonic_test_tasks WHERE creator_id=$1 AND created_at>NOW()-INTERVAL '24 hours'",[user.id]);
   if(daily.rows[0].n>=5){await client.query('ROLLBACK');return send(res,429,{error:'Safety limit: 5 generation requests per account per 24 hours.'}),true}
   const sub=await client.query("SELECT id,plan FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' AND starts_at<=NOW() AND expires_at>NOW() ORDER BY expires_at DESC LIMIT 1 FOR UPDATE",[user.id]);
   if(!sub.rowCount){await client.query('ROLLBACK');return send(res,402,{error:'An active paid artist package is required to generate music.'}),true}
   const limits={starter:2,growth:3,professional:6};
   const limit=limits[sub.rows[0].plan]||0;
   const usage=await client.query("SELECT COUNT(*)::int AS used FROM artist_studio_usage WHERE subscription_id=$1",[sub.rows[0].id]);
   if(usage.rows[0].used>=limit){await client.query('ROLLBACK');return send(res,402,{error:'Your included studio generations are exhausted. Additional generations require a verified purchase.'}),true}
   const ref='sonic-'+require('node:crypto').randomBytes(16).toString('hex');
   await client.query("INSERT INTO artist_studio_usage(subscription_id,artist_id,generation_reference) VALUES($1,$2,$3)",[sub.rows[0].id,user.id,ref]);
   await client.query("INSERT INTO sonic_test_tasks(task_id,creator_id,status) VALUES($1,$2,'pending')",[ref,user.id]);
   await client.query('COMMIT');reservation=ref;
  }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
  const release=async()=>{if(!reservation)return;const db=await pool.connect();try{await db.query('BEGIN');await db.query('DELETE FROM sonic_test_tasks WHERE task_id=$1 AND creator_id=$2',[reservation,user.id]);await db.query('DELETE FROM artist_studio_usage WHERE generation_reference=$1 AND artist_id=$2',[reservation,user.id]);await db.query('COMMIT');reservation=null}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error('[sonic] failed to release generation reservation',e.message)}finally{db.release()}};
  let result;
  try { result=await remote('/create','POST',{task_type:voiceId?'persona_music':'create_music',...(voiceId?{persona_id:voiceId,audio_weight:0.8,variety:'off'}:{}),custom_mode:true,mv:'sonic-v6',title:title.slice(0,80),prompt:lyrics.slice(0,4900),tags:style.slice(0,900),make_instrumental:false}); }
  catch(e){const uncertain=!Number(e.status);if(!uncertain)await release();console.error('[sonic/create] provider failure',e.status||'',e.message,'uncertain_acceptance='+uncertain,'reservation='+String(reservation||''));if(uncertain)return send(res,503,{error:'Music provider connection was interrupted or timed out. Your request may have been accepted. Do not retry immediately; contact support to reconcile the reserved generation.',reference:reservation,status:'verification_required'}),true;const code=Number(e.status)||0;const message=code===401||code===403?'Music provider rejected the API key or account permissions. Check MUSICAPI_API_KEY and provider access.':code===402||code===429?'Music provider credits or rate limit may be exhausted. Check your MusicAPI.ai balance and limits.':code===400||code===422?'Music provider rejected the song request or model settings. Check Render logs for the provider message.':e.name==='AbortError'?'Music provider timed out. Please retry shortly.':'Music provider request failed: '+String(e.message||'Unknown error').slice(0,180);return send(res,502,{error:message}),true}
  const id=String(result.task_id||result.data?.task_id||'');
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(id)){console.error('[sonic/create] unrecognized provider task reference',String(id).slice(0,150),'reservation='+reservation);return send(res,503,{error:'The music provider responded without a usable task reference. The generation is reserved for reconciliation; contact support before retrying.',reference:reservation,status:'verification_required'}),true}
  try{const db=await pool.connect();try{await db.query('BEGIN');const saved=await db.query('UPDATE sonic_test_tasks SET task_id=$1 WHERE task_id=$2 AND creator_id=$3 RETURNING task_id',[id,reservation,user.id]);if(!saved.rowCount)throw Error('Reserved generation task missing');const used=await db.query('UPDATE artist_studio_usage SET generation_reference=$1 WHERE generation_reference=$2 AND artist_id=$3 RETURNING id',[id,reservation,user.id]);if(!used.rowCount)throw Error('Reserved generation usage missing');await db.query('COMMIT');reservation=null}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}finally{db.release()}}catch(e){console.error('[sonic/create] task persistence failed',e.message);return send(res,503,{error:'Song request was accepted by the music provider, but LAE-MUSIC could not save its task reference. Contact support before retrying to avoid spending credits twice.'}),true}
  return send(res,200,{task_id:id,status:'pending'}),true;
 }
 if(p==='/api/music/sonic/premium-wav'&&req.method==='POST'){
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
  const id=new URL(req.url,'http://localhost').searchParams.get('id')||'';
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(id))return send(res,400,{error:'Invalid task ID'}),true;
  const owned=await pool.query('SELECT task_id,status FROM sonic_test_tasks WHERE task_id=$1 AND creator_id=$2',[id,user.id]);
  if(!owned.rowCount)return send(res,404,{error:'Song request not found for this account'}),true;
  if(owned.rows[0].status==='failed')return send(res,200,{task_id:id,status:'failed',songs:[],error:'Generation failed; the included generation has been released.'}),true;
  if(id.startsWith('sonic-'))return send(res,202,{task_id:id,status:'verification_required',songs:[],error:'Music provider response is unresolved. Contact support with this reference; do not submit another generation until it is reconciled.'}),true;
  const result=await remote('/task/'+encodeURIComponent(id),'GET');
  const state=String(result.status||result.state||result.data?.status||result.data?.state|| (result.code===102?'running':'pending')).toLowerCase();
  const found=songs(result.data||result.results||result);
  const status=owned.rows[0].status==='succeeded'?'succeeded':['failed','error','cancelled','canceled'].includes(state)?'failed':found.length?'succeeded':state==='succeeded'?'running':['running','processing','in_progress'].includes(state)?'running':'pending';
  const db=await pool.connect();let finalStatus=status;try{await db.query('BEGIN');const updated=await db.query("UPDATE sonic_test_tasks SET status=CASE WHEN status IN ('succeeded','failed') THEN status ELSE $1 END WHERE task_id=$2 AND creator_id=$3 RETURNING status",[status,id,user.id]);if(!updated.rowCount)throw Error('Generation task disappeared during status update');finalStatus=updated.rows[0].status;if(finalStatus==='failed')await db.query('DELETE FROM artist_studio_usage WHERE artist_id=$1 AND generation_reference=$2',[user.id,id]);await db.query('COMMIT')}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}finally{db.release()}
  return send(res,200,{task_id:id,status:finalStatus,songs:finalStatus==='failed'?[]:found,error:finalStatus==='failed'?String(result.message||result.error||'Generation failed'):undefined}),true;
 }
 return send(res,404,{error:'Unknown music endpoint'}),true;
};
