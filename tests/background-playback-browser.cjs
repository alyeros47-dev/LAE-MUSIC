'use strict';
// Real native media in a background browser tab; this does not emulate an Android lock screen.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),{spawn}=require('node:child_process');
const {runtime}=require('./runtime.cjs'),{engine}=require('./browser-engine.cjs');
function tone(){const rate=8000,count=rate*6,b=Buffer.alloc(44+count*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);for(let i=0;i<count;i++)b.writeInt16LE(Math.round(Math.sin(2*Math.PI*330*i/rate)*2000),44+i*2);return b;}
(async()=>{
 if(engine!=='chromium'){console.log('Native hidden-window coverage runs in Chromium; existing native foreground playback tests cover '+engine+'.');return;}
 const app=await runtime(),audio=require('./fixtures/playback-mp3.cjs'),server=http.createServer(async(req,res)=>{const r=await app.request(req.url);res.writeHead(r.status,r.headers);res.end(r.body);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let browser,xvfb,chrome,profile;
 async function closeChrome(){
  // connectOverCDP.close() may disconnect before the external process exits.
  // Close native Chrome first, wait for it, then remove its temporary profile.
  const child=chrome;chrome=null;
  if(browser){
   try{const session=await browser.newBrowserCDPSession();await session.send('Browser.close');}catch{}
   await browser.close();browser=null;
  }
  if(child&&child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{
   const timer=setTimeout(()=>child.kill('SIGKILL'),5000);
   child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');
  });
  if(profile){await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});profile=null;}
 }
 try{
  let display=process.env.DISPLAY;
  if(!display){
   const binary=process.env.LAE_XVFB_BINARY||'/usr/bin/Xvfb';
   if(!fs.existsSync(binary))throw Error('A real headed background test requires Xvfb (or an existing DISPLAY).');
   xvfb=spawn(binary,['-displayfd','1','-screen','0','1280x1000x24','-nolisten','tcp'],{stdio:['ignore','pipe','pipe']});
   display=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error('Xvfb did not become ready')),10000);xvfb.on('error',reject);xvfb.stdout.on('data',data=>{out+=data;if(/^\d+\n/.test(out)){clearTimeout(timer);resolve(':'+out.trim());}});xvfb.once('exit',()=>{clearTimeout(timer);reject(Error('Xvfb stopped before browser testing'));});});
  }
  for(const role of ['guest','premium','artist']){
  profile=fs.mkdtempSync('/tmp/lae-background-chrome-');
  chrome=spawn(process.env.LAE_CHROMIUM_PATH||require('playwright').chromium.executablePath(),['--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','about:blank'],{env:{...process.env,DISPLAY:display},stdio:['ignore','ignore','pipe']});
  const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native Chrome did not start')),15000);chrome.once('error',reject);let out='';chrome.stderr.on('data',data=>{out+=data;const match=out.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
  // Playwright normally forces every page to appear focused/visible. The default
  // browser context with noDefaults preserves genuine native background lifecycle.
  browser=await require('playwright').chromium.connectOverCDP(endpoint,{noDefaults:true});
  const context=browser.contexts()[0];
  try{
   await context.addInitScript(()=>{
    localStorage.setItem('lae_listening_preferences_v1',JSON.stringify({version:1,selections:[]}));
    document.addEventListener('timeupdate',event=>{if(document.hidden)event.stopImmediatePropagation();},true);window.bufferedSongs=[];const nativeFetch=window.fetch;window.fetch=async(...args)=>{const r=await nativeFetch(...args);const id=/tracks\/(\d+)\/audio$/.exec(String(args[0]));if(id){const original=r.blob.bind(r);r.blob=async()=>{const b=await original();window.bufferedSongs.push(id[1]);return b;};}return r;};window.mediaHandlers={};if('mediaSession'in navigator){const native=navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);navigator.mediaSession.setActionHandler=(name,handler)=>{window.mediaHandlers[name]=handler;return native(name,handler);};}
   });
   const page=await context.newPage();await page.setViewportSize({width:393,height:900});const requests=[],errors=[],tracks=[1,2,3].map(id=>({id:String(id),title:'Background song '+id,artist:'Fixture artist',artist_id:'9',genre:'Gospel Praise',published_at:'2026-01-01',plays:0}));
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/**',route=>{
    const p=new URL(route.request().url()).pathname;requests.push(p);const send=x=>route.fulfill({contentType:'application/json',body:JSON.stringify(x)});
    if(p.endsWith('/cover-image'))return route.fulfill({contentType:'image/svg+xml',body:fs.readFileSync('web/artwork.svg')});
    if(p.endsWith('/stream'))return send({url:origin+'/tone.mp3'});
    if(p.endsWith('/audio'))return route.fulfill({contentType:'audio/mpeg',headers:{'Content-Length':String(audio.length)},body:audio});
    if(p==='/api/platform/session')return send({artist:role==='artist'?{id:8,display_name:'Artist'}:null,listener:role==='premium'?{id:7,display_name:'Premium listener',premium:{expires_at:'2099-01-01'}}:null,admin:false});
    if(p==='/api/platform/discover')return send({tracks,genres:[{genre:'Gospel Praise',tracks:3}],artists:[],next_cursor:null});
    if(p==='/api/platform/currencies')return send(require('../lib/currency').options());
    if(p==='/api/platform/editorial')return send({promotions:[],featured_tracks:[],featured_artists:[]});
    if(p==='/api/platform/listening-ad')return send({ad:null,premium:role==='premium',configured:false});
    if(p==='/api/platform/offline/capabilities')return send({enabled:false});
    return send({});
   });
   let directBlocked=false;await page.route('**/tone.mp3',route=>directBlocked?route.abort('failed'):route.fulfill({contentType:'audio/mpeg',body:audio}));
   await page.goto(origin);await page.getByRole('button',{name:'Play Background song 1',exact:true}).click();
   await page.waitForFunction(()=>!document.getElementById('audio').paused&&document.getElementById('audio').currentTime>0);
   await page.waitForFunction(()=>document.getElementById('audio').readyState>=2);
   // Require actual byte buffering before the app loses visibility.
   await page.waitForFunction(()=>window.bufferedSongs?.includes('2'));
   await page.waitForFunction(()=>document.getElementById('audio').currentTime>.2);
   directBlocked=true;
   const foreground=await context.newPage();await foreground.goto('about:blank');await foreground.bringToFront();
   // Use real headed tabs with background throttling enabled, not a mocked visibility property.
   await page.waitForFunction(()=>document.hidden,null,{timeout:5000,polling:100});
   const hidden=await page.evaluate(()=>document.hidden);
   if(engine==='chromium')assert.equal(hidden,true,'player page must actually be in the background');
   await page.waitForFunction(()=>document.getElementById('player-title').textContent==='Background song 2'&&!document.getElementById('audio').paused&&document.getElementById('audio').currentTime>0,null,{timeout:20000,polling:100});
   if(await page.evaluate(()=>!!window.mediaHandlers.pause)){
    await page.evaluate(()=>window.mediaHandlers.pause());const pausedAt=await page.locator('#audio').evaluate(a=>a.currentTime);
    await new Promise(r=>setTimeout(r,500));assert.equal(await page.locator('#audio').evaluate(a=>a.paused),true);assert.equal(await page.locator('#audio').evaluate(a=>a.currentTime),pausedAt);
    await page.evaluate(()=>window.mediaHandlers.play());
   }
   await page.waitForFunction(()=>document.getElementById('player-title').textContent==='Background song 3'&&!document.getElementById('audio').paused&&document.getElementById('audio').currentTime>0,null,{timeout:20000,polling:100});
   await page.waitForFunction(()=>document.getElementById('player-title').textContent==='Background song 1'&&!document.getElementById('audio').paused,null,{timeout:20000,polling:100});
   assert(await page.locator('#audio').evaluate(a=>a.src.startsWith('blob:')),'native player must use prebuffered original bytes at the handoff');
   assert.equal(await page.locator('#audio').evaluate(a=>a.preload),'auto');assert.deepEqual(errors,[]);
   assert(requests.filter(p=>p==='/api/music/tracks/2/stream').length>=1,'prepared source must be reused');
   assert(requests.filter(p=>p==='/api/music/tracks/3/stream').length>=1);
   console.log('PASS '+engine+' '+role+': native background playback across three track endings and queue wrap, fully buffered audio, progress callbacks suppressed and direct media network blocked and explicit media-session pause/resume; document.hidden='+hidden);
  }finally{await closeChrome();}
 }}finally{await closeChrome();xvfb?.kill();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
