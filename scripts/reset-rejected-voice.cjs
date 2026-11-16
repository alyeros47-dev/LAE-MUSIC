'use strict';
// Explicit owner-requested cleanup only. No training, music generation, or audio reads.
const crypto=require('node:crypto');
const {serviceValid,inventory}=require('./audit-existing-service.cjs');
const {result}=require('../lib/voice-provider-result');
const SERVICE='srv-db84s7m89jmc73c7l9rg';
const digest=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
function signedURL(store,method,key='',extra={},now=new Date()){
 const encode=x=>encodeURIComponent(x).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
 const stamp=now.toISOString().replace(/[:-]|\.\d{3}/g,''),date=stamp.slice(0,8),scope=date+'/auto/s3/aws4_request',host=store.account+'.r2.cloudflarestorage.com';
 const uri='/'+[store.bucket,...(key?key.split('/'):[])].map(encode).join('/');
 const args={...extra,'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':store.key+'/'+scope,'X-Amz-Date':stamp,'X-Amz-Expires':'300','X-Amz-SignedHeaders':'host'};
 const query=Object.entries(args).map(([k,v])=>[encode(k),encode(String(v))]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0).map(x=>x.join('=')).join('&');
 const hmac=(key,text)=>crypto.createHmac('sha256',key).update(text).digest();
 const canonical=[method,uri,query,'host:'+host+'\n','host','UNSIGNED-PAYLOAD'].join('\n');
 const signing=hmac(hmac(hmac(hmac('AWS4'+store.secret,date),'auto'),'s3'),'aws4_request');
 const signature=hmac(signing,['AWS4-HMAC-SHA256',stamp,scope,digest(canonical)].join('\n')).toString('hex');
 return 'https://'+host+uri+'?'+query+'&X-Amz-Signature='+signature;
}
function sampleKeys(xml,artistId){
 if(/<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml))throw Error('Cleanup refused: sample list exceeds the safe limit.');
 const decode=x=>x.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
 const keys=[...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(x=>decode(x[1].match(/<Key>([^<]*)<\/Key>/)?.[1]||''));
 const pattern=new RegExp('^voice-profiles/'+artistId+'/[a-f0-9-]{36}\\.(mp3|wav)$');
 if(keys.length>50||keys.some(x=>!pattern.test(x)))throw Error('Cleanup refused: unexpected sample ownership or object name.');
 return [...new Set(keys)];
}
async function reset({key=process.env.RENDER_API_KEY,lookup,expectedTaskHash,onStage=()=>{},fetcher=fetch,dbFactory=o=>new(require('pg').Pool)(o)}={}){
 onStage('target_configuration');
 if(!key||!/^[a-f0-9]{64}$/.test(lookup||'')||!/^[a-f0-9]{64}$/.test(expectedTaskHash||''))throw Error('Cleanup target is not configured.');
 async function get(url,token){const r=await fetcher(url,{method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Object.assign(Error('Cleanup read access failed.'),{httpStatus:r.status});return r.json();}
 onStage('service_identity');
 const service=await get('https://api.render.com/v1/services/'+SERVICE,key);if(service.id!==SERVICE||!serviceValid(service))throw Error('Cleanup refused: wrong service.');
 onStage('server_configuration');
 const env=inventory(await get('https://api.render.com/v1/services/'+SERVICE+'/env-vars?limit=100'));
 const store={account:env.R2_ACCOUNT_ID,key:env.R2_ACCESS_KEY_ID,secret:env.R2_SECRET_ACCESS_KEY,bucket:env.R2_BUCKET};if(Object.values(store).some(x=>!x)||!env.MUSICAPI_API_KEY)throw Error('Cleanup storage/provider configuration unavailable.');
 const pool=dbFactory({...require('../lib/database').databaseOptions(env),max:1});let db;
 try{
  onStage('account_lookup');
  db=await pool.connect();await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  const matches=(await db.query("SELECT id FROM creators WHERE encode(sha256(convert_to(lower(regexp_replace(btrim(display_name),'\\s+',' ','g')),'UTF8')),'hex')=$1 LIMIT 2",[lookup])).rows;
  if(matches.length!==1)throw Error('Cleanup refused: account lookup missing or ambiguous.');const artistId=String(matches[0].id);if(!/^[1-9][0-9]*$/.test(artistId))throw Error('Invalid cleanup account.');
  await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[artistId]);
  const current=(await db.query('SELECT object_key,task_id,persona_id,status FROM artist_voice_profiles WHERE creator_id=$1 FOR UPDATE',[artistId])).rows[0];
  onStage('profile_guard');
  if(!current){await db.query('COMMIT');return {cleared:true,already_clear:true,removed_samples:0,profile_status:'none',provider_submissions:0};}
  if(current.status==='ready'||current.persona_id||!current.task_id||digest(current.task_id)!==expectedTaskHash)throw Error('Cleanup refused: profile changed or a working voice is present.');
  if(!/^[A-Za-z0-9_-]{8,128}$/.test(current.task_id)||current.task_id.startsWith('voice-'))throw Error('Cleanup refused: previous provider acceptance is unresolved.');
  onStage('existing_provider_task');
  const provider=await get('https://api.musicapi.ai/api/v1/sonic/task/'+encodeURIComponent(current.task_id),env.MUSICAPI_API_KEY);
  if(result(provider).state!=='failed')throw Error('Cleanup refused: provider task is active, ready, or unresolved.');
  async function list(){const r=await fetcher(signedURL(store,'GET','',{'list-type':'2','prefix':'voice-profiles/'+artistId+'/','max-keys':'51'}),{method:'GET',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Object.assign(Error('Private sample listing failed.'),{httpStatus:r.status});const xml=await r.text();if(xml.length>200000||!xml.includes('ListBucketResult'))throw Error('Invalid private sample list.');return sampleKeys(xml,artistId);}
  onStage('private_sample_list');
  const keys=await list();
  if(!new RegExp('^voice-profiles/'+artistId+'/[a-f0-9-]{36}\\.(mp3|wav)$').test(current.object_key))throw Error('Cleanup refused: saved sample ownership mismatch.');
  onStage('private_sample_removal');
  for(const objectKey of keys){const r=await fetcher(signedURL(store,'DELETE',objectKey),{method:'DELETE',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok&&r.status!==404)throw Error('A rejected sample could not be removed. Profile was not reset.');}
  onStage('private_sample_verification');
  if((await list()).length)throw Error('Cleanup incomplete: samples remain. Profile was not reset.');
  onStage('profile_removal');
  const removed=await db.query('DELETE FROM artist_voice_profiles WHERE creator_id=$1 AND object_key=$2 AND task_id=$3 RETURNING creator_id',[artistId,current.object_key,current.task_id]);
  if(removed.rowCount!==1)throw Error('Cleanup refused: profile changed during cleanup.');
  onStage('audit_record');
  await db.query("INSERT INTO platform_audit(actor_type,actor_id,action,resource,details) VALUES('admin','owner-request','voice.profile.reset',$1,$2::jsonb)",[artistId,JSON.stringify({reason:'Owner requested removal of rejected voice samples before a fresh recording',previous_status:current.status,removed_samples:keys.length,provider_submissions:0})]);
  const remaining=(await db.query('SELECT COUNT(*)::int AS count FROM artist_voice_profiles WHERE creator_id=$1',[artistId])).rows[0]?.count;if(remaining!==0)throw Error('Voice profile reset verification failed.');
  await db.query('COMMIT');return {cleared:true,removed_samples:keys.length,profile_status:'none',provider_submissions:0,other_accounts_modified:false};
 }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db?.release();await pool.end();}
}
module.exports={signedURL,sampleKeys,reset};
if(require.main===module){let inputs={},stage='startup';try{inputs=JSON.parse(require('node:fs').readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')).inputs||{};}catch{}reset({lookup:inputs.voice_account_lookup,expectedTaskHash:inputs.voice_reset_task_lookup,onStage:value=>{stage=value;}}).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(JSON.stringify({cleared:false,stage,reason:/^(Cleanup |Private sample |Invalid private |A rejected |Voice profile )/.test(e.message)?e.message:'Voice cleanup could not complete safely.',http_status:Number.isInteger(e.httpStatus)?e.httpStatus:null,database_error:/^[A-Z0-9]{5}$/.test(e.code||'')?e.code:null,target_present:!!inputs.voice_account_lookup,failed_task_lock_present:!!inputs.voice_reset_task_lookup,provider_submissions:0}));process.exitCode=1;});}
