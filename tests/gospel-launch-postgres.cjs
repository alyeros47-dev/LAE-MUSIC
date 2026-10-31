'use strict';
// Disposable, explicitly named local database only. Provider/audio are synthetic.
const target=require('./ci-database.cjs').ciDatabase();
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const {bootstrap}=require('./legacy-bootstrap.cjs'),{migrate}=require('../lib/migrations');
const codes=require('../lib/music-upload-codes');
(async()=>{
 const pool=new Pool({connectionString:target.href,ssl:false});let checks=0;
 try{
  await bootstrap(pool);await migrate(pool);assert.deepEqual(await migrate(pool),[]);checks++;
  const a=(await pool.query("INSERT INTO creators(display_name,email,password_salt,password_hash) VALUES('Gospel QA',$1,'fixture-salt','fixture-hash') RETURNING id",['gospel-'+crypto.randomUUID()+'@example.invalid'])).rows[0].id;
  const task='task_'+crypto.randomBytes(8).toString('hex'),clip='clip_'+crypto.randomBytes(8).toString('hex');
  await pool.query("INSERT INTO sonic_test_tasks(task_id,creator_id,status) VALUES($1,$2,'running')",[task,a]);
  const audio=Buffer.alloc(2048);audio.write('ID3');const options={pool,artistId:a,taskId:task,clipId:clip,provider:{clips:async()=>[{clip_id:clip,title:'Original prayer',audio_url:'https://fixture.invalid/song.mp3'}]},download:async()=>({bytes:audio})};
  await assert.rejects(codes.issue(options),e=>e.status===403);assert.equal((await pool.query("SELECT count(*)::int n FROM generation_records WHERE creator_id=$1",[a])).rows[0].n,0);checks++;
  await pool.query("UPDATE sonic_test_tasks SET status='succeeded' WHERE task_id=$1",[task]);
  const [one,two]=await Promise.all([codes.issue(options),codes.issue(options)]);assert.deepEqual(one,two);assert.equal((await pool.query('SELECT count(*)::int n FROM generation_records WHERE creator_id=$1',[a])).rows[0].n,1);checks++;
  await assert.rejects(codes.authorization(pool,String(BigInt(a)+999n),one.generation_id),e=>e.status===403);assert.equal((await codes.authorization(pool,a,one.generation_id)).audio_sha256,crypto.createHash('sha256').update(audio).digest('hex'));checks++;
  await assert.rejects(codes.requirePlan(pool,a),e=>e.status===403);checks++;
  const track=(await pool.query("INSERT INTO music_tracks(creator_id,title,genre,audio_key,audio_mime,audio_bytes) VALUES($1,'Original prayer','Gospel',$2,'audio/mpeg',2048) RETURNING id",[a,'isolated/'+crypto.randomUUID()])).rows[0].id;
  await pool.query('UPDATE generation_records SET used_at=NOW(),generated_track_id=$1 WHERE id=$2',[track,one.generation_id]);
  await codes.verifyUploaded({pool,artistId:a,trackId:track,url:'https://fixture.invalid/song.mp3',fetcher:async()=>new Response(audio)});checks++;
  await assert.rejects(codes.verifyUploaded({pool,artistId:a,trackId:track,url:'https://fixture.invalid/song.mp3',fetcher:async()=>new Response('ID3unrelated recording')}),e=>e.status===400);checks++;
  await assert.rejects(codes.assertUnpublished(pool,a,task,clip),e=>e.status===409);checks++;
  // The post-storage publication gate rejects a code-funded song without an active plan.
  await assert.rejects(require('../lib/upload-publication').publishUpload(pool,a,track),e=>e.status===403);assert.equal((await pool.query('SELECT status FROM music_tracks WHERE id=$1',[track])).rows[0].status,'pending_upload');checks++;
  // Historical complimentary recordings are preserved, but the retired flag no longer permits unpaid publication.
  const savedEnv=process.env.LAE_ARTIST_TEST_ACCESS;
  try{
   process.env.LAE_ARTIST_TEST_ACCESS='1';
   await assert.rejects(codes.requireUploadAccess(pool,a,{generationId:one.generation_id}),e=>e.status===403);checks++;
   const reference='complimentary-'+crypto.randomUUID();
   await pool.query("INSERT INTO artist_test_generations(reservation_reference,artist_id,task_reference,status) VALUES($1,$2,$3,'reserved')",[reference,a,task]);
   await assert.rejects(codes.requireUploadAccess(pool,a,{generationId:one.generation_id}),e=>e.status===403);checks++;
   await pool.query("UPDATE artist_test_generations SET status='completed' WHERE reservation_reference=$1",[reference]);
   await assert.rejects(codes.requireUploadAccess(pool,String(BigInt(a)+999n),{generationId:one.generation_id}),e=>e.status===403);checks++;
   await assert.rejects(codes.requireUploadAccess(pool,a),e=>e.status===403);checks++;
   await assert.rejects(codes.requireUploadAccess(pool,a,{generationId:one.generation_id}),e=>e.status===403);checks++;
   process.env.LAE_ARTIST_TEST_ACCESS='0';await assert.rejects(codes.requireUploadAccess(pool,a,{generationId:one.generation_id}),e=>e.status===403);checks++;
   process.env.LAE_ARTIST_TEST_ACCESS='1';
   await pool.query("UPDATE artist_test_generations SET status='restored' WHERE reservation_reference=$1",[reference]);
   await assert.rejects(require('../lib/upload-publication').publishUpload(pool,a,track),e=>e.status===403);checks++;
   await pool.query("UPDATE artist_test_generations SET status='completed' WHERE reservation_reference=$1",[reference]);
   await pool.query("UPDATE sonic_test_tasks SET status='failed' WHERE task_id=$1",[task]);
   await assert.rejects(require('../lib/upload-publication').publishUpload(pool,a,track),e=>e.status===403);checks++;
   await pool.query("UPDATE sonic_test_tasks SET status='succeeded' WHERE task_id=$1",[task]);
   await codes.verifiedUploadBody({pool,artistId:a,trackId:track,length:audio.length,input:require('node:stream').Readable.from([audio])});
   await assert.rejects(require('../lib/upload-publication').publishUpload(pool,a,track),e=>e.status===403);
   assert.equal((await pool.query('SELECT status FROM music_tracks WHERE id=$1',[track])).rows[0].status,'pending_upload');
   await assert.rejects(codes.assertUnpublished(pool,a,task,clip),e=>e.status===409);checks++;
   // Return only this disposable fixture to pending to exercise the paid gate below.
   await pool.query("UPDATE music_tracks SET status='pending_upload',published_at=NULL WHERE id=$1",[track]);
  }finally{if(savedEnv===undefined)delete process.env.LAE_ARTIST_TEST_ACCESS;else process.env.LAE_ARTIST_TEST_ACCESS=savedEnv;}
  const sub=(await pool.query("INSERT INTO artist_subscriptions(artist_id,plan,amount_cents,payment_reference,status,starts_at,expires_at) VALUES($1,'starter',600,$2,'paid',NOW()-INTERVAL '1 day',NOW()+INTERVAL '365 days') RETURNING id",[a,'isolated-'+crypto.randomUUID()])).rows[0].id;
  await codes.requirePlan(pool,a);checks++;
  await pool.query('UPDATE artist_subscriptions SET payment_hold=TRUE WHERE id=$1',[sub]);await assert.rejects(codes.requirePlan(pool,a),e=>e.status===403);await pool.query('UPDATE artist_subscriptions SET payment_hold=FALSE WHERE id=$1',[sub]);checks++;
  await require('../lib/upload-publication').publishUpload(pool,a,track);assert.equal((await pool.query('SELECT status FROM music_tracks WHERE id=$1',[track])).rows[0].status,'published');checks++;
  const {studioHistory}=require('../lib/studio-history');
  let recovered=await studioHistory(pool,a);
  assert(recovered.generations.some(g=>g.generation_reference===task&&g.status==='succeeded'));checks++;
  assert.equal((await studioHistory(pool,String(BigInt(a)+99999n))).generations.length,0);checks++;
  await pool.query('INSERT INTO artist_studio_usage(subscription_id,artist_id,generation_reference) VALUES($1,$2,$3)',[sub,a,task]);
  recovered=await studioHistory(pool,a);assert.equal(recovered.generations.filter(g=>g.generation_reference===task).length,1);checks++;
  const provisional='sonic-history-'+crypto.randomUUID();
  await pool.query('INSERT INTO artist_studio_usage(subscription_id,artist_id,generation_reference) VALUES($1,$2,$3)',[sub,a,provisional]);
  recovered=await studioHistory(pool,a);assert(recovered.generations.some(g=>g.generation_reference===provisional&&g.status==='reserved'));checks++;
  // An interrupted generated-song upload reserves one draft and remains resumable.
  const resume=require('../lib/upload-resume'),{transaction}=require('../lib/transactions');
  const task2='resume_'+crypto.randomBytes(8).toString('hex'),clip2='clip_'+crypto.randomBytes(8).toString('hex');
  await pool.query("INSERT INTO sonic_test_tasks(task_id,creator_id,status) VALUES($1,$2,'succeeded')",[task2,a]);
  const token=await codes.issue({...options,taskId:task2,clipId:clip2,provider:{clips:async()=>[{clip_id:clip2,title:'Resume prayer',audio_url:'https://fixture.invalid/resume.mp3'}]}});
  const data={codeHash:crypto.createHash('sha256').update(token.uploadCode).digest('hex'),title:'Resume prayer',genre:'Gospel',description:'Keep this original draft',audioKey:'isolated/resume-'+crypto.randomUUID()+'.mp3',coverKey:'isolated/resume-'+crypto.randomUUID()+'.png',audioMime:'audio/mpeg',audioBytes:audio.length,coverMime:'image/png'};
  const start=body=>transaction(pool,async db=>{await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[a]);return resume.reserve(db,a,body);});
  assert.equal((await resume.checkCode(pool,a,token.uploadCode)).used,false);checks++;
  const attempts=await Promise.all([start(data),start(data)]);assert.equal(String(attempts[0].id),String(attempts[1].id));assert.equal(attempts.filter(x=>x.resumed).length,1);checks++;
  const id=attempts[0].id;
  let state=await resume.checkCode(pool,a,token.uploadCode);assert.equal(state.valid,true);assert.equal(state.resumable,true);assert.equal(state.used,true);assert.equal(String(state.track_id),String(id));checks++;
  assert.equal((await pool.query('SELECT COUNT(*)::int n FROM music_tracks WHERE creator_id=$1 AND audio_key=$2',[a,data.audioKey])).rows[0].n,1);checks++;
  await assert.rejects(resume.checkCode(pool,String(BigInt(a)+99999n),token.uploadCode),e=>e.status===404);checks++;
  await assert.rejects(start({...data,audioBytes:audio.length+1}),e=>e.status===409);assert.equal((await resume.checkCode(pool,a,token.uploadCode)).resumable,true);checks++;
  await assert.rejects(start({...data,coverMime:'image/jpeg'}),e=>e.status===409);checks++;
  await assert.rejects(codes.verifiedUploadBody({pool,artistId:a,trackId:id,length:audio.length,input:require('node:stream').Readable.from([Buffer.alloc(audio.length,9)])}),e=>e.status===400);checks++;
  const beforeUsage=(await pool.query('SELECT COUNT(*)::int n FROM artist_studio_usage WHERE artist_id=$1',[a])).rows[0].n;
  const quota=require('../lib/plans').starter.uploads,current=(await pool.query("SELECT COUNT(*)::int n FROM music_tracks WHERE creator_id=$1 AND status IN ('published','pending_upload')",[a])).rows[0].n;
  for(let n=current;n<quota;n++)await pool.query("INSERT INTO music_tracks(creator_id,title,genre,audio_key,audio_mime,audio_bytes) VALUES($1,'Resume quota fixture','Gospel',$2,'audio/mpeg',2048)",[a,'isolated/'+crypto.randomUUID()]);
  await assert.rejects(codes.requirePlan(pool,a),e=>e.status===409);
  assert.equal(String((await start(data)).id),String(id));checks++;
  await require('../lib/upload-publication').publishUpload(pool,a,id);
  state=await resume.checkCode(pool,a,token.uploadCode);assert.equal(state.valid,false);assert.equal(state.resumable,false);assert.equal(state.published,true);checks++;
  await assert.rejects(start(data),e=>e.status===409);assert.equal((await pool.query('SELECT COUNT(*)::int n FROM artist_studio_usage WHERE artist_id=$1',[a])).rows[0].n,beforeUsage);checks++;
  const limit=require('../lib/plans').starter.uploads;for(let n=1;n<limit;n++)await pool.query("INSERT INTO music_tracks(creator_id,title,genre,audio_key,audio_mime,audio_bytes) VALUES($1,'Quota fixture','Gospel',$2,'audio/mpeg',2048)",[a,'isolated/'+crypto.randomUUID()]);await assert.rejects(codes.requirePlan(pool,a),e=>e.status===409);checks++;
  console.log(JSON.stringify({status:'passed',database:'disposable local PostgreSQL',checks,paid_calls:0,production_writes:0}));
 }finally{await pool.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
