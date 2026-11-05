'use strict';
// Interpret only documented task fields. Do not expose raw provider messages,
// private sample URLs or credentials in the artist interface.
const VERIFICATION_MESSAGE='Your recording is saved, but the voice provider requires a separate spoken verification phrase. This studio cannot complete that provider verification yet. Please keep your sample and contact LAE-MUSIC support; recording or submitting it again will not resolve this requirement.';
function result(body){
 const data=body?.data&&!Array.isArray(body.data)&&typeof body.data==='object'?body.data:{};
 const markers=[body?.type,body?.status,body?.state,data.type,data.status,data.state].filter(x=>typeof x==='string').map(x=>x.toLowerCase());
 const reasons=[body?.reason_code,data.reason_code,body?.error,data.error,data.message,body?.message].filter(x=>typeof x==='string');
 const verification=reasons.some(x=>/didnt_say_verification_phrase/i.test(x));
 const failed=verification||markers.some(x=>['failed','error','api_error','validation_error','rejected'].includes(x));
 if(failed){
  const failure=verification?{code:'voice_verification_required',message:VERIFICATION_MESSAGE,retry_allowed:false,provider_reason:'didnt_say_verification_phrase'}:{code:'voice_training_failed',message:'The voice provider could not create a profile from this sample. Your recording is saved. Check that it contains clear solo singing before choosing whether to submit another sample.',retry_allowed:body?.retriable!==false&&data.retriable!==false};
  if(!verification&&failure.retry_allowed===false)failure.message='The voice provider rejected this training request and does not allow a retry. Your recording is saved. Please contact LAE-MUSIC support before submitting another sample.';
  const refund=data.refund_processed??body?.refund_processed;if(typeof refund==='boolean')failure.provider_refund_processed=refund;
  return {state:'failed',failure};
 }
 const persona=data.persona_id||body?.persona_id;
 if(typeof persona==='string'&&/^[a-zA-Z0-9_-]{3,200}$/.test(persona))return {state:'ready',persona_id:persona};
 return {state:'training'};
}
async function failureFor(db,artistId,profile,{fetchImpl=fetch,apiKey=process.env.MUSICAPI_API_KEY}={}){
 if(profile?.status!=='failed'||!profile.task_id)return null;
 const args=[String(artistId),profile.task_id];
 const old=(await db.query("SELECT details FROM platform_audit WHERE actor_type='artist' AND actor_id=$1 AND action='voice.training.failure' AND resource=$2 ORDER BY created_at DESC LIMIT 1",args)).rows[0]?.details;
 if(old?.code&&typeof old.message==='string')return old;
 if(!apiKey||profile.task_id.startsWith('voice-')||!/^[a-zA-Z0-9_-]{8,128}$/.test(profile.task_id))return null;
 // Recheck the existing task only. This never calls create-voice or retries it.
 const response=await fetchImpl('https://api.musicapi.ai/api/v1/sonic/task/'+encodeURIComponent(profile.task_id),{method:'GET',headers:{Authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Object.assign(Error('The existing voice failure could not be checked. Your saved recording has been preserved. Please check the profile again before submitting another sample.'),{status:503});
 const task=result(await response.json());
 if(task.state!=='failed')throw Object.assign(Error('The provider result needs another status check. Your existing voice recording has been preserved; do not submit it again yet.'),{status:409});
 await recordFailure(db,artistId,profile.task_id,task.failure);
 return task.failure;
}
async function recordFailure(db,artistId,taskId,failure){
 await db.query("INSERT INTO platform_audit(actor_type,actor_id,action,resource,details) SELECT 'artist',$1,'voice.training.failure',$2,$3::jsonb WHERE NOT EXISTS(SELECT 1 FROM platform_audit WHERE actor_type='artist' AND actor_id=$1 AND action='voice.training.failure' AND resource=$2)",[String(artistId),taskId,JSON.stringify(failure)]);
}
module.exports={result,failureFor,recordFailure,VERIFICATION_MESSAGE};
