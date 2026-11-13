'use strict';
// Only disposable local schemas and mocked R2/provider responses are used.
const target=require('./ci-database.cjs').ciDatabase();
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Readable}=require('node:stream'),{Pool}=require('pg');
const voice=require('../artist-voice'),{runtime}=require('./runtime.cjs');
test('voice failures preserve recordings, release no song credits and reject duplicate training',async t=>{
 const control=new Pool({connectionString:target.href,ssl:false}),schema='voice_failure_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);
 const pool=new Pool({connectionString:target.href,ssl:false,options:'-c search_path='+schema});
 const oldFetch=global.fetch,oldKey=process.env.MUSICAPI_API_KEY;
 try{
  await runtime({pool,env:{NODE_ENV:'test',STUDIO_RELEASE_WORKER_ENABLED:'false'}});
  async function artist(name){const id=(await pool.query("INSERT INTO creators(display_name,email,password_salt,password_hash,plan) VALUES($1,$2,'fixture-salt','fixture-password-hash','starter') RETURNING id",[name,name+'@voice-ci.invalid'])).rows[0].id;await pool.query("INSERT INTO artist_subscriptions(artist_id,plan,amount_cents,payment_reference,status,starts_at,expires_at) VALUES($1,'starter',600,$2,'paid',NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 year')",[id,'voice-only-fixture-'+id]);return id;}
  const a=await artist('voice-owner'),b=await artist('voice-other');
  const initialUsage={};for(const table of ['generation_ledger','artist_studio_usage','studio_purchased_credits'])initialUsage[table]=(await pool.query('SELECT COUNT(*)::int AS n FROM '+table)).rows[0].n;
  await require('./voice-production-postgres.cjs')(t,{pool,artist:a,other:b});
  process.env.MUSICAPI_API_KEY='voice-ci-provider-fixture';
  let owner=b,requests=0;
  global.fetch=async(url,options={})=>{requests++;assert(!options.method||options.method==='GET');assert(url.startsWith('https://api.musicapi.ai/api/v1/sonic/task/'));return Response.json({type:'failed',error:'didnt_say_verification_phrase',reason_code:'voice_verification_failed',retriable:false,data:{type:'api_error',message:'didnt_say_verification_phrase',retriable:false,refund_processed:true}});};
  const ctx={pool,me:async()=>({id:owner}),validOrigin:()=>true,storage:()=>({bucket:'fixture'}),presign(){throw Error('No new signed upload/download is needed.');},headObject(){throw Error('No retraining is allowed.');}};
  async function api(path,body){const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.url=path;req.method=body===undefined?'GET':'POST';req.headers={};const res={writeHead(status){this.status=status;},end(data){this.data=JSON.parse(data);}};await voice(req,res,path,ctx);return res;}
  const objectKey='voice-profiles/'+b+'/'+crypto.randomUUID()+'.wav',taskId='owned_failed_voice_task_123';
  await pool.query("INSERT INTO artist_voice_profiles(creator_id,object_key,task_id,status) VALUES($1,$2,$3,'training')",[b,objectKey,taskId]);
  await t.test('concurrent status polling books the exact failed task once and retains its safe explanation',async()=>{
   const responses=await Promise.all([api('/api/voice/status'),api('/api/voice/status')]);
   for(const r of responses){assert.equal(r.status,200);assert.equal(r.data.status,'failed');assert.equal(r.data.failure.code,'voice_verification_required');assert.equal(r.data.failure.retry_allowed,false);assert.equal(r.data.failure.provider_refund_processed,true);}
   const rows=(await pool.query("SELECT details FROM platform_audit WHERE action='voice.training.failure' AND actor_id=$1",[String(b)])).rows;assert.equal(rows.length,1);assert.equal(rows[0].details.provider_reason,'didnt_say_verification_phrase');
  });
  await t.test('reload, save and direct train requests preserve the original sample and never call create-voice',async()=>{
   const before=(await pool.query('SELECT * FROM artist_voice_profiles WHERE creator_id=$1',[b])).rows;
   const priorRequests=requests;
   assert.equal((await api('/api/voice/profile')).data.failure.code,'voice_verification_required');
   const upload=await api('/api/voice/upload',{type:'audio/wav',bytes:11520044,consent:true});assert.equal(upload.status,409);assert.equal(upload.data.code,'voice_verification_required');
   assert.equal((await api('/api/voice/train',{})).status,409);
   assert.deepEqual((await pool.query('SELECT * FROM artist_voice_profiles WHERE creator_id=$1',[b])).rows,before);assert.equal(requests,priorRequests);
   for(const table of ['generation_ledger','artist_studio_usage','studio_purchased_credits'])assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM '+table)).rows[0].n,initialUsage[table]);
  });
  await t.test('another artist keeps their existing ready voice and cannot read this failure',async()=>{
   owner=a;const r=await api('/api/voice/profile');assert.equal(r.data.status,'ready');assert.equal(r.data.hasVoice,true);assert(!r.data.failure);
  });
 }finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.MUSICAPI_API_KEY;else process.env.MUSICAPI_API_KEY=oldKey;await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
