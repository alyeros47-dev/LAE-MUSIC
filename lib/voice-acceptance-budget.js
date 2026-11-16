'use strict';
const CLAIM='lae-pr53-jane-esther-voice25-20261116';
const SOURCE='9b6acc15aa861e0d0cc0266ec1bb17ecfc4b239b65608ae1503fb609ae2f3268';
function identity(env=process.env,now=Date.now()){
 if(env.GITHUB_REPOSITORY!=='alyeros47-dev/LAE-MUSIC'||env.GITHUB_REF!=='refs/heads/codex/voice-profile-launch-repair'||env.GITHUB_RUN_ATTEMPT!=='1'||env.LAE_VOICE_ACCEPTANCE!=='25'||!/^\d{6,20}$/.test(env.GITHUB_RUN_ID||'')||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')||now>Date.parse('2026-11-17T00:00:00Z'))throw Error('Voice acceptance identity or dated 25-credit authorization refused.');
 return {claim:CLAIM,run:env.GITHUB_RUN_ID,candidate:env.GITHUB_SHA,account_id:'3',source_sha256:SOURCE,max_provider_credits:25,max_voice_requests:1,max_music_requests:1};
}
async function claimCheck(env,fetcher=fetch,existing=false,now=Date.now()){
 const manifest=identity(env,now),r=await fetcher('https://api.github.com/repos/alyeros47-dev/LAE-MUSIC/actions/artifacts?name='+CLAIM+'&per_page=100',{method:'GET',headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Durable voice budget claim could not be checked.');const list=(await r.json()).artifacts;
 if(!Array.isArray(list))throw Error('Invalid durable claim inventory.');
 const claims=list.filter(x=>x.name===CLAIM);
 if(existing?claims.length!==1||String(claims[0].workflow_run?.id)!==manifest.run||claims[0].expired:claims.length!==0)throw Error('Voice test already claimed or claim does not belong to this run. Reconcile existing tasks; do not repeat paid requests.');
 return manifest;
}
function guard(fetcher,{record=()=>{},sourceHash=SOURCE,storageHost,account='3'}={}){
 let voices=0,music=0,puts=0,persona=null;const uploads=new Set(),reads=new Set();
 return {
  allowUpload(url){const u=new URL(url);if(u.hostname!==storageHost||!new RegExp('/voice-profiles/'+account+'/[a-f0-9-]{36}\\.wav$').test(u.pathname))throw Error('Unexpected voice storage target.');uploads.add(u.href);},
  allowRead(url){const u=new URL(url);if(u.hostname!==storageHost||!u.pathname.endsWith('.wav'))throw Error('Unexpected voice training source.');reads.add(u.href);},
  allowPersona(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{3,200}$/.test(value))throw Error('Invalid owned test persona.');persona=value;},
  counts(){return {voice_requests:voices,music_requests:music,storage_puts:puts,reserved_provider_credits:voices*5+music*20};},
  async fetch(url,options={}){
   const u=new URL(url),method=(options.method||'GET').toUpperCase();if(u.hostname==='api.openai.com')throw Error('Lyrics-provider calls are outside this test.');
   if(!['GET','HEAD'].includes(method)){
    if(method==='PUT'&&uploads.has(u.href)&&puts===0&&Buffer.isBuffer(options.body)&&require('node:crypto').createHash('sha256').update(options.body).digest('hex')===sourceHash){puts++;record({kind:'storage_put',attempt:puts});}
    else if(method==='POST'&&u.href==='https://api.musicapi.ai/api/v1/sonic/create-voice'){
     const b=JSON.parse(options.body);if(voices!==0||music!==0||Object.keys(b).length!==1||!reads.has(b.audio_url))throw Error('Voice request exceeds the one-owned-sample authorization.');voices++;record({kind:'voice_submission_may_be_accepted',reserved_provider_credits:5});
    }else if(method==='POST'&&u.href==='https://api.musicapi.ai/api/v1/sonic/create'){
     const b=JSON.parse(options.body);if(voices!==1||music!==0||!persona||b.persona_id!==persona||b.task_type!=='persona_music'||b.mv!=='sonic-v6'||b.custom_mode!==true||b.max_mode===true)throw Error('Music request exceeds the one-personal-voice generation authorization.');music++;record({kind:'music_submission_may_be_accepted',reserved_provider_credits:25});
    }else throw Error('External write outside the approved voice test.');
   }
   return fetcher(url,options);
  },
 };
}
function seal(value,secret){const crypto=require('node:crypto');if(!secret)throw Error('Voice journal encryption key unavailable.');const key=crypto.createHash('sha256').update(secret+'\0'+CLAIM).digest(),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return {encrypted:true,algorithm:'AES-256-GCM',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};}
function open(value,secret){const crypto=require('node:crypto'),key=crypto.createHash('sha256').update(secret+'\0'+CLAIM).digest(),decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));decipher.setAuthTag(Buffer.from(value.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext,'base64')),decipher.final()]).toString('utf8'));}
module.exports={CLAIM,SOURCE,identity,claimCheck,guard,seal,open};
