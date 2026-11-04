'use strict';
// Reads one owned production profile and its existing provider task. No server
// initialization, DDL, training, retries, new samples or paid provider calls.
const crypto=require('node:crypto');
const {serviceValid,inventory}=require('./audit-existing-service.cjs');
const {databaseOptions}=require('../lib/database');
const SERVICE='srv-db84s7m89jmc73c7l9rg';
const fingerprint=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
function redact(value,secrets=[]){
 let text=typeof value==='string'?value:'';
 for(const secret of secrets.filter(s=>typeof s==='string'&&s.length>=8))text=text.split(secret).join('[secret omitted]');
 return text.replace(/https?:\/\/[^\s"<>]+/gi,'[private URL omitted]').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email omitted]').slice(0,1600);
}
function summary(body,secrets){
 const result={};
 for(const [scope,source]of [['response',body],['data',body?.data]]){
  if(!source||typeof source!=='object'||Array.isArray(source))continue;
  result[scope+'_keys']=Object.keys(source).slice(0,35);
  for(const key of ['code','type','status','message','error','error_message','detail','reason_code','retriable','refund_processed']){
   const value=source[key];
   if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')result[scope+'_'+key]=redact(String(value),secrets);
   else if(value&&typeof value==='object'&&typeof value.message==='string')result[scope+'_'+key]=redact(value.message,secrets);
  }
 }
 result.persona_returned=!!(body?.persona_id||body?.data?.persona_id);
 return result;
}
async function inspect({key=process.env.RENDER_API_KEY,artistHash=process.env.LAE_VOICE_ARTIST_SHA256,fetcher=fetch,dbFactory=options=>new(require('pg').Pool)(options)}={}){
 if(!key||!/^[a-f0-9]{64}$/.test(artistHash||''))throw Error('Configured read access and one artist-name digest are required.');
 async function render(path){
  if(!path.startsWith('/services/'+SERVICE))throw Error('Unapproved Render target');
  const r=await fetcher('https://api.render.com/v1'+path,{method:'GET',headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw Error('Render read returned HTTP '+r.status);
  return r.json();
 }
 const service=await render('/services/'+SERVICE);
 if(service.id!==SERVICE||!serviceValid(service))throw Error('Production service identity does not match.');
 const env=inventory(await render('/services/'+SERVICE+'/env-vars?limit=100'));
 const report={read_only:true,production_writes:0,paid_provider_requests:0,target_service:SERVICE,artist_lookup_digest:artistHash,profiles:[]};
 const pool=dbFactory({...databaseOptions(env),max:1});
 let db;
 try{
  db=await pool.connect();await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");await db.query("SET LOCAL lock_timeout='3s'");
  const rows=(await db.query("SELECT v.status,v.task_id,v.object_key,v.updated_at FROM artist_voice_profiles v JOIN creators c ON c.id=v.creator_id WHERE encode(sha256(convert_to(lower(btrim(c.display_name)),'UTF8')),'hex')=$1 LIMIT 3",[artistHash])).rows;
  if(rows.length!==1){report.lookup=rows.length?'ambiguous':'not_found';await db.query('COMMIT');return report;}
  report.lookup='matched';
  for(const row of rows){
   const item={status:row.status,updated_at:row.updated_at,extension:row.object_key?.split('.').at(-1),task_present:!!row.task_id,task_fingerprint:row.task_id?fingerprint(row.task_id):null};
   if(row.task_id&&/^[a-zA-Z0-9_-]{8,128}$/.test(row.task_id)&&!row.task_id.startsWith('voice-')&&env.MUSICAPI_API_KEY){
    const r=await fetcher('https://api.musicapi.ai/api/v1/sonic/task/'+encodeURIComponent(row.task_id),{method:'GET',headers:{Authorization:'Bearer '+env.MUSICAPI_API_KEY},redirect:'error',signal:AbortSignal.timeout(30000)});
    item.provider_http_status=r.status;
    try{item.provider=summary(await r.json(),Object.values(env).concat(key));}catch{item.provider_response_unreadable=true;}
   }
   report.profiles.push(item);
  }
  await db.query('COMMIT');return report;
 }catch(error){if(db)await db.query('ROLLBACK').catch(()=>{});throw error;}
 finally{db?.release();await pool.end();}
}
module.exports={inspect,summary,redact};
if(require.main===module)inspect().then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{console.error('Read-only voice inspection could not complete. No profile, storage or provider task was modified.');process.exitCode=1;});
