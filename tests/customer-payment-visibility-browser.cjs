'use strict';
// Real customer UI; account and payment responses are fixtures. No provider calls.
const assert=require('node:assert/strict'),http=require('node:http');
const {runtime}=require('./runtime.cjs'),{launchBrowser}=require('./browser-engine.cjs');
(async()=>{
 const app=await runtime(),server=http.createServer(async(req,res)=>{const r=await app.request(req.url);res.writeHead(r.status,r.headers);res.end(r.body);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await launchBrowser();
 try{for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:1050}}),page=await context.newPage(),errors=[],writes=[];
  let identity='guest',guestPurchase=null;page.on('pageerror',e=>errors.push(e.message));
  const provider={id:'monnify',name:'Monnify',currencies:['NGN']};
  const caps={enabled:true,mode:'live',providers:[provider],manual_bank:{enabled:false,customer_visible:false}};
  await page.route('**/api/**',async route=>{
   const req=route.request(),p=new URL(req.url()).pathname,send=x=>route.fulfill({contentType:'application/json',body:JSON.stringify(x)});
   if(req.method()==='POST'){
    const data=req.postDataJSON();writes.push({p,data});
    if(p==='/api/register'){identity='artist';return send({role:'artist'});}
    if(p==='/api/platform/account/login'){identity=data.role;return send({role:data.role});}
    if(p==='/api/platform/purchases')return send({order:{id:'fixture-order'}});
    if(p==='/api/platform/guest-payments/claim'){guestPurchase.claimed=true;return send({claimed:true});}
    errors.push('Unexpected payment/account write: '+p);return route.fulfill({status:500,contentType:'application/json',body:'{"error":"Unexpected fixture write"}'});
   }
   if(['/api/plans','/api/platform/currencies','/api/platform/pricing','/api/platform/business','/api/platform/financial-policy','/api/artist/agreement'].includes(p))return route.continue();
   if(p==='/api/platform/session')return send({artist:identity==='artist'?{id:7,display_name:'Fixture Artist',email:'artist@fixture.invalid'}:null,listener:identity==='listener'?{id:8,display_name:'Fixture Listener',email:'listener@fixture.invalid'}:null,admin:false,artist_promotion_open:false});
   if(p==='/api/platform/capabilities')return send({database:true,payments:true,payment_mode:'live',manual_bank_payments:false,guest_bank_payments:false});
   if(p==='/api/platform/payments/capabilities')return send(caps);
   if(p==='/api/platform/premium/plans')return send({...require('../lib/premium-pricing').catalog(),plans:require('../lib/premium-pricing').catalog().plans,price_status:'approved',live_payments:true,providers:[provider],manual_bank:caps.manual_bank});
   if(p==='/api/platform/premium/status')return send({active:false,activity:{premium_streams:0},orders:[{id:'old-manual',plan:'quarterly',amount_minor:180,currency:'USD',provider:'manual_bank_transfer',attempt_id:'old-manual-attempt',checkout_url:'/pay?old=1'}],entitlements:[]});
   if(p==='/api/platform/premium/complaints')return send({complaints:[]});
   if(p==='/api/platform/guest-payments')return send({purchase:guestPurchase,capabilities:{enabled:false,customer_visible:false}});
   if(p==='/api/artist/subscription')return send({artist_features_active:false,plan:'starter',subscription:null});
   if(p==='/api/platform/social/providers')return send({providers:[]});
   return send({});
  });
  const noManual=async()=>{assert.equal(await page.locator('#bank-guest-payment,#bank-account-payment,#checkout-manual-bank,[data-bank-order],[data-bank-payment]').count(),0);assert.doesNotMatch(await page.locator('#page').innerText(),/pay by (manual )?bank transfer|upload.*receipt|account number/i);};
  await page.goto(origin+'/start?ref=9&product=growth');await page.locator('#monnify-package-payment').waitFor();await noManual();
  for(const plan of ['starter','growth','professional']){await page.locator('[data-package='+plan+']').click();const url=new URL(await page.locator('#monnify-package-payment').getAttribute('href'),origin);assert.equal(url.searchParams.get('product'),plan);assert.equal(url.searchParams.get('ref'),'9');assert.equal(url.searchParams.get('return'),'monnify');}
  await page.locator('#monnify-package-payment').click();await page.locator('#auth-form').waitFor();assert.equal(new URL(page.url()).searchParams.get('product'),'professional');
  await page.locator('#auth-switch').click();await page.locator('#auth-form [name=name]').fill('Fixture Artist');await page.locator('#auth-form [name=email]').fill('artist@fixture.invalid');await page.locator('#auth-form [name=country]').fill('Nigeria');await page.locator('#auth-form [name=password]').fill('FixtureOnly-123');await page.locator('#auth-form [name=confirmPassword]').fill('FixtureOnly-123');await page.locator('#auth-form button[type=submit]').click();
  await page.getByRole('heading',{name:'Annual artist package',exact:true}).waitFor();assert.match(await page.locator('#action-dialog').innerText(),/Premium/);await noManual();
  // Removing the optional attribution avoids invoking referral issuance in this UI-only fixture.
  await page.locator('#action-dialog [name=attribution]').uncheck();await page.locator('#action-dialog button[type=submit]').click();await page.getByRole('heading',{name:'Choose how to pay.',exact:true}).waitFor();assert.deepEqual(await page.locator('#action-dialog select[name=provider] option').allTextContents(),['Monnify']);assert.equal(await page.locator('#checkout-manual-bank').count(),0);assert.equal(writes.find(x=>x.p==='/api/platform/purchases').data.plan,'professional');
  identity='guest';await page.goto(origin+'/premium?ref=9');await page.locator('[data-premium-plan=monthly]').click();await page.locator('#auth-form').waitFor();assert.equal(new URL(page.url()).searchParams.get('plan'),'monthly');await page.locator('#auth-form [name=email]').fill('listener@fixture.invalid');await page.locator('#auth-form [name=password]').fill('FixtureOnly-123');await page.locator('#auth-form button[type=submit]').click();
  await page.getByRole('heading',{name:'Review Monthly Premium.',exact:true}).waitFor();assert.equal(await page.locator('#action-dialog [name=referrer_id]').inputValue(),'9');assert.equal(await page.locator('[data-premium-verify],[data-premium-checkout]').count(),0);await noManual();
  identity='guest';await page.goto(origin+'/pay?kind=premium_listener&plan=quarterly&ref=9');await page.waitForURL(u=>u.pathname==='/premium');assert.equal(new URL(page.url()).searchParams.get('plan'),'quarterly');await noManual();
  await page.goto(origin+'/pay?kind=artist_subscription&plan=growth&ref=9');await page.waitForURL(u=>u.pathname==='/start');await page.locator('#monnify-package-payment').waitFor();assert.equal(new URL(page.url()).searchParams.get('product'),'growth');await noManual();
  guestPurchase={role:'listener',email:'listener@fixture.invalid',kind:'premium_listener',plan:'quarterly',claimed:false,payment:{status:'submitted',account:{account_number:'private-old-bank-number'}}};await page.goto(origin+'/pay');await page.getByRole('heading',{name:'Your existing payment is being reviewed.',exact:true}).waitFor();await noManual();assert(!((await page.locator('#page').innerText()).includes('private-old-bank-number')));
  // A paid legacy customer can still claim the purchase, without a new charge.
  identity='listener';guestPurchase.payment.status='approved';await page.reload();await page.waitForURL(u=>u.pathname==='/premium');await page.getByRole('heading',{name:'A little more music. A direct connection.',exact:true}).waitFor();assert(guestPurchase.claimed);assert.equal(writes.filter(x=>x.p==='/api/platform/guest-payments/claim').length,1);
  assert.deepEqual(errors,[]);assert(!writes.some(x=>/checkout|quote|manual-payments|premium\/orders/.test(x.p)));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await context.close();console.log('Monnify-only customer entries, selected plans/referrals, no manual UI, retained paid/pending history: passed at '+width);
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
