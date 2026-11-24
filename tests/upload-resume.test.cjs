'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{reserve,sameAudioFormat}=require('../lib/upload-resume');
function fixture(overrides={}){
 const track={id:12,status:'pending_upload',audio_mime:'audio/mpeg',audio_bytes:2048,audio_key:'music/7/original.mp3',cover_mime:'image/png',cover_key:'covers/7/original.png',...overrides},calls=[];
 const db={async query(sql,args=[]){calls.push({sql,args});const row=x=>({rowCount:1,rows:[x]});
  if(sql==='SELECT * FROM external_upload_codes WHERE artist_id=$1 AND track_id=$2')return {rowCount:0,rows:[]};
  if(sql.startsWith('SELECT id,title,used_at'))return row({id:19,title:'Original Studio song',used_at:'2026-11-01',generated_track_id:12});
  if(sql.startsWith('SELECT r.result'))return row({result:{generation_id:'19',task_id:'task_resume_fixture',clip_id:'clip_resume_fixture',audio_sha256:'a'.repeat(64)}});
  if(sql.startsWith('SELECT task_id FROM sonic_test_tasks'))return row({task_id:'task_resume_fixture'});
  if(sql.startsWith('SELECT id,status,audio_mime'))return row({...track});
  if(sql.startsWith('SELECT 1 FROM artist_owner_access'))return row({id:7});
  if(sql.startsWith('UPDATE music_tracks')){assert.deepEqual(args.slice(0,2),[12,7]);track.cover_mime=args[4];track.cover_key=args[5];track.audio_mime=args[6];track.audio_bytes=args[7];track.audio_key=args[8];return row({id:12});}
  throw Error('Unexpected resume query: '+sql);
 }};
 const data={codeHash:'b'.repeat(64),title:'Original Studio song',genre:'Gospel',description:'Updated description',audioMime:'audio/mpeg',audioBytes:2048,audioKey:'music/7/unused-new.mp3',coverMime:'image/jpeg',coverKey:'covers/7/new.jpg'};
 return {track,calls,db,data};
}
test('resuming a pending song can replace PNG artwork with JPEG without a new draft or code',async()=>{const f=fixture(),r=await reserve(f.db,7,f.data);assert.deepEqual(r,{id:12,resumed:true});assert.equal(f.track.cover_mime,'image/jpeg');assert.equal(f.track.cover_key,'covers/7/new.jpg');assert.equal(f.track.audio_bytes,2048);assert(!f.calls.some(x=>/INSERT|UPDATE generation_records|generation_wallet/.test(x.sql)));});
test('same-format artwork keeps its saved key',async()=>{const f=fixture();await reserve(f.db,7,{...f.data,coverMime:'image/png',coverKey:'covers/7/unneeded.png'});assert.equal(f.track.cover_key,'covers/7/original.png');});
test('optional artwork can be removed and later added to the same pending song',async()=>{const f=fixture();await reserve(f.db,7,{...f.data,coverMime:'',coverKey:null});assert.equal(f.track.cover_key,null);assert.equal(f.track.cover_mime,null);await reserve(f.db,7,f.data);assert.equal(f.track.cover_key,f.data.coverKey);assert.equal(f.track.id,12);});
test('a missing pending artwork target can be safely repaired',async()=>{const f=fixture({cover_key:null});await reserve(f.db,7,{...f.data,coverMime:'image/png',coverKey:'covers/7/recovered.png'});assert.equal(f.track.cover_key,'covers/7/recovered.png');});
test('M4A browser MIME aliases describe the same container; unrelated formats never match',()=>{assert(sameAudioFormat('audio/mp4','audio/x-m4a'));assert(sameAudioFormat('audio/x-m4a','audio/mp4'));assert(sameAudioFormat('audio/mpeg','audio/mpeg'));for(const [a,b]of [['audio/mpeg','audio/mp4'],['text/html','text/html'],['audio/x-m4a','audio/mpeg']])assert.equal(sameAudioFormat(a,b),false);});
test('M4A alias changes can resume the original draft',async()=>{const f=fixture({audio_mime:'audio/mp4'});assert.equal((await reserve(f.db,7,{...f.data,audioMime:'audio/x-m4a'})).id,12);assert.equal(f.track.audio_mime,'audio/mp4');});
for(const update of [{audioBytes:2049},{audioMime:'audio/mp4'}])test('a failed first declaration can be corrected with an isolated audio key: '+JSON.stringify(update),async()=>{const f=fixture();assert.equal((await reserve(f.db,7,{...f.data,...update})).id,12);assert.equal(f.track.audio_key,f.data.audioKey);assert.equal(f.track.audio_bytes,update.audioBytes||2048);assert.equal(f.track.audio_mime,update.audioMime||'audio/mpeg');assert(!f.calls.some(x=>/UPDATE generation_records|INSERT|generation_wallet/.test(x.sql)));});
test('correct title is still required when repairing a draft',async()=>{const f=fixture(),before={...f.track};await assert.rejects(reserve(f.db,7,{...f.data,title:'Different song'}),e=>e.status===400);assert.deepEqual(f.track,before);assert(!f.calls.some(x=>x.sql.startsWith('UPDATE')));});
for(const status of ['published','removed'])test('one-use publishing protection remains enforced for '+status,async()=>{const f=fixture({status});await assert.rejects(reserve(f.db,7,f.data),e=>e.status===409);assert(!f.calls.some(x=>x.sql.startsWith('UPDATE')));});
