'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const launch=require('../lib/studio-launch'),dna=require('../lib/music-dna'),codes=require('../lib/music-upload-codes');
const {MockPool}=require('./mock-db.cjs');
const key='phase-one-test-request-12345';
const own={creationMode:'own',title:'Original prayer',lyrics:'These are my original words of faith and hope today.',style:'Warm acoustic guitar with a gentle gospel rhythm',rightsConfirmed:true,musicDnaMood:'smooth',voice:'female',musicDnaLanguages:['en','yo'],duration:180};
function codeFixture(){
 const pool=new MockPool(),original=pool.query.bind(pool),audio=Buffer.from('ID3original generated music'),song={clip_id:'clip_test_123456',title:'Original prayer',audio_url:'https://files.musicapi.ai/test.mp3'};
 let completed=true,clips=0,downloads=0,records=0;
 pool.query=async(sql,args=[])=>{
  const row=result=>({rowCount:1,rows:[result]}),none=()=>({rowCount:0,rows:[]});
  if(sql.startsWith('SELECT result FROM platform_requests')){
   const items=Object.entries(pool.state.requests).filter(([id])=>id.startsWith(args[0]+':')).map(([,r])=>r);
   const item=sql.includes("result->>")?items.find(r=>r.result.generation_id===String(args[1])):pool.state.requests[args[0]+':'+args[1]];return item?row(item):none();
  }
  if(sql.startsWith('SELECT id FROM studio_releases')||sql.startsWith('SELECT g.id FROM platform_requests'))return none();
  if(sql.startsWith('SELECT task_id FROM sonic_test_tasks'))return completed&&args[1]===7?row({task_id:args[0]}):none();
  if(sql.startsWith('INSERT INTO generation_records'))records++;
  if(sql.startsWith('SELECT id FROM generation_records'))return row({id:1});
  return original(sql,args);
 };
 const options={pool,artistId:7,taskId:'task_test_123456',clipId:song.clip_id,provider:{clips:async()=>{clips++;return [song];}},download:async()=>{downloads++;return {bytes:audio};}};
 return {pool,audio,options,setCompleted:value=>completed=value,counts:()=>({clips,downloads,records})};
}
test('launch catalogue exposes exactly Gospel G1–G14 / 70 styles while all 215 profiles remain intact',()=>{
 const c=launch.catalogue(),all=dna.catalogue();assert.equal(all.styles.length,215);assert.equal(all.categories.length,43);
 assert.deepEqual(c.departments.map(d=>d.id),['gospel']);assert.equal(c.categories.length,14);assert.equal(c.styles.length,70);
 for(let n=1;n<=14;n++)assert.equal(c.styles.filter(s=>s.id.startsWith('G'+n+'-')).length,5);
 assert.equal(c.moods.length,4);assert.deepEqual(c.voices,all.voices);assert.deepEqual(c.languages,all.languages);
 assert(!JSON.stringify(c).includes('Western & International'));assert(!JSON.stringify(c).includes('R7-01'));
 assert.equal(launch.legacyCatalogue().secular.length,0);
});
test('archived style IDs cannot bypass the launch gate',()=>{
 for(const s of dna.catalogue().styles)if(s.department_id==='gospel')assert.doesNotThrow(()=>launch.assertStyle(s.id));else assert.throws(()=>launch.assertStyle(s.id),e=>e.status===400);
});
test('own-lyrics adapter compiles all 70 Gospel styles × four moods within the existing music-provider limit',()=>{
 for(const s of launch.catalogue().styles)for(const m of launch.catalogue().moods){const text=launch.ownLyricsStyle({...own,musicDnaStyle:s.id,musicDnaMood:m.id},7,key);assert(text.length<=1000);assert(text.includes(s.name));assert(text.includes(m.name));assert(text.includes('Voice: female'));assert(text.includes('Yoruba'));assert(/\d+ BPM/.test(text));}
 assert.throws(()=>launch.ownLyricsStyle({...own,musicDnaStyle:'S1-01'},7,key),e=>e.status===400);
});
test('custom styles preserve the customer instructions, language, voice and all four moods without calling a lyrics provider',()=>{
 for(const m of launch.catalogue().moods){const out=launch.ownLyricsStyle({...own,musicDnaMood:m.id},7,key);assert(out.startsWith(own.style));assert(out.includes(m.description));assert(out.includes('female'));assert(out.includes('Yoruba'));}
 for(const input of [{rightsConfirmed:false},{musicDnaMood:'bad'},{voice:'unverified'},{musicDnaLanguages:['invented']},{style:''}])assert.throws(()=>launch.ownLyricsStyle({...own,...input},7,key),e=>e.status===400);
});
test('actual Sonic handler uses own lyrics with a Gospel DNA style and spends only the existing single music reservation',async()=>{
 const {sonicFlow}=require('./music-dna-audit-support.cjs');
 for(const extra of [{musicDnaStyle:'G1-01'},{musicDnaStyle:''}]){
  const r=await sonicFlow({...own,...extra});assert.equal(r.status,200);assert.equal(r.sent.prompt,own.lyrics);assert(r.sent.tags.includes('Smooth & Groovy'));assert.equal(r.sent.mv,'sonic-v6');assert.equal(r.calls.filter(c=>c.sql.startsWith('INSERT INTO artist_studio_usage')).length,1);assert(!r.calls.some(c=>c.sql.includes('generation_wallets')));
 }
});
test('lyrics completion preserves credits/history but no longer grants a publishing code',async()=>{
 const pool=new MockPool(),credits=require('../lib/credits'),reserved=await credits.reserveLyrics(pool,7,key,{idea:'Original prayer'});
 const result=await credits.completeLyrics(pool,7,reserved.reference,key,{title:'Original',lyrics:own.lyrics,style:own.style},'gpt-6.1-sol');
 assert.equal(result.uploadCode,null);assert.equal(pool.state.records.length,1);assert.equal(pool.state.wallets[7],3);assert.equal((await credits.reserveLyrics(pool,7,key,{idea:'Original prayer'})).replay.uploadCode,null);
});
test('upload codes require a completed owned task and provider-confirmed clip; failures issue nothing',async()=>{
 for(const change of ['failed','foreign','clip']){const f=codeFixture();if(change==='failed')f.setCompleted(false);if(change==='foreign')f.options.artistId=8;if(change==='clip')f.options.clipId='other_clip_1234';await assert.rejects(codes.issue(f.options),e=>[403,409].includes(e.status));assert.equal(f.pool.state.records.length,0);}
});
test('parallel song-code requests converge on one durable, secure authorization and exact replay',async()=>{
 const f=codeFixture(),[a,b]=await Promise.all([codes.issue(f.options),codes.issue(f.options)]);assert.deepEqual(a,b);assert.match(a.uploadCode,/^[A-F0-9]{36}$/);assert.equal(f.pool.state.records.length,1);assert.equal(f.pool.state.records[0][1],crypto.createHash('sha256').update(a.uploadCode).digest('hex'));assert.equal(a.audio_sha256,crypto.createHash('sha256').update(f.audio).digest('hex'));
 const previous=f.counts();assert.deepEqual(await codes.issue(f.options),a);assert.deepEqual(f.counts(),previous);
 await assert.rejects(codes.authorization(f.pool,8,a.generation_id),e=>e.status===403);
 await assert.rejects(codes.authorization(f.pool,7,'99999'),e=>e.status===403);
});
test('uploaded audio must match the exact generated recording authorized by the code',async()=>{
 const f=codeFixture();await codes.issue(f.options);const params={pool:f.pool,artistId:7,trackId:2,url:'https://storage.invalid/owned.mp3'};
 await codes.verifyUploaded({...params,fetcher:async()=>new Response(f.audio)});
 await assert.rejects(codes.verifyUploaded({...params,fetcher:async()=>new Response('ID3different song')}),e=>e.status===400);
});
test('artist plan and annual quotas apply even when a generated-song code exists',async()=>{
 let active=false,count=0;
 const db={query:async(sql)=>{if(sql.includes('artist_subscriptions'))return {rowCount:active?1:0,rows:active?[{id:3,plan:'starter',starts_at:new Date()}]:[]};if(sql.includes('COUNT(*)'))return {rows:[{n:count}]};throw Error(sql);}};
 await assert.rejects(codes.requirePlan(db,7),e=>e.status===403);active=true;await codes.requirePlan(db,7);count=require('../lib/plans').starter.uploads;await assert.rejects(codes.requirePlan(db,7),e=>e.status===409);
});
test('actual lyrics route rejects hidden departments before reserving or calling the provider',async()=>{
 const r=await require('./lyrics-handler-fixture.cjs').handler({engine:dna,launchPolicy:true,payload:{musicDnaStyle:'S1-01',idea:'An original song about hope'},response:{}});
 assert.equal(r.result.status,400);assert.equal(r.counts.reserve,0);assert.equal(r.counts.post,0);
});
test('actual music route rejects missing own-lyrics consent and archived styles before any reservation',async()=>{
 const {sonicFlow}=require('./music-dna-audit-support.cjs');
 for(const change of [{rightsConfirmed:false},{musicDnaStyle:'W1-01'}]){const r=await sonicFlow({...own,...change});assert.equal(r.status,400);assert(!r.sent);assert(!r.calls.some(c=>c.sql.startsWith('INSERT INTO artist_studio_usage')));}
});
test('generated audio is fingerprinted before storage PUT, preventing a concurrent replacement with different bytes',async()=>{
 const f=codeFixture();await codes.issue(f.options);const {Readable}=require('node:stream');const args={pool:f.pool,artistId:7,trackId:2,length:f.audio.length};
 const good=await codes.verifiedUploadBody({...args,input:Readable.from([f.audio])});assert(good.equals(f.audio));
 const wrong=Buffer.alloc(f.audio.length,7);await assert.rejects(codes.verifiedUploadBody({...args,input:Readable.from([wrong])}),e=>e.status===400);
 await assert.rejects(codes.verifiedUploadBody({...args,input:Readable.from([f.audio.subarray(0,5)])}),e=>e.status===400);
 await assert.rejects(codes.verifiedUploadBody({...args,input:Readable.from([Buffer.concat([f.audio,Buffer.from('extra')])])}),e=>e.status===413);
});
