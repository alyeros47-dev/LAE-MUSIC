'use strict';
// The owner's existing login opens the real studio without buying a demo.
// Only browser/API fixtures are used: no provider calls or financial writes.
const assert=require('node:assert/strict'),http=require('node:http');
const {runtime}=require('./runtime.cjs'),{launchBrowser}=require('./browser-engine.cjs');
(async()=>{const app=await runtime(),server=http.createServer(async(req,res)=>{const r=await app.request(req.url);res.writeHead(r.status,r.headers);res.end(r.body);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await launchBrowser();
try{for(const width of [390,1440])for(const mode of ['shared_key','named']){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),calls=[],errors=[];let owner=false,attempts=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;calls.push(path);const send=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
  if(path==='/api/platform/session')return send({artist:{id:7,display_name:'Existing registered artist'},listener:null,admin:owner,admin_user:owner?{id:'existing-owner',role:'owner'}:null});
  if(path==='/api/artist/subscription')return send({artist_features_active:false});
  if(path==='/api/platform/admin/auth/status')return send({mode,configuration_ready:true});
  if(path==='/api/admin/login'){attempts++;const b=req.postDataJSON();if(attempts===1)return send({error:'Incorrect administrator credentials or code.'},401);assert.equal(b.password,'existing-owner-password');if(mode==='named'){assert.equal(b.email,'owner@example.invalid');assert.equal(b.code,'123456');}owner=true;return send({ok:true});}
  if(path==='/api/platform/capabilities')return send({description_studio:true,lyrics_configured:true});
  if(path==='/api/platform/currencies')return send(require('../lib/currency').options());
  if(path==='/api/platform/pricing')return send({country:'NG',currency:'USD',plans:[]});
  return send({});
 });
 await page.goto(origin+'/studio');await page.getByRole('link',{name:'Owner: open studio for testing',exact:true}).click();await page.getByRole('heading',{name:'Owner studio access.',exact:true}).waitFor();
 assert.equal(new URL(page.url()).searchParams.get('owner'),'1');assert.equal(await page.getByText('Choose a paid artist package.',{exact:true}).count(),0);
 await page.locator('#admin-login [name=password]').fill('wrong-password');if(mode==='named'){await page.getByLabel('Operator email',{exact:true}).fill('owner@example.invalid');await page.getByLabel('Authenticator or recovery code',{exact:true}).fill('123456');}
 await page.getByRole('button',{name:'Open studio',exact:true}).click();await page.getByText('Incorrect administrator credentials or code.',{exact:true}).waitFor();assert.equal(await page.locator('#customer-description').count(),0);assert(await page.getByRole('button',{name:'Open studio',exact:true}).isEnabled());
 await page.locator('#admin-login [name=password]').fill('existing-owner-password');await page.getByRole('button',{name:'Open studio',exact:true}).click();await page.getByLabel('Describe your song',{exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/studio');assert.equal(new URL(page.url()).search,'');
 await page.reload();await page.getByLabel('Describe your song',{exact:true}).waitFor();assert.equal(attempts,2);assert(!calls.some(p=>/demo|checkout|description\/start|sonic/.test(p)));assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await context.close();
 console.log('PASS: owner studio entry, existing '+mode+' authentication, denied invalid credentials, preserved account, reload and zero demo/provider calls at '+width+'px.');
}
 // Anonymous users can discover the same protected entry, not generate freely.
 const context=await browser.newContext(),page=await context.newPage();await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({contentType:'application/json',body:JSON.stringify(path==='/api/platform/session'?{artist:null,listener:null,admin:false,admin_user:null}:path==='/api/platform/currencies'?require('../lib/currency').options():{})});});await page.goto(origin+'/studio');await page.getByRole('link',{name:'Owner: open studio for testing',exact:true}).waitFor();assert.equal(await page.locator('#customer-description').count(),0);await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
