'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs');
const AxeBuilder=require('@axe-core/playwright').default,{runtime}=require('./runtime.cjs'),{launchBrowser,artifactLabel}=require('./browser-engine.cjs'),info=require('../lib/public-information');
(async()=>{
 const app=await runtime(),server=http.createServer(async(req,res)=>{const r=await app.request(req.url,{method:req.method});res.writeHead(r.status,r.headers);res.end(r.body);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await launchBrowser();
 try{for(const width of [393,1440]){
  const staticContext=await browser.newContext({viewport:{width,height:1000},javaScriptEnabled:false}),staticPage=await staticContext.newPage();
  for(const path of info.PATHS.filter(p=>p!=='/')){await staticPage.goto(origin+path);assert(await staticPage.locator('main h1').isVisible(),path);if(['/how-it-works','/start'].includes(path)){const text=await staticPage.locator('main').innerText();assert(text.includes('Growth — $10/year'));assert(text.includes('Premium — $20/year'));if(path==='/how-it-works')assert(text.includes('your allocation is $10'));}assert.equal(await staticPage.locator('link[rel="canonical"]').getAttribute('href'),info.page(path).canonical);assert(await staticPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await staticContext.close();
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],violations=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));await context.addInitScript(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',event=>window.cspViolations.push(event.violatedDirective));localStorage.setItem('lae_listening_preferences_v1',JSON.stringify({version:1,selections:[]}));});
  await page.route('**/api/**',route=>{
   const req=route.request(),p=new URL(req.url()).pathname,send=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   if(req.method()!=='GET'){writes.push(p);return send({});}
   if(['/api/platform/business','/api/platform/financial-policy','/api/plans','/api/platform/currencies','/api/platform/premium/plans'].includes(p))return route.continue();
   if(p==='/api/platform/session')return send({artist:null,listener:null,admin:false});
   if(p==='/api/platform/capabilities')return send({payments:false,manual_bank_payments:true,offline_listening:true,premium_referrals_enabled:true});
   if(p==='/api/platform/discover')return send({tracks:[],artists:[],genres:[]});
   if(p==='/api/platform/editorial')return send({promotions:[],featured_tracks:[],featured_artists:[]});
   if(p==='/api/platform/offline/capabilities')return send({enabled:false});
   return send({});
  });
  await page.goto(origin+'/about');await page.getByRole('heading',{name:'About LAE-MUSIC',exact:true}).waitFor();
  for(const path of ['/about','/how-it-works','/affiliate-program','/publishing-policy','/faq']){
   if(path!=='/about')await page.getByRole('navigation',{name:'Public information'}).getByRole('link',{name:({'/how-it-works':'How it works','/affiliate-program':'Affiliate program','/publishing-policy':'Publishing policy','/faq':'FAQs'})[path],exact:true}).click();
   await page.waitForFunction(expected=>document.querySelector('link[rel="canonical"]')?.href===expected,info.page(path).canonical);assert.equal(await page.locator('main h1').count(),1);assert.equal(await page.title(),info.page(path).title);
   const graph=await page.locator('#public-information-schema').textContent();assert.equal(JSON.parse(graph)['@graph'][2].url,info.page(path).canonical);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const audit=await new AxeBuilder({page}).analyze();violations.push(...audit.violations);
  }
  // Public copy survives unavailable account/configuration APIs on a direct load.
  await page.route('**/api/**',route=>route.abort('failed'));await page.goto(origin+'/affiliate-program');await page.getByRole('heading',{name:'LAE-MUSIC affiliate program',exact:true}).waitFor();assert(await page.getByText('Approved Premium commissions',{exact:true}).isVisible());
  await page.unroute('**/api/**');
  // Direct public pages contain their useful content even before application scripts run.
  await page.goto(origin+'/about');await page.getByRole('heading',{name:'About LAE-MUSIC',exact:true}).waitFor();
  fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/'+artifactLabel('public-information-'+width)+'.png'});
  await page.getByRole('navigation',{name:'Public information'}).getByRole('link',{name:'Affiliate program',exact:true}).click();await page.getByRole('heading',{name:'LAE-MUSIC affiliate program',exact:true}).waitFor();await page.screenshot({path:'artifacts/'+artifactLabel('public-affiliate-'+width)+'.png'});await page.getByRole('link',{name:'Open partner dashboard',exact:true}).click();await page.waitForURL('**/partners');await page.waitForFunction(()=>!document.querySelector('link[rel="canonical"]')&&document.querySelector('meta[name="robots"]').content==='noindex,follow');assert.equal(await page.getByRole('heading',{name:'About LAE-MUSIC',exact:true}).count(),0);
  assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(await page.evaluate(()=>window.cspViolations),[]);
  await context.close();console.log('PASS '+width+'px: seven no-JavaScript public pages, linked public navigation, metadata/schema parity, unavailable-account fallback, ten focused page audits across both widths; no writes.');
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
