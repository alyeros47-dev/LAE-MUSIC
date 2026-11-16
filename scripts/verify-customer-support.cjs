'use strict';
// Explicit workflow dispatch only. Credentials stay in memory and never reach logs.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{Pool}=require('pg');
const {createSupport,phone}=require('../lib/customer-support');
const SERVICE='srv-db84s7m89jmc73c7l9rg';
async function get(url){const r=await fetch(url,{headers:{Authorization:'Bearer '+process.env.RENDER_API_KEY},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Render read access unavailable (HTTP '+r.status+').');return r.json();}
async function main(){
 if(!process.env.RENDER_API_KEY||!['text','contact'].includes(process.argv[2]))throw Error('Explicit support verification configuration is required.');
 const service=await get('https://api.render.com/v1/services/'+SERVICE);assert.equal(service.id,SERVICE);assert.equal(service.name,'LAE-MUSIC');assert.equal(service.type,'web_service');
 const rows=await get('https://api.render.com/v1/services/'+SERVICE+'/env-vars?limit=100'),env={};for(const r of rows){const v=r.envVar||r;if(Object.hasOwn(env,v.key))throw Error('Duplicate server configuration.');env[v.key]=v.value;}
 if(process.argv[2]==='contact'){
  const number=phone(process.env.SUPPORT_WHATSAPP_NUMBER);if(!number)throw Error('Approved contact is required.');
  const pool=new Pool({...require('../lib/database').databaseOptions(env),max:1});
  try{const r=await pool.query('UPDATE customer_support_settings SET whatsapp_number=$1,updated_at=NOW() WHERE id=1 RETURNING id',[number]);assert.equal(r.rowCount,1);console.log('PASS approved business support contact configured; no account, financial, voice or payment records changed.');}finally{await pool.end();}return;
 }
 const target=require('../tests/ci-database.cjs').ciDatabase(),control=new Pool({connectionString:target.href}),schema='support_live_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});
 try{
  assert(env.OPENAI_API_KEY,'Existing OpenAI connection is missing.');
  await pool.query(fs.readFileSync('migrations/039-customer-support.sql','utf8'));
  let responseCalls=0;const original=global.fetch,service=createSupport({pool,env:{OPENAI_API_KEY:env.OPENAI_API_KEY,NODE_ENV:'test'},fetchImpl:async(url,options)=>{if(url.endsWith('/responses')&&++responseCalls>3)throw Error('Three-request test cap reached.');return original(url,options);}});
  let cookie='',conversation='';const questions=['How do I save catalogue songs for offline listening? Can I export them as MP3 files?','I already tried saving once and my library is still empty. What should I do next?','What are the Starter artist allowance and the direct referral commission? Are artist indirect rewards a percentage?'];
  for(const message of questions){const headers={};const req={headers:{cookie,'idempotency-key':crypto.randomUUID()},socket:{remoteAddress:'127.0.0.1'}},res={getHeader:k=>headers[k],setHeader(k,v){headers[k]=v;if(k==='Set-Cookie')cookie=v[0].split(';')[0];}};const result=await service.chat(req,res,{message,conversation});assert.equal(result.ai,true,'Real AI reply was not verified; do not deploy.');assert(result.links.length>0);conversation=result.conversation;console.log(JSON.stringify({synthetic_question:message,answer:result.answer,escalation:result.escalate}));}
  const usage=(await pool.query('SELECT provider_model,SUM(input_tokens)::int AS input_tokens,SUM(output_tokens)::int AS output_tokens,COUNT(*)::int AS requests FROM customer_support_requests GROUP BY provider_model')).rows;assert.equal(responseCalls,3);console.log(JSON.stringify({result:'PASS',real_support_requests:responseCalls,usage,music_generation_requests:0,customer_credits_used:0,production_database_accessed:false}));
 }finally{await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
}
main().catch(e=>{console.error('Support verification did not pass: '+String(e.message).replace(/https?:\/\/\S+/g,'[redacted URL]'));process.exitCode=1;});
