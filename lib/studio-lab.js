'use strict';
const prompts=require('./studio-lab-prompts');
const {createResearch}=require('./studio-lab-research');
const {createHmac}=require('node:crypto');
const rates={input:2/1e6,cached:.1/1e6,output:10/1e6};
function cost(usage){const i=usage?.input_tokens,o=usage?.output_tokens,c=usage?.input_tokens_details?.cached_tokens||0;if(![i,o,c].every(x=>Number.isSafeInteger(x)&&x>=0)||c>i)throw prompts.fail('Provider usage was incomplete; the reserved budget remains held.',502);return (i-c)*rates.input+c*rates.cached+o*rates.output;}
function ceiling(spec){return (Buffer.byteLength(spec.instructions)+Buffer.byteLength(spec.input)+4096)*rates.input+spec.max_output_tokens*rates.output;}
function createLab({store,key,privacyKey,fetchImpl=fetch,research=createResearch({fetchImpl}),now=Date.now}={}){
 let modelVerifiedAt=0;
 async function verifyModel(){if(now()-modelVerifiedAt<900000)return true;if(!key)throw prompts.fail('The exact lyrics model is not connected.',503);const r=await fetchImpl('https://api.openai.com/v1/models/'+prompts.MODEL,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok||(await r.json()).id!==prompts.MODEL)throw prompts.fail('The configured model gpt-6.1-sol is unavailable. No fallback model was selected.',503);modelVerifiedAt=now();return true;}
 async function generate(run,phase,spec,usage){
  await verifyModel();const hold=await store.reserve(run,phase,ceiling(spec));
  let data;try{const r=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',signal:AbortSignal.timeout(90000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':hold.key},body:JSON.stringify({model:prompts.MODEL,service_tier:'default',store:false,instructions:spec.instructions,input:spec.input,max_output_tokens:spec.max_output_tokens,text:{format:{type:'json_object'}}})});if(!r.ok)throw prompts.fail('OpenAI returned HTTP '+r.status+'. This request was not retried; its reservation is held until costs are checked.',502);data=await r.json();const estimated=cost(data.usage);if(data.model!==prompts.MODEL||data.service_tier!=='default'||estimated>ceiling(spec))throw prompts.fail('The model, service tier or metered cost differed from the approved configuration. Reservation held.',502);await store.record(hold.id,data,estimated);usage.push({phase,model:data.model,service_tier:data.service_tier,request_id:data.id,tokens:data.usage,estimated_usd:estimated});}
  catch(e){await store.uncertain(hold.id);throw e.status?e:prompts.fail('The text provider could not complete the request. No automatic retry was made; the spending reservation remains held.',502);}
  if(data.status!=='completed')throw prompts.fail('The provider did not finish the text response. Usage was recorded; no automatic paid retry was made.',502);
  const content=(data.output||[]).flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');try{return JSON.parse(content);}catch{throw prompts.fail('The provider returned invalid JSON. Usage was recorded; no automatic paid retry was made.',502);}
 }
 async function run(input,runId){
  const usage=[],understanding=prompts.validateInterpretation(await generate(runId,'interpret',prompts.interpretation(input),usage));
  if(understanding.status!=='ready')return {status:understanding.status,question:understanding.question,understanding,usage,research:[]};
  const evidence=[];for(let i=0;i<understanding.artists.length;i++)evidence.push(await research.artist(understanding.artists[i],i));
  await store.research(runId,evidence.flatMap(r=>r.requests));
  const incomplete=evidence.find(r=>r.status!=='retrieved');
  if(incomplete)return {status:'clarify',question:`Which artist do you mean by “${incomplete.as_written}”? Please give their full name and one song title; the connected research could not establish the reference.`,understanding,research:evidence,usage};
  const output=prompts.validateOutput(await generate(runId,'compose',prompts.composition(input,understanding,evidence),usage),understanding,evidence);
  if(output.status!=='ready')return {...output,understanding,research:evidence,usage};
  const hashes=prompts.fingerprints(output.lyrics,privacyKey,understanding.protected_phrases);
  const fresh=await store.checkFresh(hashes);
  return {...output,understanding,research:evidence,usage,variation_id:input.variation,originality:{status:fresh?'no_excessive_overlap_detected':'review_required',note:fresh?'Checked recent internal-test narrative fingerprints only; uniqueness is not guaranteed.':'Substantial narrative overlap with a recent internal generation. Review before audio; no automatic paid regeneration was made.'},audio_ready:fresh};
 }
 const hash=value=>createHmac('sha256',privacyKey).update(value).digest('hex');
 return {run,verifyModel,hash};
}
module.exports={createLab,cost,ceiling};
