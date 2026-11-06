'use strict';
// No production data, credentials, real storage or paid providers are used.
const target=require('./ci-database.cjs').ciDatabase();
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const {runtime}=require('./runtime.cjs'),codes=require('../lib/music-upload-codes');
const key=()=>crypto.randomUUID();
test('controlled publishing enforces generated ownership and exact audio without losing existing records',async t=>{
 const control=new Pool({connectionString:target.href,ssl:false}),schema='controlled_publishing_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);
 const pool=new Pool({connectionString:target.href,ssl:false,options:'-c search_path='+schema}),originalFetch=global.fetch;
 const objects=new Map();let storageCalls=0;
 const audio=Buffer.alloc(2048);audio.write('ID3');
 const env={NODE_ENV:'test',R2_ACCOUNT_ID:'a'.repeat(32),R2_ACCESS_KEY_ID:'isolated-key',R2_SECRET_ACCESS_KEY:'isolated-secret',R2_BUCKET:'controlled-publishing-fixture',STUDIO_RELEASE_WORKER_ENABLED:'false'};
 try{
  global.fetch=async(url,options={})=>{
   storageCalls++;const u=new URL(url);assert(u.hostname.endsWith('.r2.cloudflarestorage.com'),'No provider or external network calls are allowed');const objectKey=decodeURIComponent(u.pathname.split('/').slice(2).join('/'));
   if(options.method==='PUT'){objects.set(objectKey,{bytes:Buffer.from(options.body),mime:options.headers['Content-Type']});return new Response('');}
   const object=objects.get(objectKey);if(!object)return new Response('',{status:404});
   let bytes=object.bytes;const range=options.headers?.Range;if(range){const m=range.match(/bytes=(\d+)-(\d+)/);bytes=bytes.subarray(Number(m[1]),Number(m[2])+1);}
   return new Response(options.method==='HEAD'?null:bytes,{status:range?206:200,headers:{'Content-Type':object.mime,'Content-Length':String(options.method==='HEAD'?object.bytes.length:bytes.length)}});
  };
  const app=await runtime({pool,env});
  const api=async(path,body,cookie,method)=>{const r=await app.request(path,{method:method||(body===undefined?'GET':'POST'),body,remoteAddress:'192.0.2.'+(1+crypto.randomInt(200)),headers:{...(cookie?{cookie}:{}),'idempotency-key':key(),...(Buffer.isBuffer(body)?{'content-type':'audio/mpeg','content-length':String(body.length)}:{})}});return {status:r.status,data:r.json(),cookie:[r.headers['set-cookie']||[]].flat().map(c=>c.split(';')[0]).join('; ')};};
  async function register(name){const r=await api('/api/register',{name,country:'Nigeria',email:name+'@controlled-publishing.invalid',password:'ControlledPublishingPassword123',confirmPassword:'ControlledPublishingPassword123',plan:'starter'});assert.equal(r.status,201,JSON.stringify(r.data));const a={id:r.data.user.id,cookie:r.cookie};await pool.query("INSERT INTO artist_subscriptions(artist_id,plan,amount_cents,payment_reference,status,starts_at,expires_at) VALUES($1,'starter',600,$2,'paid',NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 year')",[a.id,'controlled-package-'+a.id]);const agreement=require('../lib/creator-agreement').disclosure();await require('../lib/creator-agreement').accept(pool,a.id,{accepted:true,version:agreement.version,content_hash:agreement.content_hash});return a;}
  const a=await register('controlled-owner'),b=await register('controlled-other');
  const follower=await api('/api/listener/register',{name:'Policy listener',country:'Nigeria',email:'follower@controlled-publishing.invalid',password:'ControlledPublishingPassword123',confirmPassword:'ControlledPublishingPassword123'});assert.equal(follower.status,201);await pool.query('INSERT INTO listener_favorite_artists(listener_id,artist_id) VALUES($1,$2)',[follower.data.user.id,a.id]);
  const legacy=(await pool.query("INSERT INTO music_tracks(creator_id,title,genre,audio_key,audio_mime,audio_bytes,status,published_at) VALUES($1,'Existing preserved recording','Gospel','legacy/preserved.mp3','audio/mpeg',2048,'published',NOW()-INTERVAL '10 days') RETURNING *",[a.id])).rows[0];objects.set(legacy.audio_key,{bytes:audio,mime:'audio/mpeg'});
  const input={title:'Studio original',genre:'Gospel Praise',description:'Original Studio song',audioMime:'audio/mpeg',audioBytes:audio.length,rightsConfirmed:true};
  let permit,trackId;
  await t.test('active paid packages and forged flags cannot authorize a code-free external upload',async()=>{
   for(const extra of [{},{generated:true,studioOnly:false,source:'studio',generation_id:1,externalUploadsEnabled:true,plan:'professional'}]){const r=await api('/api/music/upload/start',{...input,...extra},a.cookie);assert.equal(r.status,403,JSON.stringify(r.data));assert.match(r.data.error,/Only songs generated through LAE-MUSIC Studio/);}
   assert.equal(storageCalls,0);assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM music_tracks WHERE status='pending_upload'")).rows[0].n,0);
  });
  await t.test('fake, foreign and lyrics-only codes cannot reserve a song or consume a valid authorization',async()=>{
   const task='controlled_task_123456',clip='controlled_clip_123456';await pool.query("INSERT INTO sonic_test_tasks(task_id,creator_id,status) VALUES($1,$2,'succeeded')",[task,a.id]);
   permit=await codes.issue({pool,artistId:a.id,taskId:task,clipId:clip,provider:{clips:async()=>[{clip_id:clip,title:input.title,audio_url:'https://fixture.invalid/owned.mp3'}]},download:async()=>({bytes:audio})});
   assert.equal((await api('/api/music/upload/start',{...input,uploadCode:permit.uploadCode},b.cookie)).status,409);
   assert.equal((await api('/api/music/upload/start',{...input,uploadCode:'A'.repeat(36)},a.cookie)).status,409);
   const lyricCode='B'.repeat(36);await pool.query("INSERT INTO generation_records(creator_id,code_hash,model,title,lyrics,style) VALUES($1,$2,'gpt-6.1-sol',$3,'Original private words','Gospel')",[a.id,crypto.createHash('sha256').update(lyricCode).digest('hex'),input.title]);
   assert.equal((await api('/api/music/upload/start',{...input,uploadCode:lyricCode},a.cookie)).status,403);
   assert.equal((await api('/api/music/upload/start',{...input,uploadCode:permit.uploadCode,rightsConfirmed:false},a.cookie)).status,400);
   assert.equal((await pool.query('SELECT used_at FROM generation_records WHERE id=$1',[permit.generation_id])).rows[0].used_at,null);assert.equal(storageCalls,0);
  });
  await t.test('the valid generated recording publishes; replacement audio is blocked before storage and the code remains resumable',async()=>{
   const start=await api('/api/music/upload/start',{...input,uploadCode:permit.uploadCode},a.cookie);assert.equal(start.status,201,JSON.stringify(start.data));trackId=start.data.id;
   const beforeCalls=storageCalls;const wrong=await api(start.data.audioUrl,Buffer.alloc(audio.length,7),a.cookie,'PUT');assert.equal(wrong.status,400);assert.equal(storageCalls,beforeCalls);
   const pending=await api('/api/generation/code/check',{code:permit.uploadCode},a.cookie);assert.equal(pending.data.resumable,true);
   const stored=await api(start.data.audioUrl,audio,a.cookie,'PUT');assert.equal(stored.status,200,JSON.stringify(stored.data));
   const finished=await api('/api/music/upload/finish',{id:trackId},a.cookie);assert.equal(finished.status,200,JSON.stringify(finished.data));
   assert.equal((await api('/api/music/upload/finish',{id:trackId},a.cookie)).data.already_published,true);
   const row=(await pool.query('SELECT t.status,t.rights_confirmed_at,g.creator_id FROM music_tracks t JOIN generation_records g ON g.generated_track_id=t.id WHERE t.id=$1',[trackId])).rows[0];assert.equal((await pool.query('SELECT COUNT(*)::int n FROM listener_notifications WHERE track_id=$1 AND listener_id=$2',[trackId,follower.data.user.id])).rows[0].n,1);assert.equal(row.status,'published');assert(row.rights_confirmed_at);assert.equal(String(row.creator_id),String(a.id));
  });
  await t.test('pre-existing external drafts cannot bypass policy through direct file or finish requests',async()=>{
   const external=(await pool.query("INSERT INTO music_tracks(creator_id,title,genre,audio_key,audio_mime,audio_bytes,rights_confirmed_at) VALUES($1,'Old pending external recording','Gospel','old/pending.mp3','audio/mpeg',2048,NOW()) RETURNING id",[a.id])).rows[0].id;
   const beforeCalls=storageCalls;
   assert.equal((await api('/api/music/upload/file?id='+external+'&kind=audio',audio,a.cookie,'PUT')).status,403);
   assert.equal((await api('/api/music/upload/finish',{id:external},a.cookie)).status,403);
   assert.equal(storageCalls,beforeCalls);assert.equal((await pool.query('SELECT status FROM music_tracks WHERE id=$1',[external])).rows[0].status,'pending_upload');
  });
  await t.test('direct saved-Studio publication creates its generation record atomically and cannot bypass generation ownership',async()=>{
   const task='direct_studio_task_123456',clip='direct_studio_clip_123456';await pool.query("INSERT INTO sonic_test_tasks(task_id,creator_id,status) VALUES($1,$2,'succeeded')",[task,a.id]);
   const releases=require('../lib/studio-releases').createStudioReleases({pool,env:{GENERATED_MEDIA_ALLOWED_HOSTS:'fixture.invalid'},provider:{configured:()=>true,clips:async()=>[{clip_id:clip,audio_url:'https://fixture.invalid/owned.mp3'}]},store:{configured:()=>true,put:async(k,v)=>objects.set(k,{bytes:v.bytes,mime:v.mime})},download:async()=>({bytes:audio,mime:'audio/mpeg',extension:'mp3'})});
   const draft=await releases.create(a.id,key(),{task_id:task,clip_id:clip,title:'Direct Studio original',genre:'Gospel',rightsConfirmed:true});await releases.processNext();
   assert.equal((await api('/api/platform/studio/releases/'+draft.id+'/publish',{rightsConfirmed:false},a.cookie)).status,400);
   assert.equal((await api('/api/platform/studio/releases/'+draft.id+'/publish',{rightsConfirmed:true},b.cookie)).status,404);
   const published=await api('/api/platform/studio/releases/'+draft.id+'/publish',{rightsConfirmed:true},a.cookie);assert.equal(published.status,200,JSON.stringify(published.data));
   const g=(await pool.query('SELECT g.* FROM generation_records g JOIN music_tracks t ON t.id=g.generated_track_id WHERE t.studio_release_id=$1',[draft.id])).rows[0];assert(g);assert.equal(String(g.creator_id),String(a.id));assert(g.used_at);assert.equal((await codes.authorization(pool,a.id,g.id)).task_id,task);
   // A failed task with an otherwise ready saved draft cannot be published.
   const task2='failed_studio_task_123456';await pool.query("INSERT INTO sonic_test_tasks(task_id,creator_id,status) VALUES($1,$2,'failed')",[task2,a.id]);
   const invalid=(await pool.query("INSERT INTO studio_releases(artist_id,task_id,clip_id,title,genre,status,rights_confirmed_at,audio_key,audio_mime,audio_bytes,audio_sha256) VALUES($1,$2,'invalid_clip_123456','Invalid draft','Gospel','ready',NOW(),'fixture/invalid.mp3','audio/mpeg',2048,$3) RETURNING id",[a.id,task2,crypto.createHash('sha256').update(audio).digest('hex')])).rows[0].id;
   assert.equal((await api('/api/platform/studio/releases/'+invalid+'/publish',{rightsConfirmed:true},a.cookie)).status,403);
  });
  await t.test('existing published songs, files, accounts and metadata remain readable and unchanged',async()=>{
   const now=(await pool.query('SELECT * FROM music_tracks WHERE id=$1',[legacy.id])).rows[0];assert.deepEqual(now,legacy);assert(objects.has(legacy.audio_key));
   assert.equal((await api('/api/music/track/'+legacy.id)).status,200);assert.equal((await api('/api/music/tracks/'+legacy.id+'/stream')).status,200);
   assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM creators')).rows[0].n,2);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_studio_usage')).rows[0].n,0);
  });
 }finally{global.fetch=originalFetch;await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
