'use strict';
// Real customer screens; no paid provider, account or storage requests.
const assert=require('node:assert/strict'),http=require('node:http');
const {runtime}=require('./runtime.cjs'),{launchBrowser}=require('./browser-engine.cjs');
(async()=>{
 const app=await runtime(),server=http.createServer(async(req,res)=>{const r=await app.request(req.url);res.writeHead(r.status,r.headers);res.end(r.body);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await launchBrowser();
 try{for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];let actor='owner',open=true,remaining=1,uploadStart=null;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
   const req=route.request(),p=new URL(req.url()).pathname,send=(x,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(x)});
   const owner=actor==='owner',promotion=actor==='promotion',artist=actor==='anonymous'?null:{id:7,display_name:'Fixture artist',email:'artist@launch.invalid',owner_unlimited:owner,promotion};
   if(p==='/api/platform/session')return send({artist,listener:null,admin:false,artist_promotion_open:open});
   if(p==='/api/platform/capabilities')return send({database:true,description_studio:true,lyrics_configured:true,music_provider_configured:true,studio_release_import:true});
   if(p==='/api/artist/subscription')return send({owner_unlimited:owner,promotion,external_uploads_allowed:owner,artist_features_active:owner||promotion,agreement_required:false,plan:'starter',upload_limit:owner?null:2,uploads_used:0});
   if(p==='/api/artist/studio-allowance')return send({owner_unlimited:owner,promotion,unlimited:owner,active:owner||promotion,included_generations:owner?null:1,remaining_generations:owner?null:remaining,tracks_per_generation:2});
   if(p==='/api/generation/wallet')return send(owner?{unlimited:true,credits:null}:{credits:1});
   if(p==='/api/artist/studio-history')return send({generations:[]});
   if(p==='/api/generation/history')return send({records:[]});
   if(p==='/api/voice/profile')return send({status:'missing',hasVoice:false});
   if(p==='/api/platform/artist-overview')return send({tracks:[],activity:[],stats:{published:0,plays:0,followers:0}});
   if(p==='/api/music/status')return send({uploadsEnabled:true});
   if(p==='/api/platform/social/providers')return send({providers:[]});
   if(p==='/api/platform/listening-ad')return send({ad:null});
   if(p==='/api/platform/offline/capabilities')return send({enabled:false});
   if(p==='/api/platform/payments/capabilities')return send({enabled:false,manual_bank:{enabled:true}});
   if(p==='/api/register'){assert.equal(actor,'anonymous');actor='promotion';return send({user:{id:7}},201);}
   if(p==='/api/music/upload/start'){uploadStart=req.postDataJSON();return send({id:11},201);}
   if(p==='/api/music/upload/file'||p==='/api/music/upload/finish')return send({ok:true,status:'published'});
   const r=await app.request(req.url().slice(origin.length));return route.fulfill({status:r.status,headers:r.headers,body:r.body});
  });
  await page.goto(origin+'/studio?artist=1');await page.locator('#studio-form').waitFor();
  assert(await page.locator('#generate-lyrics').isEnabled(),'owner lyrics button accepts an unlimited wallet');
  assert(await page.locator('#studio-form button[type=submit]').isEnabled(),'owner music button accepts an unlimited allowance');
  assert(await page.getByText('Unlimited',{exact:true}).count()>=2);
  await page.goto(origin+'/workspace?tab=upload');await page.locator('#upload-form').waitFor();
  assert.equal(await page.locator('[name=uploadCode]').evaluate(el=>el.required),false);
  await page.locator('[name=title]').fill('Eligible owner recording');await page.locator('[name=genre]').fill('Gospel Praise');
  await page.locator('[name=audio]').setInputFiles({name:'owner-original.mp3',mimeType:'audio/mpeg',buffer:Buffer.concat([Buffer.from('ID3'),Buffer.alloc(2045)])});
  await page.locator('[name=rights]').check();await page.getByRole('button',{name:'Upload & publish',exact:true}).click();await page.waitForURL(/tab=catalog/);
  assert.equal(uploadStart.uploadCode,'');assert.equal(uploadStart.rightsConfirmed,true);assert.equal(Object.hasOwn(uploadStart,'owner_unlimited'),false);
  actor='promotion';await page.goto(origin+'/workspace?tab=upload');await page.locator('#upload-form').waitFor();
  assert.equal(await page.locator('[name=uploadCode]').evaluate(el=>el.required),true);assert(await page.getByRole('button',{name:'Upload & publish',exact:true}).isDisabled());
  await page.locator('[name=uploadCode]').fill('A'.repeat(36));assert(await page.getByRole('button',{name:'Upload & publish',exact:true}).isEnabled());
  await page.goto(origin+'/studio?artist=1');await page.locator('#studio-form').waitFor();assert(await page.locator('#studio-form button[type=submit]').isEnabled());
  remaining=0;await page.reload();await page.locator('#studio-form').waitFor();assert(await page.locator('#studio-form button[type=submit]').isDisabled());
  actor='anonymous';remaining=1;await page.goto(origin+'/start?product=starter&ref=9');await page.getByRole('link',{name:'Try one free generation',exact:true}).waitFor();
  await page.getByRole('link',{name:'Try one free generation',exact:true}).click();await page.locator('#auth-form [name=name]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('ref'),'9');
  await page.locator('#auth-form [name=name]').fill('New promotional artist');await page.locator('#auth-form [name=email]').fill('new@launch.invalid');await page.locator('#auth-form [name=country]').fill('Nigeria');
  await page.locator('#auth-form [name=password]').fill('LaunchBrowserFixture123');await page.locator('#auth-form [name=confirmPassword]').fill('LaunchBrowserFixture123');
  await page.getByRole('button',{name:'Create free account ↗',exact:true}).click();await page.waitForURL(/\/workspace/);
  actor='anonymous';open=false;await page.goto(origin+'/join?role=artist&mode=register');await page.getByRole('heading',{name:'Choose your artist package.',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Try one free generation',exact:true}).count(),0);
  assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await context.close();
  console.log('PASS '+width+'px: unlimited owner lyrics/music and external upload, generated-only promotional upload, exhausted free credit, free signup with preserved referral and closed-promotion paid entry.');
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
