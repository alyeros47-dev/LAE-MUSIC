'use strict';
// One owner-authorized test. Production SQL is read-only; all app writes use a
// disposable loopback schema. One new private R2 sample may be written; no deletion.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Readable}=require('node:stream');
const budget=require('../lib/voice-acceptance-budget'),ROOT=path.resolve('voice-acceptance-results');
let journalSecret;
function save(name,value){fs.mkdirSync(ROOT,{recursive:true,mode:0o700});if(name==='journal.json'){value=budget.seal(value,journalSecret);name='journal.encrypted.json';}fs.writeFileSync(path.join(ROOT,name),JSON.stringify(value,null,2),{mode:0o600});}
async function localPool(run){
 const target=require('../tests/ci-database.cjs').ciDatabase(),{Pool}=require('pg'),control=new Pool({connectionString:target.href,ssl:false}),schema='voice_acceptance_'+run;
 if(!/^voice_acceptance_[0-9]{6,20}$/.test(schema))throw Error('Invalid disposable voice schema.');
 await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,ssl:false,options:'-c search_path='+schema});
 try{await require('../tests/legacy-bootstrap.cjs').bootstrap(pool);await require('../lib/migrations').migrate(pool);
  await pool.query("INSERT INTO creators(id,display_name,email,password_salt,password_hash,plan,country) VALUES(3,'Isolated owned voice test','owned-voice@acceptance.invalid','fixture-salt','fixture-hash','starter','Nigeria')");
  await pool.query("INSERT INTO artist_subscriptions(artist_id,plan,amount_cents,payment_reference,status,starts_at,expires_at) VALUES(3,'starter',600,$1,'paid',NOW()-INTERVAL '1 hour',NOW()+INTERVAL '1 day')",['synthetic-voice-test-'+run]);
 }catch(e){await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();throw e;}
 return {pool,async close(){await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}};
}
async function main(){
 const manifest=budget.identity();
 if(process.argv.includes('--claim')){save('claim.json',await budget.claimCheck(process.env));console.log('One-use 25-credit maximum claim prepared. No MusicAPI request submitted.');return;}
 if(process.argv.includes('--local-preflight')){const local=await localPool(manifest.run);await local.close();console.log('Disposable schema and synthetic test entitlement verified; no provider calls.');return;}
 await budget.claimCheck(process.env,fetch,true);
 if(JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT,'claim.json'),'utf8')))!==JSON.stringify(manifest))throw Error('Voice claim does not match the execution.');
 const nativeFetch=fetch,source=await require('./inspect-owned-voice.cjs').inspect();
 if(source.report.account_id!==manifest.account_id||source.report.source_sha256!==manifest.source_sha256)throw Error('The authorized account or recording changed. No provider request submitted.');
 journalSecret=source.env.MUSICAPI_API_KEY;
 const journal={...manifest,status:'prepared',source:source.report,operations:[],production_database_writes:0,customer_credits_consumed:0,voice_requests:0,music_requests:0,storage_puts:0,reserved_provider_credits:0};
 save('journal.json',journal);
 let local,browser,server;
 const guard=budget.guard(nativeFetch,{storageHost:source.store.account+'.r2.cloudflarestorage.com',record:entry=>{journal.operations.push(entry);Object.assign(journal,guard.counts());save('journal.json',journal);}});
 async function balance(){const r=await nativeFetch('https://api.musicapi.ai/api/v1/get-credits',{method:'GET',headers:{Authorization:'Bearer '+source.env.MUSICAPI_API_KEY},redirect:'error',signal:AbortSignal.timeout(20000)});const j=await r.json(),d=j.data||j;if(!r.ok||!Number.isFinite(d.credits))throw Error('Provider balance could not be checked.');return {credits:d.credits,extra_credits:Number(d.extra_credits)||0};}
 try{
  journal.balance_before=await balance();save('journal.json',journal);if(journal.balance_before.credits+journal.balance_before.extra_credits<25)throw Error('Insufficient provider credits; no training submitted.');
  local=await localPool(manifest.run);
  process.env.MUSICAPI_API_KEY=source.env.MUSICAPI_API_KEY;
  global.fetch=guard.fetch;
  const ctx={pool:local.pool,me:async()=>({id:3}),validOrigin:()=>true,storage:()=>source.store,presign:async(store,key,action,expires)=>{
   if(action==='put'&&key===source.row.object_key)throw Error('Replacing the original recording is forbidden.');
   const url=source.presign(store,key,action,expires);if(action==='put')guard.allowUpload(url);if(action==='get')guard.allowRead(url);return url;
  },headObject:async(store,key)=>{const r=await fetch(source.presign(store,key,'head',900),{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Voice test upload could not be verified.');return {ContentLength:Number(r.headers.get('content-length')),ContentType:r.headers.get('content-type')};}};
  async function request(handler,url,method='GET',data,headers={}){const req=Readable.from(data===undefined?[]:[Buffer.isBuffer(data)?data:Buffer.from(JSON.stringify(data))]);req.url=url;req.method=method;req.headers=headers;const res={writeHead(status){this.status=status;},end(data){this.data=JSON.parse(data);}};if(!await handler(req,res,new URL(url,'https://lae.test').pathname,ctx))throw Error('Unexpected voice test route.');return res;}
  const voice=require('../artist-voice'),music=require('../musicapi-sonic');
  const prepared=await request(voice,'/api/voice/upload','POST',{type:'audio/wav',bytes:source.bytes.length,consent:true});if(prepared.status!==200)throw Error('Owned voice upload preparation failed.');
  const uploaded=await request(voice,prepared.data.url,'PUT',source.bytes,{'content-type':'audio/wav'});if(uploaded.status!==200)throw Error('Real voice upload failed before training.');
  const sample=(await local.pool.query('SELECT object_key FROM artist_voice_profiles WHERE creator_id=3')).rows[0];journal.test_object_key=sample.object_key;journal.original_object_retained=true;save('journal.json',journal);
  const trained=await request(voice,'/api/voice/train','POST',{});
  let profile=(await local.pool.query('SELECT task_id,persona_id,status FROM artist_voice_profiles WHERE creator_id=3')).rows[0];journal.voice_task_id=profile.task_id;save('journal.json',journal);
  if(trained.status!==200||profile.task_id.startsWith('voice-'))throw Error('Voice acceptance was rejected or uncertain. Do not retry this budget.');
  for(let n=0;n<48;n++){
   const r=await request(voice,'/api/voice/status');if(r.status===200&&r.data.status==='ready')break;
   if(r.data?.status==='failed'){
    journal.voice_failure=r.data.failure;
    const raw=await nativeFetch('https://api.musicapi.ai/api/v1/sonic/task/'+encodeURIComponent(profile.task_id),{method:'GET',headers:{Authorization:'Bearer '+source.env.MUSICAPI_API_KEY},redirect:'error',signal:AbortSignal.timeout(20000)});
    journal.provider_failure=require('./inspect-voice-profile.cjs').summary(await raw.json(),Object.values(source.env));save('journal.json',journal);throw Error('Provider rejected the owned recording. Music generation was not submitted.');
   }
   await new Promise(resolve=>setTimeout(resolve,15000));
  }
  profile=(await local.pool.query('SELECT task_id,persona_id,status FROM artist_voice_profiles WHERE creator_id=3')).rows[0];if(profile.status!=='ready'||!profile.persona_id)throw Error('Voice training is still unresolved. Keep its task; do not regenerate.');
  journal.persona_id=profile.persona_id;journal.profile_ready=true;guard.allowPersona(profile.persona_id);save('journal.json',journal);
  const song={title:'A Gentle Light of Grace',creationMode:'own',rightsConfirmed:true,useVoice:true,duration:60,lyrics:'[Verse]\nGod guide my hands in kindness today\nLet patient love be the words I say\nWith grateful heart I begin anew\nIn every small task I will walk with You\n[Chorus]\nLet Your gentle light shine through me\nLet my song bring hope and peace\nWith a thankful heart I praise You\nMay Your kindness never cease\n[Outro]\nIn Your love I rest today',style:'Original gentle Gospel song, warm acoustic piano, restrained bass and brushed percussion. Natural solo lead singing in the selected personal voice; clear words, no crowd vocals or vocal effects. Short introduction and complete resolved ending.'};
  const headers={'idempotency-key':'owned-voice-acceptance-'+manifest.run};
  const created=await request(music,'/api/music/sonic/create','POST',song,headers);journal.music_task_id=created.data.task_id||null;save('journal.json',journal);if(created.status!==200||!journal.music_task_id)throw Error('Personal-voice music acceptance was not confirmed. Do not resubmit.');
  const replay=await request(music,'/api/music/sonic/create','POST',song,headers);if(replay.data.task_id!==journal.music_task_id||guard.counts().music_requests!==1)throw Error('Music idempotency failed.');
  let output;
  for(let n=0;n<40;n++){const r=await request(music,'/api/music/sonic/status?id='+encodeURIComponent(journal.music_task_id));if(r.data?.status==='succeeded'){output=r.data;break;}if(['failed','verification_required'].includes(r.data?.status))throw Error('Personal-voice generation failed or needs reconciliation.');await new Promise(resolve=>setTimeout(resolve,15000));}
  if(output?.songs?.length!==2)throw Error('Two completed personal-voice tracks were not confirmed.');
  const download=require('../lib/media-download').createMediaDownloader({hosts:require('../lib/studio-output').mediaHosts(source.env),fetcher:guard.fetch}),tracks=[];
  const temp=fs.mkdtempSync('/tmp/lae-owned-voice-');
  try{for(const song of output.songs){const audio=await download(song.audio_url,'audio'),file=path.join(temp,tracks.length+'.'+audio.extension);fs.writeFileSync(file,audio.bytes,{mode:0o600});const cp=require('node:child_process');const probed=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8',timeout:30000}));cp.execFileSync('ffmpeg',['-nostdin','-v','error','-i',file,'-f','null','-'],{stdio:'pipe',timeout:45000});const duration=Number(probed.format?.duration);if(!Number.isFinite(duration)||duration<10||!probed.streams.some(s=>s.codec_type==='audio'))throw Error('Real generated audio did not decode.');tracks.push({bytes:audio.bytes,mime:audio.mime});(journal.tracks??=[]).push({clip_id:song.clip_id,duration_seconds:duration,audio_bytes:audio.bytes.length,decoded:true});save('journal.json',journal);}}finally{fs.rmSync(temp,{recursive:true,force:true});}
  server=require('node:http').createServer((req,res)=>{const track=tracks[Number(req.url.slice(1))];if(!track){res.writeHead(404);res.end();return;}const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);const a=range?Number(range[1]):0,b=range&&range[2]?Math.min(Number(range[2]),track.bytes.length-1):track.bytes.length-1;res.writeHead(range?206:200,{'Content-Type':track.mime,'Accept-Ranges':'bytes','Content-Length':b-a+1,...(range?{'Content-Range':'bytes '+a+'-'+b+'/'+track.bytes.length}:{})});res.end(track.bytes.subarray(a,b+1));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await require('playwright').chromium.launch({headless:true,args:['--no-sandbox']});
  for(const width of [390,1440]){const context=await browser.newContext({viewport:{width,height:900},...(width===390?{isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/154.0.0.0 Mobile Safari/537.36'}:{})});const page=await context.newPage();for(let n=0;n<2;n++){await page.setContent('<button onclick="document.querySelector(\'audio\').play()">Play</button><audio src="http://127.0.0.1:'+server.address().port+'/'+n+'" controls></audio>');await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForFunction(()=>document.querySelector('audio').currentTime>1,{},{timeout:30000});await page.locator('audio').evaluate(a=>a.pause());}await context.close();}
  journal.real_browser_playback=true;journal.status='passed';
 }catch(e){journal.status='incomplete';journal.failure=/^(Provider rejected|Voice acceptance|Voice training|Personal-voice|Two completed|Real generated|Owned voice|Real voice|Music idempotency|Insufficient provider)/.test(e.message)?e.message:'Controlled acceptance stopped; inspect existing tasks before any further paid request.';throw e;}
 finally{
  Object.assign(journal,guard.counts());try{journal.balance_after=await balance();}catch{}save('journal.json',journal);
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await local?.close();global.fetch=nativeFetch;delete process.env.MUSICAPI_API_KEY;
  console.log(JSON.stringify({status:journal.status,account:source.report.account,failed_voice_task_id:journal.profile_ready?null:journal.voice_task_id||null,failure:journal.failure||null,provider_failure:journal.provider_failure||null,...guard.counts(),production_database_writes:0,customer_credits_consumed:0},null,2));
 }
}
module.exports={localPool};
if(require.main===module)main().catch(()=>{console.error('Controlled voice test stopped. Preserve its journal and task IDs; no automatic paid retry.');process.exitCode=1;});
