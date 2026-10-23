'use strict';
const crypto=require('node:crypto');
const send=(r,n,o)=>{r.writeHead(n,{'Content-Type':'application/json','Cache-Control':'no-store'});r.end(JSON.stringify(o))};
async function input(req){let s='';for await(const c of req){s+=c;if(s.length>6000)throw Error('Request too large')}return JSON.parse(s)}
let ready;
module.exports=async function voice(req,res,p,ctx){
 if(!p.startsWith('/api/voice/'))return false;
 const {pool,me,validOrigin,storage,presign,headObject}=ctx;
 try{
 const user=await me(req);if(!user)return send(res,401,{error:'Sign in as an artist first'}),true;
 if(req.method==='POST'&&!validOrigin(req))return send(res,403,{error:'Invalid origin'}),true;
 if(!ready)ready=pool.query("CREATE TABLE IF NOT EXISTS artist_voice_profiles(creator_id BIGINT PRIMARY KEY REFERENCES creators(id) ON DELETE CASCADE,object_key TEXT NOT NULL,task_id TEXT,persona_id TEXT,status TEXT NOT NULL DEFAULT 'uploading',updated_at TIMESTAMPTZ DEFAULT NOW())").catch(e=>{ready=null;throw e});
 await ready;
 const get=async()=> (await pool.query('SELECT object_key,task_id,persona_id,status FROM artist_voice_profiles WHERE creator_id=$1',[user.id])).rows[0];
 if(p==='/api/voice/profile'&&req.method==='GET'){const x=await get();return send(res,200,{status:x?.status||'none',hasVoice:!!x?.persona_id}),true}
 if(p==='/api/voice/upload'&&req.method==='POST'){
 const b=await input(req),ext=b.type==='audio/mpeg'?'mp3':b.type==='audio/wav'?'wav':null;
 if(!b.consent||!ext||!Number.isInteger(b.bytes)||b.bytes<10000||b.bytes>12000000)return send(res,400,{error:'Confirm consent and select MP3/WAV under 12 MB'}),true;
 const store=storage();if(!store)return send(res,503,{error:'Audio storage unavailable'}),true;
 const key='voice-profiles/'+user.id+'/'+crypto.randomUUID()+'.'+ext;
 await pool.query("INSERT INTO artist_voice_profiles(creator_id,object_key,task_id,persona_id,status) VALUES($1,$2,NULL,NULL,'uploading') ON CONFLICT(creator_id) DO UPDATE SET object_key=$2,task_id=NULL,persona_id=NULL,status='uploading',updated_at=NOW()",[user.id,key]);
 return send(res,200,{url:presign(store,key,'put',900)}),true;
 }
 if(p==='/api/voice/train'&&req.method==='POST'){
 const x=await get();if(!x||x.status!=='uploading')return send(res,409,{error:'Upload a voice sample first'}),true;
 const store=storage();await headObject(store,x.object_key);
 if(!process.env.MUSICAPI_API_KEY)return send(res,503,{error:'MusicAPI key missing'}),true;
 const audio_url=presign(store,x.object_key,'get',86400);
 const response=await fetch('https://api.musicapi.ai/api/v1/sonic/create-voice',{method:'POST',headers:{Authorization:'Bearer '+process.env.MUSICAPI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({audio_url}),signal:AbortSignal.timeout(45000)});
 const j=await response.json();if(!response.ok||!j.task_id)return send(res,502,{error:j.error||j.message||'Voice training could not start'}),true;
 await pool.query("UPDATE artist_voice_profiles SET task_id=$1,status='training',updated_at=NOW() WHERE creator_id=$2",[j.task_id,user.id]);
 return send(res,200,{status:'training'}),true;
 }
 if(p==='/api/voice/status'&&req.method==='GET'){
 const x=await get();if(!x)return send(res,404,{error:'No voice sample found'}),true;
 if(x.status==='training'&&x.task_id){
 const response=await fetch('https://api.musicapi.ai/api/v1/sonic/task/'+encodeURIComponent(x.task_id),{headers:{Authorization:'Bearer '+process.env.MUSICAPI_API_KEY},signal:AbortSignal.timeout(30000)});
 const j=await response.json();const id=j.data?.persona_id||j.persona_id;
 if(id){await pool.query("UPDATE artist_voice_profiles SET persona_id=$1,status='ready' WHERE creator_id=$2",[id,user.id]);x.status='ready'}
 else if(j.type==='failed'||j.status==='failed'){await pool.query("UPDATE artist_voice_profiles SET status='failed' WHERE creator_id=$1",[user.id]);x.status='failed'}
 }
 return send(res,200,{status:x.status}),true;
 }
 return send(res,404,{error:'Voice route unavailable'}),true;
 }catch(e){console.error('Voice profile error:',e.message);return send(res,502,{error:e.message}),true}
};
