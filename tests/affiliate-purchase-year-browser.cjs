'use strict';
// Real frontend, mocked identities/receipts, no gateway or provider consumption.
const assert=require('node:assert/strict'),http=require('node:http');
const AxeBuilder=require('@axe-core/playwright').default;
const {runtime}=require('./runtime.cjs'),{launchBrowser}=require('./browser-engine.cjs');
(async()=>{
 const app=await runtime(),browser=await launchBrowser();
 const server=http.createServer(async(req,res)=>{const r=await app.request(req.url);res.writeHead(r.status,r.headers);res.end(r.body);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:1100},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],writes=[];
  let identity='guest',eligible=false,registered=false,activated=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),p=url.pathname,send=x=>route.fulfill({contentType:'application/json',body:JSON.stringify(x)});
   if(!['GET','HEAD'].includes(req.method())){writes.push(p);assert(['/api/platform/partners/activate','/api/platform/partners/participation'].includes(p));assert.equal(req.postDataJSON().participating,true);assert(req.headers()['idempotency-key']);registered=true;if(p.endsWith('/activate'))activated=true;return send({ok:true,artist_id:7});}
   if(p==='/api/platform/session')return send({artist:identity==='artist'||activated?{id:7,display_name:'Fixture Partner'}:null,listener:identity==='listener'?{id:8,display_name:'Fixture Listener'}:null,admin:false});
   if(p==='/api/platform/partners/eligibility')return send({eligible:eligible&&registered,qualified:eligible,registered,eligibility_expires:false,qualifying_purchase:eligible?{expires_at:null}:null});
   if(p==='/api/platform/partners/accounting')return send(require('./partner-accounting-browser-fixture.cjs').fixture());
   if(p==='/api/affiliate/product-links')return send({links:{premium:origin+'/premium?plan=quarterly&ref=7',starter:origin+'/start?ref=7&product=starter'}});
   if(p==='/api/affiliate/earnings')return send({totals:[],history:[]});
   if(p==='/api/platform/partners-overview')return send({stats:{},monthly:[]});
   if(p==='/api/platform/affiliate-premium')return send({commissions:[],notice:'Historical and earned records retained.'});
   if(p==='/api/platform/partners/pending-purchases')return send({purchases:[],policy:require('../lib/affiliate-framework').disclosure()});
   if(p==='/api/platform/capabilities')return send({affiliate_allocations_pending:true});
   if(p==='/api/platform/social/providers')return send({providers:[]});
   if(p==='/api/platform/currencies'||p==='/api/platform/pricing')return route.continue();
   return send({});
  });
  await page.goto(origin+'/partners');await page.getByRole('heading',{name:'Join freely. Participate by choice.',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'View Three-Month Premium'}).getAttribute('href'),'/premium?plan=quarterly');
  assert.equal(await page.getByRole('link',{name:'View artist packages'}).getAttribute('href'),'/start');
  assert.equal(await page.getByRole('button',{name:'Activate affiliate access'}).count(),0);
  await page.getByRole('link',{name:'Create a free partner account',exact:true}).click();await page.getByRole('heading',{name:'Create your account.',exact:true}).waitFor();assert(await page.getByLabel('Confirm password',{exact:true}).isVisible());
  identity='artist';await page.goto(origin+'/partners');await page.getByRole('heading',{name:'Choose to join the affiliate program.',exact:true}).waitFor();assert.equal(await page.getByRole('checkbox').isChecked(),false);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Join affiliate program for free'}).click();await page.getByRole('heading',{name:'Your affiliate registration is free.',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'View existing earnings records'}).getAttribute('href'),'/partners?tab=finance');
  assert.equal(await page.getByText('Your product referral links',{exact:true}).count(),0);
  identity='listener';eligible=true;registered=false;await page.reload();await page.getByRole('button',{name:'Join affiliate program for free',exact:true}).waitFor();
  assert(await page.getByText('Your purchase qualifies. No extra payment is needed.',{exact:true}).isVisible());
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Join affiliate program for free',exact:true}).click();
  await page.getByRole('heading',{name:'Your sharing links',exact:true}).waitFor();
  assert(await page.getByRole('button',{name:'Copy Premium link',exact:true}).isVisible());
  assert(await page.getByText('Full statements and earlier records',{exact:true}).isVisible());
  assert.equal(await page.getByText('New Premium Listener purchases and renewals: 20% direct',{exact:false}).count(),0);
  assert.deepEqual(writes,['/api/platform/partners/participation','/api/platform/partners/activate']);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual((await new AxeBuilder({page}).analyze()).violations,[]);
  assert.deepEqual(errors,[]);await context.close();
  console.log('Free voluntary opt-in, purchase qualification, approved Premium sharing and same-email access passed at '+width);
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
