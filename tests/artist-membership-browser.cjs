'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),AxeBuilder=require('@axe-core/playwright').default;
const {runtime}=require('./runtime.cjs'),{launchBrowser}=require('./browser-engine.cjs');
(async()=>{const app=await runtime(),server=http.createServer(async(req,res)=>{const r=await app.request(req.url);res.writeHead(r.status,r.headers);res.end(r.body);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await launchBrowser();
try{for(const width of [390,1440]){
 let accepted=false,renewals=0;const a=require('../lib/creator-agreement').disclosure(),history=[],calls=[];
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname,send=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});calls.push({path,method:req.method()});
 if(req.method()==='POST'){
  if(path==='/api/platform/membership/agreement'){assert.deepEqual(req.postDataJSON(),{accepted:true,version:a.version,content_hash:a.content_hash});accepted=true;return send({acceptance:{id:1,version:a.version,accepted_at:'2026-11-05T00:00:00Z'}});}
  if(path==='/api/platform/membership/renew'){const b=req.postDataJSON();assert.equal(b.deduction_consent,true);assert.equal(b.amount_minor,1000);assert.equal(b.plan,'growth');assert.equal(b.currency,'USD');assert(req.headers()['idempotency-key']);renewals++;history.push({id:1,plan:'growth',status:'paid',starts_at:'2098-01-01',expires_at:'2099-01-01'});return send({subscription_id:1,amount_minor:1000});}
  throw Error('Unexpected write: '+path);
 }
 if(path==='/api/platform/session')return send({artist:{id:7,display_name:'Membership Artist',email:'fixture@membership.invalid',membership_status:'expired'},admin:false});
 if(path==='/api/platform/capabilities')return send({database:true,music_provider_configured:true});
 if(path==='/api/platform/currencies')return send(require('../lib/currency').options());
 if(path==='/api/platform/pricing')return send({country:'NG',currency:'USD',base_currency:'USD',plans:[]});
 if(path==='/api/plans')return send({plans:require('../lib/publishing-policy').packages()});
 if(path==='/api/artist/agreement')return send(a);
 if(path==='/api/artist/subscription')return send({artist_features_active:false,expired:true,plan:'starter',uploads_used:1,upload_limit:6,subscription:{expires_at:'2025-01-01'}});
 if(path==='/api/platform/artist-overview')return send({stats:{published:1,plays:42,followers:3},tracks:[]});
 if(path==='/api/platform/membership')return send({status:'expired',active_subscription:null,history,available_royalties_usd_minor:2000,agreement:a,acceptance:accepted?{id:1,version:a.version,accepted_at:'2026-11-05T00:00:00Z'}:null,notice:'Published songs remain available and eligible royalties continue. Renew for new generation and publishing.'});
 return send({});
 });
 await page.goto(origin+'/workspace?tab=membership');await page.getByRole('heading',{name:'Your artist membership',exact:true}).waitFor();assert(await page.getByText('Membership: expired',{exact:true}).isVisible());assert.equal(await page.locator('#creator-agreement-form input[type=checkbox]').isChecked(),false);assert(await page.getByRole('button',{name:'Confirm one-time royalty renewal'}).isDisabled());
 assert.deepEqual((await new AxeBuilder({page}).analyze()).violations,[]);
 await page.locator('#creator-agreement-form input[type=checkbox]').check();await page.getByRole('button',{name:'Accept agreement',exact:true}).click();await page.getByRole('heading',{name:'Agreement accepted',exact:true}).waitFor();assert.equal(renewals,0);
 const consent=page.locator('#royalty-renewal-form [name=deduction_consent]');await consent.check();await page.locator('#royalty-renewal-form select').selectOption('growth');assert.equal(await consent.isChecked(),false);assert.match(await page.locator('#royalty-renewal-consent').innerText(),/10.00/);await consent.check();await page.getByRole('button',{name:'Confirm one-time royalty renewal'}).click();await page.getByText(/Scheduled renewal:/).waitFor();assert.equal(renewals,1);
 await page.reload();await page.getByRole('heading',{name:'Your artist membership',exact:true}).waitFor();assert.equal(renewals,1);assert.equal(await consent.isChecked(),false);
 await page.goto(origin+'/workspace');await page.getByRole('heading',{name:/Make your next move/}).waitFor();assert(await page.getByRole('link',{name:'Membership & renewal'}).isVisible());
 await page.goto(origin+'/studio');await page.getByRole('heading',{name:'Choose a paid artist package.',exact:true}).waitFor();assert.equal(await page.locator('#studio-form').count(),0);
 await page.goto(origin+'/creator-agreement');await page.getByRole('heading',{name:'Music Creator Agreement.',exact:true}).waitFor();assert.equal(await page.locator('input[type=checkbox]').count(),0);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(!calls.some(c=>/sonic|lyrics-generate|voice\/train/.test(c.path)));
 console.log('Membership status, explicit agreement, exact royalty consent, expiry/dashboard, no automatic charge: passed at '+width);await context.close();
}}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
