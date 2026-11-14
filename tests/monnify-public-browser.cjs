'use strict';
// Actual customer UI/server/database; only Monnify HTTP/hosted pages are fixtures.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http'),{Pool}=require('pg');
const {runtime}=require('./runtime.cjs'),{launchBrowser}=require('./browser-engine.cjs'),target=require('./ci-database.cjs').ciDatabase(),key=()=>crypto.randomUUID();
(async()=>{
 const control=new Pool({connectionString:target.href}),schema='monnify_public_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});
 const original=global.fetch,policy=require('../config/monnify-payments.json'),savedPolicy={...policy},transactions=new Map();let browser,server,latest;
 global.fetch=async(input,options={})=>{const url=new URL(input);assert.equal(url.hostname,'api.monnify.com');let d;
  if(url.pathname.endsWith('/auth/login'))d={accessToken:'fixture_bearer',expiresIn:3600};
  else if(url.pathname.endsWith('/init-transaction')){latest={...JSON.parse(options.body),transactionReference:'MNFY|public|'+transactions.size,paymentStatus:'PENDING',amountPaid:'0.00',currency:'NGN'};transactions.set(latest.paymentReference,latest);d={...latest,checkoutUrl:'https://sdk.monnify.com/checkout/'+latest.paymentReference};}
  else if(url.pathname.endsWith('/query'))d=transactions.get(url.searchParams.get('paymentReference'));
  else d=[...transactions.values()].find(t=>t.transactionReference===decodeURIComponent(url.pathname.split('/').at(-1)));
  assert(d);return Response.json({requestSuccessful:true,responseCode:'0',responseBody:d});
 };
 try{
  const env={NODE_ENV:'test',ADMIN_KEY:'PublicCheckoutFixtureOwner123',STUDIO_RELEASE_WORKER_ENABLED:'false',MONNIFY_API_KEY:'MK_PROD_fixture_not_real',MONNIFY_SECRET_KEY:'public_fixture_monnify_secret',MONNIFY_CONTRACT_CODE:'1000000001',MONNIFY_BASE_URL:'https://api.monnify.com'};
  let app=await runtime({pool,env});await require('./artist-launch-fixture.cjs').filledPromotion(pool);await pool.query("INSERT INTO currency_rate_snapshots(id,source,as_of,next_update,rates) VALUES($1,'exchangerate-api',NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 day',$2)",[key(),JSON.stringify({USD:'1',NGN:'1350'})]);
  const api=async(path,body,cookie)=>{const r=await app.request(path,{method:body===undefined?'GET':'POST',body,headers:{...(cookie?{cookie}:{}),'idempotency-key':key(),'content-type':'application/json'}});assert(r.status<300,r.text);return {data:r.json(),cookie:[r.headers['set-cookie']||[]].flat().map(s=>s.split(';')[0]).join('; ')};};
  const buyer=await api('/api/listener/register',{name:'Public Premium Buyer',email:'buyer@public.invalid',password:'PublicFixturePass123',confirmPassword:'PublicFixturePass123'}),artist=await api('/api/register',{name:'Public Artist',email:'artist@public.invalid',country:'Nigeria',plan:'starter',password:'PublicFixturePass123',confirmPassword:'PublicFixturePass123'}),admin=await api('/api/admin/login',{password:env.ADMIN_KEY});
  const proof=await api('/api/platform/admin/monnify/checkout',{role:'listener',email:'buyer@public.invalid',plan:'monthly',confirm_real_payment:true},admin.cookie);latest.paymentStatus='PAID';latest.amountPaid=latest.amount;await api('/api/platform/admin/monnify/verify',{role:'listener',attempt_id:proof.data.checkout.id},admin.cookie);
  // The disposable database uses its own genuinely fulfilled fixture receipt.
  Object.assign(policy,{public_enabled:true,live_acceptance_confirmed:true,successful_payment_reference:proof.data.checkout.reference});app=await runtime({pool,env});
  server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const b of req)chunks.push(b);const raw=Buffer.concat(chunks),r=await app.request(req.url,{method:req.method,headers:req.headers,...(raw.length?{body:raw}:{})});res.writeHead(r.status,r.headers);res.end(r.body);}catch{res.writeHead(500);res.end('Fixture failure');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;browser=await launchBrowser();
  for(const width of [390,1440])for(const role of ['listener','artist']){
   const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'}),account=role==='listener'?buyer:artist;await context.addCookies(account.cookie.split('; ').map(s=>{const i=s.indexOf('=');return {name:s.slice(0,i),value:s.slice(i+1),url:origin};}));
   await context.route('https://sdk.monnify.com/checkout/**',async route=>{const transaction=transactions.get(new URL(route.request().url()).pathname.split('/').at(-1));assert(transaction);const callback=new URL(transaction.redirectUrl);await route.fulfill({contentType:'text/html',body:'<a href="'+origin+callback.pathname+callback.search+'">Finish fixture payment</a>'});});
   const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
   let created;
   if(role==='listener'){
    await page.goto(origin+'/premium');await page.locator('[data-premium-plan="monthly"]').click();await page.locator('#action-dialog').getByRole('button',{name:'Continue to payment',exact:true}).click();
    await page.locator('#action-dialog').getByRole('heading',{name:'Your payment options.',exact:true}).waitFor();await page.locator('#action-dialog').getByRole('button',{name:'Review final payment amount',exact:true}).click();const [response]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/api/platform/premium/checkout'&&r.request().method()==='POST'),page.locator('#action-dialog').getByRole('button',{name:'Continue to payment',exact:true}).click()]);assert.equal(response.status(),200);created=await response.json();
   }else{
    const order=await api('/api/platform/purchases',{kind:'artist_subscription',plan:'starter'},account.cookie);await page.goto(origin+'/workspace?tab=purchases');await page.locator('[data-review-checkout="'+order.data.order.id+'"]').click();await page.locator('#action-dialog').getByRole('button',{name:'Review exact payment amount',exact:true}).click();const [response]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/api/platform/checkout'&&r.request().method()==='POST'),page.locator('#action-dialog').getByRole('button',{name:'Continue to payment',exact:true}).click()]);assert.equal(response.status(),202);created=(await response.json()).checkout;
   }
   const transaction=transactions.get(created.reference),orderId=transaction.metaData.lae_order_id;
   assert.equal((await pool.query('SELECT 1 FROM '+(role==='listener'?'premium_receipts':'commerce_receipts')+' WHERE order_id=$1',[orderId])).rowCount,0,'Opening checkout cannot activate a purchase');
   const popup=await Promise.all([context.waitForEvent('page'),page.locator('a[href="https://sdk.monnify.com/checkout/'+created.reference+'"]').first().click()]).then(r=>r[0]);popup.setDefaultTimeout(15000);await popup.getByRole('link',{name:'Finish fixture payment',exact:true}).waitFor();transaction.paymentStatus='PAID';transaction.amountPaid=transaction.amount;await popup.getByRole('link',{name:'Finish fixture payment',exact:true}).click();
   if(role==='listener')await popup.getByRole('heading',{name:'Welcome to Premium.',exact:true}).waitFor();else await popup.getByRole('heading',{name:'Every purchase, in view.',exact:true}).waitFor();
   assert.equal((await pool.query('SELECT 1 FROM '+(role==='listener'?'premium_receipts':'commerce_receipts')+' WHERE order_id=$1',[orderId])).rowCount,1,'Only server verification can activate the owned purchase');assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await context.close();console.log('PASS public '+role+' '+width+'px: exact NGN checkout, pending has no benefit, hosted return independently verifies and activates once without an admin click or webhook');
  }
 }finally{Object.assign(policy,savedPolicy);global.fetch=original;await browser?.close();if(server)await new Promise(r=>server.close(r));await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
