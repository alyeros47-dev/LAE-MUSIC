'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs');
const {runtime}=require('./runtime.cjs'),{launchBrowser,engine}=require('./browser-engine.cjs');
const AxeBuilder=require('@axe-core/playwright').default;
function tone(){
 const count=8000*6,b=Buffer.alloc(44+count*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);
 for(let i=0;i<count;i++)b.writeInt16LE(Math.round(Math.sin(2*Math.PI*330*i/8000)*2000),44+2*i);return b;
}
(async()=>{
 const audio=tone(),app=await runtime(),browser=await launchBrowser(),tracks=[1,2,3].map(id=>({id:String(id),title:'Playback song '+id,artist:'Fixture artist',artist_id:'9',genre:'Gospel Praise',published_at:'2026-01-01',plays:0}));
 const server=http.createServer(async(req,res)=>{const r=await app.request(req.url);res.writeHead(r.status,r.headers);res.end(r.body);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{for(const [premium,width]of [[false,320],[true,393],[false,1440]]){
  const ctx=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce',...(width<700&&engine!=='firefox'?{isMobile:true,hasTouch:true}:{})}),page=await ctx.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
  await ctx.addInitScript(()=>{localStorage.setItem('lae_listening_preferences_v1',JSON.stringify({version:1,selections:[{family:'gospel',genres:['praise']}]}));});
  await page.route('**/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()),p=u.pathname;requests.push(p+u.search);const send=x=>route.fulfill({contentType:'application/json',body:JSON.stringify(x)});
   if(p.endsWith('/cover-image'))return route.fulfill({contentType:'image/svg+xml',body:fs.readFileSync('web/artwork.svg')});
   if(p.endsWith('/stream'))return send({url:origin+'/fixture-tone.wav'});
   if(p==='/api/platform/session')return send({artist:null,listener:premium?{id:7,display_name:'Premium listener',premium:{expires_at:'2099-01-01'}}:null,admin:false});
   if(p==='/api/platform/discover')return send({tracks,genres:[{genre:'Gospel Praise',tracks:3}],artists:[],next_cursor:null});
   if(p.startsWith('/api/music/track/'))return send({track:tracks.find(t=>t.id===p.split('/').at(-1))});
   if(p==='/api/listener/song-engagement')return send({liked:false,likes:0});if(p==='/api/listener/comments')return send({comments:[]});
   if(p==='/api/platform/currencies')return send(require('../lib/currency').options());
   if(p==='/api/platform/editorial')return send({promotions:[],featured_tracks:[],featured_artists:[]});
   if(p==='/api/platform/listening-ad')return send({premium,ad:null});
   if(p==='/api/platform/offline/capabilities')return send({enabled:false});
   return send({});
  });
  await page.route('**/fixture-tone.wav',route=>route.fulfill({contentType:'audio/wav',body:audio}));
  const playing=async title=>page.waitForFunction(title=>{const a=document.getElementById('audio');return document.getElementById('player-title').textContent===title&&!a.paused&&a.currentTime>0;},title);
  const finish=async()=>{await page.locator('#audio').evaluate(a=>{a.currentTime=a.duration-.15;});};
  await page.goto(origin+'/');await page.getByRole('button',{name:'Play Playback song 1',exact:true}).click();await playing('Playback song 1');
  // Wait for the app's native play handler, not the OS media-agent getter:
  // Firefox can report a paused Media Session while its audio is playing.
  await page.waitForFunction(()=>document.getElementById('play-toggle').getAttribute('aria-label')==='Pause'&&!document.getElementById('audio').paused);
  // A stale native pause event must not mark a running successor/session paused.
  // Read and dispatch in the same task, before shortening the six-second
  // fixture. Separate driver calls can accidentally observe a natural ending.
  const stalePause=await page.locator('#audio').evaluate(a=>{
   const state=()=>({paused:a.paused,control:document.getElementById('play-toggle').getAttribute('aria-label')});
   const before=state();
   a.dispatchEvent(new Event('pause'));
   return {before,after:state()};
  });
  assert.deepEqual(stalePause,{before:{paused:false,control:'Pause'},after:{paused:false,control:'Pause'}});
  await finish();await playing('Playback song 2');await finish();await playing('Playback song 3');
  await page.getByRole('button',{name:'Previous track',exact:true}).click();await playing('Playback song 2');
  for(const label of ['Previous track','Next track']){const b=page.getByRole('button',{name:label,exact:true});assert(await b.isVisible());if(width<700){const box=await b.boundingBox();assert(box.width>=44&&box.height>=44);}}
  await page.getByRole('button',{name:'Next track',exact:true}).click();await playing('Playback song 3');await page.locator('#audio').evaluate(a=>{a.currentTime=4;});await page.getByRole('button',{name:'Previous track',exact:true}).click();await playing('Playback song 2');
  await page.getByRole('button',{name:'Expand music player',exact:true}).click();await page.getByRole('button',{name:'Next track in expanded player',exact:true}).click();await playing('Playback song 3');await page.getByRole('button',{name:'Previous track in expanded player',exact:true}).click();await playing('Playback song 2');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'More options for Playback song 1',exact:true}).click();await page.getByRole('button',{name:'Play now',exact:true}).click();await playing('Playback song 1');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lae_playback_v2')).tracks.length),3);await finish();await playing('Playback song 2');
  // A fresh shared-song page must build a matching list instead of a single item.
  await page.evaluate(()=>{document.getElementById('audio').pause();localStorage.removeItem('lae_playback_v2');});await page.goto(origin+'/discover?track=1');await page.getByRole('button',{name:'▶ Play song',exact:true}).click();await playing('Playback song 1');await finish();await playing('Playback song 2');
  assert(requests.some(p=>p.startsWith('/api/platform/discover?')&&new URL(origin+p).searchParams.get('listening')?.includes('praise')),'Song-page continuation preserves listening preferences');
  await page.locator('#audio').evaluate(a=>a.pause());await page.reload();await page.getByRole('button',{name:'▶ Play song',exact:true}).waitFor();assert(await page.locator('#audio').evaluate(a=>a.paused),'Reload must not start unsolicited audio');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual((await new AxeBuilder({page}).include('#player').analyze()).violations,[]);assert.deepEqual(errors,[]);fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/continuous-playback-'+engine+'-'+width+'.png',fullPage:true});await ctx.close();
  console.log('PASS '+engine+' '+width+'px '+(premium?'Premium':'guest')+': native ended autoplay, card/menu/shared-page lists, matching preferences, next/back, expanded controls and accessibility.');
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
