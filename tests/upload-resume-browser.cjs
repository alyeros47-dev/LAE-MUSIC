'use strict';
const assert=require('node:assert/strict'),http=require('node:http');
const {runtime}=require('./runtime.cjs'),{launchBrowser}=require('./browser-engine.cjs');
(async()=>{const app=await runtime(),browser=await launchBrowser(),server=http.createServer(async(req,res)=>{const r=await app.request(req.url);res.writeHead(r.status,r.headers);res.end(r.body);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
try{for(const width of [390,1440])for(const stored of [true,false]){
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',...(width<700?{isMobile:true,hasTouch:true}:{})}),page=await context.newPage(),writes=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{const req=route.request(),p=new URL(req.url()).pathname,send=(x,status=200)=>route.fulfill({status,json:x});
  if(req.method()!=='GET')writes.push({path:p,method:req.method(),type:req.headers()['content-type'],body:req.method()==='POST'?req.postDataJSON():null});
  if(p==='/api/platform/session')return send({artist:{id:7,display_name:'Publishing fixture',email:'fixture@publishing.invalid'},listener:null,admin:false});
  if(p==='/api/platform/external-uploads')return send({active_subscription:null});
  if(p==='/api/artist/subscription')return send({artist_features_active:true,agreement_required:false,plan:'starter',upload_limit:6,uploads_used:1});
  if(p==='/api/music/status')return send({uploadsEnabled:true});
  if(p==='/api/platform/artist-overview')return send({tracks:[],activity:[],stats:{published:0,plays:0,followers:0}});
  if(p==='/api/generation/code/check')return send({valid:true,resumable:true,used:true,published:false,title:'Original Studio song',track_id:12});
  if(p==='/api/music/upload/start'){const b=req.postDataJSON();assert.equal(b.coverMime,'image/jpeg');assert.equal(b.audioMime,'audio/mpeg');assert.equal(b.audioBytes,2048);assert.equal(b.uploadCode,'A'.repeat(36));assert.equal(b.rightsConfirmed,true);return send({id:12,resumed:true,audio_already_stored:stored},201);}
  if(p==='/api/music/upload/file')return send({ok:true});
  if(p==='/api/music/upload/finish'){assert.equal(req.postDataJSON().id,12);return send({ok:true,status:'published'});}
  if(p==='/api/platform/social/providers')return send({providers:[]});
  if(p==='/api/support/config')return send({available:false,greeting:'Support fixture',suggestions:[]});
  const r=await app.request(req.url().slice(origin.length));return route.fulfill({status:r.status,headers:r.headers,body:r.body});
 });
 await page.goto(origin+'/workspace?tab=upload');await page.locator('#upload-form').waitFor();await page.locator('[name=uploadCode]').fill('A'.repeat(36));await page.locator('[name=title]').fill('Original Studio song');await page.locator('[name=genre]').fill('Gospel Praise');await page.locator('[name=audio]').setInputFiles({name:'original.mp3',mimeType:'audio/mpeg',buffer:Buffer.concat([Buffer.from('ID3'),Buffer.alloc(2045)])});
 const png=Buffer.alloc(32);Buffer.from('89504e470d0a1a0a','hex').copy(png);await page.locator('[name=cover]').setInputFiles({name:'previous.png',mimeType:'image/png',buffer:png});const jpeg=Buffer.alloc(32);jpeg[0]=255;jpeg[1]=216;jpeg[2]=255;await page.locator('[name=cover]').setInputFiles({name:'selected.jpg',mimeType:'image/jpeg',buffer:jpeg});await page.locator('[name=rights]').check();await page.getByRole('button',{name:'Upload & publish',exact:true}).click();await page.waitForURL(/tab=catalog/);await page.getByRole('heading',{name:'Your music catalog',exact:true}).waitFor();
 const put=writes.filter(w=>w.path==='/api/music/upload/file');assert.equal(put.filter(w=>w.type==='audio/mpeg').length,stored?0:1);assert.equal(put.filter(w=>w.type==='image/jpeg').length,1);assert.equal(writes.filter(w=>w.path==='/api/music/upload/start').length,1);assert.equal(writes.filter(w=>w.path==='/api/music/upload/finish').length,1);assert(writes.every(w=>w.path.startsWith('/api/music/upload/')||w.path==='/api/generation/code/check'));assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await context.close();console.log('PASS '+width+'px: pending code + replacement JPEG publish; original audio '+(stored?'reused':'uploaded')+'; no generation or payment request.');
}}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
