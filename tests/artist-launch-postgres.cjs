'use strict';
// Disposable local PostgreSQL only. Music, storage and lyrics providers are mocked.
const target=require('./ci-database.cjs').ciDatabase();
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Pool}=require('pg'),{createRequire}=require('node:module');
const launch=require('../lib/artist-launch-access'),codes=require('../lib/music-upload-codes'),agreement=require('../lib/creator-agreement');
const {transaction}=require('../lib/transactions'),{migrate}=require('../lib/migrations'),{runtime}=require('./runtime.cjs');
const key=()=>crypto.randomUUID();
test('owner snapshot and first-200 artist launch promotion',async t=>{
 const control=new Pool({connectionString:target.href}),schema='artist_launch_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);
 const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema,max:24});
 const originalFetch=global.fetch,objects=new Map(),audio=Buffer.alloc(2048);audio.write('ID3');let storageCalls=0,providerCalls=0,providerMode='success',serial=0;
 const password='ArtistLaunchFixture123',hashed=await require('../lib/passwords').hashPassword(password);
 async function insert(name){return (await pool.query('INSERT INTO creators(display_name,email,password_salt,password_hash,country) VALUES($1,$2,$3,$4,$5) RETURNING id',[name,name+'@launch.invalid',hashed.salt,hashed.hash,'Nigeria'])).rows[0].id;}
 const accept=async id=>{const a=agreement.disclosure();return agreement.accept(pool,id,{accepted:true,version:a.version,content_hash:a.content_hash});};
 try{
  await require('./legacy-bootstrap.cjs').bootstrap(pool);
  await pool.query('CREATE TABLE platform_migrations(version TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  for(const file of fs.readdirSync(path.join(__dirname,'../migrations')).filter(f=>/^\d+.*\.sql$/.test(f)&&f<'034-').sort()){
   const sql=fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8');await pool.query(sql);await pool.query('INSERT INTO platform_migrations(version,checksum) VALUES($1,$2)',[file,crypto.createHash('sha256').update(sql).digest('hex')]);
  }
  const owner=await insert('legacy_owner'),otherOwner=await insert('legacy_other');
  await pool.query("INSERT INTO artist_subscriptions(artist_id,plan,amount_cents,payment_reference,status,starts_at,expires_at) VALUES($1,'starter',600,'expired-owner-fixture','paid',NOW()-INTERVAL '2 years',NOW()-INTERVAL '1 year')",[owner]);
  await pool.query('INSERT INTO generation_wallets(creator_id,credits) VALUES($1,8)',[owner]);
  assert.deepEqual(await migrate(pool),['034-owner-access-artist-launch.sql']);
  global.fetch=async(url,opt={})=>{
   storageCalls++;const u=new URL(url);assert(u.hostname.endsWith('.r2.cloudflarestorage.com'),'No real external calls are allowed');const k=decodeURIComponent(u.pathname.split('/').slice(2).join('/'));
   if(opt.method==='PUT'){let bytes;if(Buffer.isBuffer(opt.body))bytes=opt.body;else{const chunks=[];for await(const part of opt.body)chunks.push(Buffer.from(part));bytes=Buffer.concat(chunks);}objects.set(k,{bytes,mime:opt.headers['Content-Type']});return new Response('');}
   const object=objects.get(k);if(!object)return new Response('',{status:404});const range=opt.headers?.Range;let bytes=object.bytes;if(range){const m=range.match(/bytes=(\d+)-(\d+)/);bytes=bytes.subarray(Number(m[1]),Number(m[2])+1);}
   return new Response(opt.method==='HEAD'?null:bytes,{status:range?206:200,headers:{'Content-Type':object.mime,'Content-Length':String(opt.method==='HEAD'?object.bytes.length:bytes.length)}});
  };
  const env={NODE_ENV:'test',R2_ACCOUNT_ID:'a'.repeat(32),R2_ACCESS_KEY_ID:'local-fixture',R2_SECRET_ACCESS_KEY:'local-fixture',R2_BUCKET:'launch-fixture',STUDIO_RELEASE_WORKER_ENABLED:'false'};
  const app=await runtime({pool,env});
  const api=async(url,body,cookie,method)=>{const r=await app.request(url,{method:method||(body===undefined?'GET':'POST'),body,remoteAddress:'192.0.2.'+(1+crypto.randomInt(200)),headers:{...(cookie?{cookie}:{}),'idempotency-key':key(),...(Buffer.isBuffer(body)?{'content-type':'audio/mpeg','content-length':String(body.length)}:{})}});return {status:r.status,data:r.json(),cookie:[r.headers['set-cookie']||[]].flat().map(c=>c.split(';')[0]).join('; ')};};
  async function register(name){const r=await api('/api/register',{name,country:'Nigeria',email:name+'@launch.invalid',password,confirmPassword:password,plan:'starter'});assert.equal(r.status,201,JSON.stringify(r.data));return {id:r.data.user.id,cookie:r.cookie};}
  const ownerLogin=await api('/api/platform/account/login',{email:'legacy_owner@launch.invalid',password,role:'artist'});assert.equal(ownerLogin.status,200);const ownerCookie=ownerLogin.cookie;
  const sandbox={module:{exports:{}},console,process:{env:{MUSICAPI_API_KEY:'local_fixture_only'}},URL,AbortController,setTimeout,clearTimeout,require:createRequire(path.resolve('musicapi-sonic.js')),fetch:async(url,opt)=>{
   if(opt.method==='POST'){providerCalls++;if(['reject','uncertain'].includes(providerMode))return {ok:false,status:providerMode==='uncertain'?503:400,json:async()=>({error:'Fixture provider failure'}),headers:{get:()=>null}};return {ok:true,status:200,json:async()=>({task_id:'launch_music_task_'+(++serial)})};}
   const id=String(url).split('/').at(-1);return {ok:true,status:200,json:async()=>providerMode==='failed'?{status:'failed',data:[]}:{status:'succeeded',data:[0,1].map(i=>({clip_id:id+'_clip_'+i,title:'Free track '+i,audio_url:'https://fixture.invalid/'+id+'/'+i,state:'completed'}))}};
  }};vm.runInNewContext(fs.readFileSync('musicapi-sonic.js','utf8'),sandbox);
  async function sonic(id,request=key(),task){const input={title:'Launch original',lyrics:'Original gospel song words about gratitude and hope for this isolated test.',style:'Gospel acoustic guitar and warm percussion'};
   const req={method:task?'GET':'POST',url:task?'/api/music/sonic/status?id='+task:'/api/music/sonic/create',headers:{'idempotency-key':request},async *[Symbol.asyncIterator](){yield JSON.stringify(input);}},res={writeHead(s){this.status=s;},end(data){this.data=JSON.parse(data);}};
   await sandbox.module.exports(req,res,task?'/api/music/sonic/status':'/api/music/sonic/create',{me:async()=>({id}),pool,validOrigin:()=>true});return res;
  }
  await t.test('owner IDs are frozen once; expired membership does not lock owners or consume promotion slots',async()=>{
   assert.equal((await launch.state(pool,owner)).owner_unlimited,true);assert.equal((await launch.state(pool,otherOwner)).owner_unlimited,true);
   assert.equal((await require('../lib/artist-access').status(pool,owner,{LAE_ARTIST_STUDIO_TESTING:'1'})).active,true);
   assert.equal((await api('/api/artist/subscription',undefined,ownerCookie)).data.owner_unlimited,true);
   assert.equal((await api('/api/artist/studio-allowance',undefined,ownerCookie)).data.unlimited,true);
   assert.equal((await api('/api/generation/wallet',undefined,ownerCookie)).data.unlimited,true);
   assert.equal((await pool.query('SELECT allocated FROM artist_launch_campaign')).rows[0].allocated,0);
   assert.deepEqual(await migrate(pool),[]);
   await assert.rejects(pool.query('UPDATE artist_owner_access SET artist_id=artist_id'),/append-only/);
  });
  await accept(owner);
  await t.test('owners make more than the former daily cap without paid quota or wallet deductions',async()=>{
   for(let n=0;n<7;n++){const r=await sonic(owner);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal((await sonic(owner,key(),r.data.task_id)).data.songs.length,2);}
   assert.equal((await pool.query('SELECT COUNT(*)::int n FROM artist_studio_usage WHERE artist_id=$1',[owner])).rows[0].n,0);
   assert.equal((await pool.query('SELECT credits FROM generation_wallets WHERE creator_id=$1',[owner])).rows[0].credits,8);
   const credits=require('../lib/credits'),k=key(),reserved=await credits.reserveLyrics(pool,owner,k,{idea:'Owner lyrics'},{requireArtistPackage:true});
   await credits.refundLyrics(pool,owner,reserved.reference,k);assert.equal((await pool.query('SELECT credits FROM generation_wallets WHERE creator_id=$1',[owner])).rows[0].credits,8,'zero-cost owner refunds cannot mint wallet credits');
  });
  const input={title:'Original external owner song',genre:'Gospel Praise',audioMime:'audio/mpeg',audioBytes:audio.length,rightsConfirmed:true};
  await t.test('owner external recordings publish without codes, while copyright confirmation stays mandatory',async()=>{
   assert.equal((await api('/api/music/upload/start',{...input,rightsConfirmed:false},ownerCookie)).status,400);
   for(let n=0;n<8;n++){const start=await api('/api/music/upload/start',{...input,title:input.title+' '+n},ownerCookie);assert.equal(start.status,201,JSON.stringify(start.data));assert.equal((await api(start.data.audioUrl,audio,ownerCookie,'PUT')).status,200);const done=await api('/api/music/upload/finish',{id:start.data.id},ownerCookie);assert.equal(done.status,200,JSON.stringify(done.data));}
   assert.equal((await pool.query("SELECT COUNT(*)::int n FROM music_tracks WHERE creator_id=$1 AND status='published'",[owner])).rows[0].n,8);
  });
  const fresh=await register('first_artist');let task,permits;
  await t.test('new artist gets one music credit once and an unlocked dashboard, never owner/external privileges',async()=>{
   const s=await launch.state(pool,fresh.id);assert.equal(s.owner_unlimited,false);assert.equal(s.promotion,true);assert.equal(s.remaining_generations,1);
   assert.equal((await api('/api/artist/subscription',undefined,fresh.cookie)).data.artist_features_active,true);
   assert.equal((await api('/api/platform/artist-overview',undefined,fresh.cookie)).status,200);
   assert.equal((await api('/api/music/sonic/create',{},fresh.cookie)).status,428,'existing creator consent remains required');await accept(fresh.id);
   assert.equal((await api('/api/music/upload/start',{...input,owner_unlimited:true,external_uploads_allowed:true},fresh.cookie)).status,403);
   await migrate(pool);assert.equal((await launch.state(pool,fresh.id)).owner_unlimited,false);
   assert.equal((await pool.query('SELECT COUNT(*)::int n FROM artist_launch_grants WHERE artist_id=$1',[fresh.id])).rows[0].n,1);
   const before=(await pool.query('SELECT allocated FROM artist_launch_campaign')).rows[0].allocated;
   assert.equal((await api('/api/register',{name:'Duplicate',country:'Nigeria',email:'first_artist@launch.invalid',password,confirmPassword:password,plan:'starter'})).status,409);
   assert.equal((await pool.query('SELECT allocated FROM artist_launch_campaign')).rows[0].allocated,before);
  });
  await t.test('one companion lyrics draft is available without spending the music credit',async()=>{
   const credits=require('../lib/credits'),k=key(),r=await credits.reserveLyrics(pool,fresh.id,k,{idea:'Free original song'},{requireArtistPackage:true});
   await credits.completeLyrics(pool,fresh.id,r.reference,k,{title:'Free original song',lyrics:'Original fixture lyrics of gratitude.',style:'Acoustic gospel guitar'},'gpt-6.1-sol');
   assert.equal((await pool.query('SELECT credits FROM generation_wallets WHERE creator_id=$1',[fresh.id])).rows[0].credits,0);
   assert.equal((await launch.state(pool,fresh.id)).remaining_generations,1);
   await assert.rejects(credits.reserveLyrics(pool,fresh.id,key(),{idea:'Another free lyrics request'},{requireArtistPackage:true}),e=>e.status===402);
  });
  await t.test('definite provider rejection restores the single credit; duplicate keys and parallel requests cannot spend it twice',async()=>{
   providerMode='reject';assert.equal((await sonic(fresh.id)).status,502);assert.equal((await launch.state(pool,fresh.id)).remaining_generations,1);providerMode='success';
   const k=key(),before=providerCalls,r=await sonic(fresh.id,k);assert.equal(r.status,200,JSON.stringify(r.data));task=r.data.task_id;
   assert.equal((await sonic(fresh.id,k)).data.task_id,task);assert.equal(providerCalls,before+1);
   assert.equal((await sonic(fresh.id)).status,429);assert.equal((await sonic(fresh.id,key(),task)).data.songs.length,2);
   const count=providerCalls;assert.equal((await sonic(fresh.id)).status,402);assert.equal(providerCalls,count);assert.equal((await launch.state(pool,fresh.id)).remaining_generations,0);
  });
  const provider={clips:async()=>[0,1,2].map(i=>({clip_id:task+'_clip_'+i,title:'Free track '+i,audio_url:'https://fixture.invalid/'+i}))};
  await t.test('one generation issues two individual codes, and both tracks publish after the music credit is used',async()=>{
   permits=await Promise.all([0,1].map(i=>codes.issue({pool,provider,artistId:fresh.id,taskId:task,clipId:task+'_clip_'+i,download:async()=>({bytes:audio})})));
   assert.notEqual(permits[0].uploadCode,permits[1].uploadCode);assert.notEqual(permits[0].generation_id,permits[1].generation_id);
   const start=await api('/api/music/upload/start',{...input,title:'Free track 0',uploadCode:permits[0].uploadCode},fresh.cookie);assert.equal(start.status,201,JSON.stringify(start.data));
   assert.equal((await api(start.data.audioUrl,Buffer.alloc(audio.length,9),fresh.cookie,'PUT')).status,400,'generation checksum cannot be bypassed');
   assert.equal((await api(start.data.audioUrl,audio,fresh.cookie,'PUT')).status,200);assert.equal((await api('/api/music/upload/finish',{id:start.data.id},fresh.cookie)).status,200);
   const releases=require('../lib/studio-releases').createStudioReleases({pool,env:{GENERATED_MEDIA_ALLOWED_HOSTS:'fixture.invalid'},provider:{...provider,configured:()=>true},store:{configured:()=>true,put:async()=>{}},download:async()=>({bytes:audio,mime:'audio/mpeg',extension:'mp3'})});
   const draft=await releases.create(fresh.id,key(),{task_id:task,clip_id:task+'_clip_1',title:'Free track 1',genre:'Gospel',rightsConfirmed:true});await releases.processNext();
   const published=await releases.publish(fresh.id,draft.id,key(),true);assert(published.track_id);
   assert.equal((await pool.query("SELECT COUNT(*)::int n FROM music_tracks WHERE creator_id=$1 AND status='published'",[fresh.id])).rows[0].n,2);
   assert.equal((await api('/api/generation/code/check',{code:permits[1].uploadCode},fresh.cookie)).data.published,true);
   const third=await codes.issue({pool,provider,artistId:fresh.id,taskId:task,clipId:task+'_clip_2',download:async()=>({bytes:audio})});
   assert.equal((await api('/api/music/upload/start',{...input,title:'Free track 2',uploadCode:third.uploadCode},fresh.cookie)).status,403,'a third free track is not granted');
  });
  await t.test('concurrent generation requests reserve the single promotional credit once',async()=>{
   const who=await register('parallel_generation'),before=providerCalls;
   const results=await Promise.all(Array.from({length:6},()=>sonic(who.id)));
   assert.equal(results.filter(r=>r.status===200).length,1);assert(results.every(r=>[200,429].includes(r.status)));assert.equal(providerCalls,before+1);
   const accepted=results.find(r=>r.status===200);providerMode='failed';assert.equal((await sonic(who.id,key(),accepted.data.task_id)).data.status,'failed');
   assert.equal((await launch.state(pool,who.id)).remaining_generations,1,'confirmed no-output failure restores the same credit');
   providerMode='success';const retry=await sonic(who.id);assert.equal(retry.status,200);await sonic(who.id,key(),retry.data.task_id);assert.equal((await sonic(who.id)).status,402);
  });
  await t.test('uncertain provider acceptance keeps the credit reserved instead of issuing duplicate free requests',async()=>{
   const who=await register('uncertain_generation');providerMode='uncertain';const r=await sonic(who.id);assert.equal(r.status,503);assert.equal(r.data.status,'verification_required');
   const before=providerCalls;assert.equal((await launch.state(pool,who.id)).remaining_generations,0);assert.equal((await sonic(who.id)).status,429);assert.equal(providerCalls,before);providerMode='success';
  });
  await t.test('an existing listener adding the artist role receives one promotion without becoming an owner',async()=>{
   const listener=await api('/api/listener/register',{name:'Listener adds artist',email:'linked@launch.invalid',password,confirmPassword:password});assert.equal(listener.status,201);
   const linked=await api('/api/platform/account/roles?role=listener',{currentPassword:password,confirm:true,country:'Nigeria'},listener.cookie);assert.equal(linked.status,200,JSON.stringify(linked.data));
   const session=(await api('/api/platform/session',undefined,linked.cookie)).data;assert(session.artist);assert.equal(session.artist.owner_unlimited,false);assert.equal(session.artist.promotion,true);
   const before=(await pool.query('SELECT allocated FROM artist_launch_campaign')).rows[0].allocated;
   assert.equal((await api('/api/platform/account/roles?role=listener',{currentPassword:password,confirm:true,country:'Nigeria'},linked.cookie)).status,200);
   assert.equal((await pool.query('SELECT allocated FROM artist_launch_campaign')).rows[0].allocated,before);
  });
  await t.test('registration rollback restores the allocation and concurrent new accounts stop exactly at 200',async()=>{
   const before=(await pool.query('SELECT allocated FROM artist_launch_campaign')).rows[0].allocated;
   await assert.rejects(transaction(pool,async db=>{await db.query("INSERT INTO creators(display_name,email,password_salt,password_hash) VALUES('Rolled back','rollback@launch.invalid','salt','hash')");throw Error('rollback-fixture');}),/rollback-fixture/);
   assert.equal((await pool.query('SELECT allocated FROM artist_launch_campaign')).rows[0].allocated,before);
   const ids=await Promise.all(Array.from({length:230},(_,i)=>insert('race_'+i)));
   const stats=(await pool.query('SELECT allocated,(SELECT COUNT(*)::int FROM artist_launch_grants) AS grants,(SELECT COUNT(DISTINCT slot)::int FROM artist_launch_grants) AS slots,(SELECT MAX(slot) FROM artist_launch_grants) AS maximum FROM artist_launch_campaign')).rows[0];assert.deepEqual(stats,{allocated:200,grants:200,slots:200,maximum:200});
   assert.equal((await pool.query('SELECT COUNT(*)::int n FROM artist_owner_access')).rows[0].n,2);assert.equal(await launch.open(pool),false);
   const last=await register('after_promotion');assert.equal((await launch.state(pool,last.id)).promotion,false);assert.equal((await api('/api/artist/studio-allowance',undefined,last.cookie)).data.active,false);assert.equal((await api('/api/music/sonic/create',{},last.cookie)).status,402);
  });
  await t.test('buying a plan after the promotion preserves its full paid track allowance',async()=>{
   const sub=(await pool.query("INSERT INTO artist_subscriptions(artist_id,plan,amount_cents,payment_reference,status,starts_at,expires_at,included_generations,publish_track_limit) VALUES($1,'starter',600,'after-promotion-package','paid',NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 year',3,6) RETURNING id",[fresh.id])).rows[0];
   const view=await require('../lib/subscription-view').subscriptionView(pool,fresh.id,'starter',{});assert.equal(view.upload_limit,6);assert.equal(view.uploads_used,0,'the two free tracks do not consume paid track slots');
   for(let n=0;n<6;n++){await codes.requirePlan(pool,fresh.id);await pool.query("INSERT INTO music_tracks(creator_id,title,genre,audio_key,audio_mime,audio_bytes) VALUES($1,$2,'Gospel',$3,'audio/mpeg',2048)",[fresh.id,'Paid slot '+n,'fixture/paid-'+n+'.mp3']);}
   await assert.rejects(codes.requirePlan(pool,fresh.id),e=>e.status===409);
   assert.equal(Number((await pool.query('SELECT included_generations FROM artist_subscriptions WHERE id=$1',[sub.id])).rows[0].included_generations),3);
  });
  await t.test('normal paid packages keep their approved prices and generation quotas',async()=>{
   assert.deepEqual(Object.values(require('../lib/publishing-policy').packages()).map(p=>[p.usd,p.studioGenerations,p.uploads]),[[6,3,6],[10,6,12],[20,15,30]]);
   for(const [plan,limit]of [['starter',3],['growth',6],['professional',15]]){
    const id=await insert('paid_'+plan);await accept(id);await pool.query("INSERT INTO artist_subscriptions(artist_id,plan,amount_cents,payment_reference,status,starts_at,expires_at,included_generations,publish_track_limit) VALUES($1,$2,$3,$4,'paid',NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 year',$5,$6)",[id,plan,require('../lib/plans')[plan].usd*100,'paid-launch-'+id,limit,limit*2]);
    for(let n=0;n<limit;n++){const r=await sonic(id);assert.equal(r.status,200,JSON.stringify(r.data));await pool.query("UPDATE sonic_test_tasks SET status='succeeded',created_at=NOW()-INTERVAL '2 days' WHERE task_id=$1",[r.data.task_id]);}
    const calls=providerCalls;assert.equal((await sonic(id)).status,402);assert.equal(providerCalls,calls);
   }
   assert.equal((await pool.query('SELECT COUNT(*)::int n FROM commerce_receipts')).rows[0].n,0,'complimentary access creates no invented payments or commissions');
  });
 }finally{global.fetch=originalFetch;await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
