'use strict';
const assert=require('node:assert/strict'),http=require('node:http');
const AxeBuilder=require('@axe-core/playwright').default,{runtime}=require('./runtime.cjs'),{launchBrowser}=require('./browser-engine.cjs');
(async()=>{const app=await runtime(),browser=await launchBrowser(),server=http.createServer(async(req,res)=>{const r=await app.request(req.url);res.writeHead(r.status,r.headers);res.end(r.body);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
try{for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],writes=[];let signedIn=false;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{const req=route.request(),p=new URL(req.url()).pathname,send=x=>route.fulfill({contentType:'application/json',body:JSON.stringify(x)});
  if(!['GET','HEAD'].includes(req.method())){writes.push(p);throw Error('Business/package browsing and disabled uploads must not write data.');}
  if(['/api/platform/business','/api/plans','/api/platform/currencies','/api/platform/pricing'].includes(p))return route.continue();
  if(p==='/api/platform/session')return send({artist:signedIn?{id:7,display_name:'Policy fixture',country:'NG'}:null,listener:null,admin:false});
  if(p==='/api/platform/capabilities')return send({payments:false});
  if(p==='/api/platform/social/providers')return send({providers:[]});
  if(p==='/api/artist/subscription')return send({artist_features_active:true,plan:'starter',upload_limit:7,uploads_used:1});
  if(p==='/api/music/status')return send({uploadsEnabled:true,studioOnlyPublishing:true,externalUploadsEnabled:false});
  return send({});
 });
 for(const [path,title]of [['/about','About LAE-MUSIC'],['/how-it-works','How LAE-MUSIC works'],['/publishing-policy','Studio-only publishing policy'],['/faq','Frequently asked questions']]){
  await page.goto(origin+path);await page.getByRole('heading',{name:title,exact:true}).waitFor();
  assert(await page.getByText('LAE-MUSIC is an AI-powered music creation, streaming and creator monetization platform.',{exact:true}).isVisible());
  assert(await page.getByText(/AI-generated music is not automatically copyright-free/).isVisible());
  assert(await page.getByText(/Only songs generated through LAE-MUSIC Studio may be published during this launch/).isVisible());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual((await new AxeBuilder({page}).analyze()).violations,[]);
 }
 await page.goto(origin+'/start?product=professional');await page.getByRole('button',{name:'Choose Premium',exact:true}).waitFor();
 assert.equal(await page.locator('[data-package]').count(),3);assert(await page.getByRole('heading',{name:'Premium',exact:true}).isVisible());
 const packageCopy=await page.locator('.price-grid').innerText();assert(!/\d+ (annual upload|included music|external upload|included generation)|per additional generation|undefined/i.test(packageCopy));assert.match(packageCopy,/3 generations per year/);assert.match(packageCopy,/15 generations per year/);assert.match(packageCopy,/30 tracks/);assert(!packageCopy.includes('Professional'));
 signedIn=true;await page.goto(origin+'/workspace?tab=upload');await page.locator('#upload-form').waitFor();
 assert(await page.getByRole('button',{name:'Upload & publish',exact:true}).isDisabled());assert(await page.getByLabel('Generated-song upload code',{exact:true}).getAttribute('required')!==null);
 await page.getByLabel('Generated-song upload code',{exact:true}).fill('A'.repeat(36));assert(!(await page.getByRole('button',{name:'Upload & publish',exact:true}).isDisabled()));
 await page.getByLabel('Generated-song upload code',{exact:true}).fill('');assert(await page.getByRole('button',{name:'Upload & publish',exact:true}).isDisabled());
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await context.close();console.log('Business copy, package names/prices, reviewed allowances and code-required upload UI passed at '+width);
}}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
