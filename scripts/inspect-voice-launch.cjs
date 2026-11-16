'use strict';
// Owner-authorized read-only inspection, including a bounded stored-sample GET.
// No training, generation, production writes, or signed audio URLs in the report.
const {serviceValid,inventory}=require('./audit-existing-service.cjs'),{databaseOptions}=require('../lib/database'),{summary}=require('./inspect-voice-profile.cjs');
const SERVICE='srv-db84s7m89jmc73c7l9rg';
async function inspect({key=process.env.RENDER_API_KEY,artistHash=process.env.LAE_VOICE_ARTIST_SHA256||null,fetcher=fetch,dbFactory=o=>new(require('pg').Pool)(o)}={}){
 if(!key||artistHash&&!/^[a-f0-9]{64}$/.test(artistHash))throw Error('Read access is not configured');
 async function get(url,secret){const r=await fetcher(url,{method:'GET',headers:{Authorization:'Bearer '+secret},redirect:'error',signal:AbortSignal.timeout(25000)});return r;}
 const serviceReply=await get('https://api.render.com/v1/services/'+SERVICE,key);if(!serviceReply.ok)throw Error('Service read failed');const service=await serviceReply.json();if(service.id!==SERVICE||!serviceValid(service))throw Error('Unexpected service');
 const envReply=await get('https://api.render.com/v1/services/'+SERVICE+'/env-vars?limit=100',key);if(!envReply.ok)throw Error('Configuration read failed');const env=inventory(await envReply.json());
 const report={read_only:true,production_writes:0,paid_provider_requests:0,sample_bytes_read_limit:64,failed_task_ids:[],configuration:Object.fromEntries(['MUSICAPI_API_KEY','R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'].map(k=>[k,!!env[k]])),voice_capabilities:require('../lib/voice-capabilities').capabilities(env),profiles:[]};
 if(env.MUSICAPI_API_KEY){const r=await get('https://api.musicapi.ai/api/v1/get-credits',env.MUSICAPI_API_KEY);let j={};try{j=await r.json();}catch{}report.provider_auth={http_status:r.status,verified:r.ok&&Number.isFinite(j.credits??j.data?.credits),credits_available:Number(j.credits??j.data?.credits??0)>0};}
 const pool=dbFactory({...databaseOptions(env),max:1});let db;
 try{db=await pool.connect();await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");await db.query("SET LOCAL lock_timeout='3s'");
 report.status_counts=(await db.query('SELECT status,COUNT(*)::integer AS profiles FROM artist_voice_profiles GROUP BY status ORDER BY status')).rows;
 const rows=(await db.query("SELECT v.creator_id,v.status,v.task_id,v.object_key,v.updated_at,(SELECT a.details FROM platform_audit a WHERE a.actor_type='artist' AND a.actor_id=v.creator_id::text AND a.action='voice.training.failure' AND a.resource=v.task_id ORDER BY a.created_at DESC LIMIT 1) AS failure FROM artist_voice_profiles v JOIN creators c ON c.id=v.creator_id WHERE ($1::text IS NULL OR encode(sha256(convert_to(lower(btrim(c.display_name)),'UTF8')),'hex')=$1) ORDER BY v.updated_at DESC LIMIT 5",[artistHash])).rows;
 for(const row of rows){const item={status:row.status,updated_at:row.updated_at,task_present:!!row.task_id,recorded_failure:row.failure?{code:row.failure.code,retry_allowed:row.failure.retry_allowed,provider_reason:row.failure.provider_reason}:null};
 if(env.MUSICAPI_API_KEY&&/^[A-Za-z0-9_-]{8,128}$/.test(row.task_id||'')&&!row.task_id.startsWith('voice-')){const r=await get('https://api.musicapi.ai/api/v1/sonic/task/'+encodeURIComponent(row.task_id),env.MUSICAPI_API_KEY);item.provider_http_status=r.status;try{item.provider=summary(await r.json(),Object.values(env).concat(key));}catch{item.provider_response_unreadable=true;}}
 if(row.status==='failed'&&/^[A-Za-z0-9_-]{8,128}$/.test(row.task_id||'')&&!row.task_id.startsWith('voice-')){
  report.failed_task_ids.push(row.task_id);
  if(row.object_key&&Object.values(report.configuration).every(Boolean)){
   try{
    // Reuse the exact production signer without starting the server or exposing the URL.
    const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require('node:path').join(__dirname,'../server.js'),'utf8');
    const a=source.indexOf('function hmac(key,msg)'),b=source.indexOf('async function headObject(',a);
    if(a<0||b<0)throw Error('Signer unavailable');
    const sign=vm.runInNewContext(source.slice(a,b)+';presign',{crypto:require('node:crypto'),URLSearchParams,require(){throw Error('Unexpected signer dependency');}});
    const url=sign({account:env.R2_ACCOUNT_ID,key:env.R2_ACCESS_KEY_ID,secret:env.R2_SECRET_ACCESS_KEY,bucket:env.R2_BUCKET},row.object_key,'get',7200);
    item.sample_read=await require('../lib/voice-sample').verifyReadURL(url,{fetchImpl:fetcher});
   }catch{item.sample_read={reachable:false,explanation:'Stored sample URL could not be validated. No training was attempted.'};}
  }
 }
 report.profiles.push(item);}
 const historical=(await db.query("SELECT DISTINCT resource AS task_id FROM platform_audit WHERE action='voice.training.failure' AND resource ~ '^[A-Za-z0-9_-]{8,128}
 await db.query('COMMIT');return report;
 }catch(error){if(db)await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db?.release();await pool.end();}
}
module.exports={inspect};
if(require.main===module)inspect().then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{console.error('Read-only voice configuration inspection could not complete. No voice sample or production data was changed.');process.exitCode=1;});
 AND resource NOT LIKE 'voice-%' ORDER BY resource LIMIT 3")).rows;
 report.failed_task_ids=[...new Set(report.failed_task_ids.concat(historical.map(r=>r.task_id)))].slice(0,3);
 await db.query('COMMIT');return report;
 }catch(error){if(db)await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db?.release();await pool.end();}
}
module.exports={inspect};
if(require.main===module)inspect().then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{console.error('Read-only voice configuration inspection could not complete. No voice sample or production data was changed.');process.exitCode=1;});
