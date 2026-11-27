'use strict';
// Owner-selected account; production database is read-only. Audio stays in memory.
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const SERVICE='srv-db84s7m89jmc73c7l9rg';
const {serviceValid,inventory}=require('./audit-existing-service.cjs');
function signer(){
 const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const a=source.indexOf('function hmac(key,msg)'),b=source.indexOf('async function headObject(',a);
 if(a<0||b<0)throw Error('Production voice signer unavailable.');
 return vm.runInNewContext(source.slice(a,b)+';presign',{crypto,URLSearchParams,require(){throw Error('Unexpected signer dependency.');}});
}
function waveform(bytes){
 if(!require('../lib/voice-sample').validAudio(bytes,'audio/wav'))throw Error('Saved recording failed complete WAV validation.');
 let offset=12,format,data;
 while(offset+8<=bytes.length){const kind=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8;if(kind==='fmt ')format={channels:bytes.readUInt16LE(start+2),sample_rate:bytes.readUInt32LE(start+4),byte_rate:bytes.readUInt32LE(start+8)};if(kind==='data')data=bytes.subarray(start,start+size);offset=start+size+size%2;}
 let peak=0,sum=0,clipped=0;for(let i=0;i<data.length;i+=2){const x=data.readInt16LE(i)/32768;peak=Math.max(peak,Math.abs(x));sum+=x*x;if(Math.abs(x)>=0.999)clipped++;}
 const rms=Math.sqrt(sum/(data.length/2)),clip=clipped/(data.length/2);
 return {format:'PCM16 WAV',duration_seconds:data.length/format.byte_rate,channels:format.channels,sample_rate:format.sample_rate,peak_db:peak?20*Math.log10(peak):null,rms_db:rms?20*Math.log10(rms):null,clipped_fraction:clip,not_silent:peak>0.001&&rms>0.0003,not_heavily_clipped:clip<0.01};
}
async function boundedAudio(url,fetcher=fetch){
 const r=await fetcher(url,{method:'GET',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(45000)});
 if(!r.ok||!r.body)throw Error('Saved sample could not be read without login.');
 const reader=r.body.getReader(),parts=[];let length=0;
 try{while(true){const p=await reader.read();if(p.done)break;length+=p.value.length;if(length>12000000)throw Error('Saved sample exceeds 12 MB.');parts.push(Buffer.from(p.value));}}finally{await reader.cancel().catch(()=>{});}
 const bytes=Buffer.concat(parts);if(bytes.length<10000)throw Error('Saved sample is too short.');return bytes;
}
async function inspect({key=process.env.RENDER_API_KEY,accountName=null,fetcher=fetch,dbFactory=o=>new(require('pg').Pool)(o)}={}){
 if(!key)throw Error('Render read access unavailable.');
 async function get(url){const r=await fetcher(url,{method:'GET',headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Read-only Render access failed.');return r.json();}
 const service=await get('https://api.render.com/v1/services/'+SERVICE);if(service.id!==SERVICE||!serviceValid(service))throw Error('Wrong production service.');
 const env=inventory(await get('https://api.render.com/v1/services/'+SERVICE+'/env-vars?limit=100'));
 const pool=dbFactory({...require('../lib/database').databaseOptions(env),max:1});let db,row;
 try{db=await pool.connect();await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
  const lookup=accountName?crypto.createHash('sha256').update(accountName.trim().replace(/\s+/g,' ').toLowerCase()).digest('hex'):require('../lib/voice-acceptance-budget').target().lookup_sha256;
  const rows=(await db.query("SELECT c.id,c.display_name,v.object_key,v.task_id,v.status,v.updated_at FROM creators c LEFT JOIN artist_voice_profiles v ON v.creator_id=c.id WHERE encode(sha256(convert_to(lower(regexp_replace(btrim(c.display_name),'\\s+',' ','g')),'UTF8')),'hex')=$1 ORDER BY c.id LIMIT 4",[lookup])).rows;
  if(rows.length!==1)throw Error('Owner-selected voice account lookup was missing or ambiguous.');row=rows[0];
  if(!row.object_key||!['failed','uploading','ready'].includes(row.status))throw Error('Account has no saved recording, or its previous request is still unresolved.');
  if(!new RegExp('^voice-profiles/'+row.id+'/[a-f0-9-]{36}\\.wav$').test(row.object_key))throw Error('Saved recording is not an owned recorder WAV.');
  await db.query('COMMIT');
 }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db?.release();await pool.end();}
 const store={account:env.R2_ACCOUNT_ID,key:env.R2_ACCESS_KEY_ID,secret:env.R2_SECRET_ACCESS_KEY,bucket:env.R2_BUCKET};if(Object.values(store).some(x=>!x)||!env.MUSICAPI_API_KEY)throw Error('Voice provider or private storage is not configured.');
 const presign=signer(),url=presign(store,row.object_key,'get',7200);
 await require('../lib/voice-sample').verifyReadURL(url,{fetchImpl:fetcher});
 const bytes=await boundedAudio(url,fetcher),metrics=waveform(bytes);
 const report={status:'preflight',account:row.display_name,account_id:String(row.id),source_profile_status:row.status,existing_task_id:row.task_id,source_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sample_url_accessible:true,sample_bytes:bytes.length,...metrics,production_database_writes:0,provider_paid_requests:0};
 if(!metrics.not_silent||!metrics.not_heavily_clipped)throw Error('Recording is silent, extremely quiet or heavily clipped. A clean replacement is needed before paid training.');
 // Private state is returned only to the controlled runner, never serialized.
 return {report,bytes,row,store,presign,env};
}
module.exports={SERVICE,signer,waveform,boundedAudio,inspect};
if(require.main===module)inspect().then(x=>console.log(JSON.stringify({matched:true,saved_recording_accessible:x.report.sample_url_accessible,wav_format_valid:true,not_silent:x.report.not_silent,not_heavily_clipped:x.report.not_heavily_clipped,production_database_writes:0,provider_paid_requests:0},null,2))).catch(e=>{console.error(/^(Owner-selected voice account lookup|Account has no saved recording|Saved recording is not an owned|Saved recording failed complete|Recording is silent)/.test(e.message)?e.message:'Owned voice preflight could not complete. No paid request was made.');process.exitCode=1;});
