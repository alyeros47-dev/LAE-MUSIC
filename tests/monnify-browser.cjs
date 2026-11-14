'use strict';
const target=require('./ci-database.cjs').ciDatabase();
const assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http'),{Pool}=require('pg');
const {runtime}=require('./runtime.cjs'),{launchBrowser}=require('./browser-engine.cjs');
(async()=>{
 const control=new Pool({connectionString:target.href}),schema='monnify_ui_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});
 const original=global.fetch,policy=require('../config/monnify-payments.json'),savedPolicy={...policy};Object.assign(policy,{public_enabled:false,live_acceptance_confirmed:false,successful_payment_reference:''});let browser,server,initiations=0,paid=false,transaction;
 global.fetch=async(url,options={})=>{assert(String(url).startsWith('https://api.monnify.com/api/'));let body;
  if(url.endsWith('/auth/login'))body={accessToken:'fixture_access_token',expiresIn:3600};
  else if(url.endsWith('/init-transaction')){initiations++;transaction={...JSON.parse(options.body),transactionReference:'MNFY|ui|'+initiations};body={...transaction,checkoutUrl:'https://sdk.monnify.com/checkout/fixture'};}
  else body={...transaction,paymentStatus:paid?'PAID':'PENDING',amountPaid:paid?transaction.amount:'0.00',currency:'NGN'};
  return Response.json({requestSuccessful:true,responseCode:'0',responseBody:body});};
 try{
  const env={NODE_ENV:'test',ADMIN_KEY:'MonnifyBrowserFixtureOnly123',STUDIO_RELEASE_WORKER_ENABLED:'false',MONNIFY_API_KEY:'MK_PROD_fixture_not_real',MONNIFY_SECRET_KEY:'monnify_browser_fixture_secret',MONNIFY_CONTRACT_CODE:'1000000001',MONNIFY_BASE_URL:'https://api.monnify.com'};
  const app=await runtime({pool,env});await pool.query("INSERT INTO currency_rate_snapshots(id,source,as_of,next_update,rates) VALUES($1,'exchangerate-api',NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 day',$2)",[crypto.randomUUID(),JSON.stringify({USD:'1',NGN:'1500'})]);
  const listener=await app.request('/api/listener/register',{method:'POST',body:{name:'Browser Buyer',email:'browser@monnify.invalid',country:'Nigeria',password:'MonnifyBrowserPass123',confirmPassword:'MonnifyBrowserPass123'}});assert.equal(listener.status,201);
  const login=await app.request('/api/admin/login',{method:'POST',body:{password:env.ADMIN_KEY}});assert.equal(login.status,200);
  server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const b of req)chunks.push(b);const bytes=Buffer.concat(chunks),r=await app.request(req.url,{method:req.method,headers:req.headers,...(bytes.length?{body:bytes}:{})});res.writeHead(r.status,r.headers);res.end(r.body);}catch{res.writeHead(500);res.end('Fixture request failed');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;browser=await launchBrowser();
  for(const width of [390,1440]){
   paid=false;const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
   const cookies=[login.headers['set-cookie']||[]].flat().map(x=>x.split(';')[0]);await context.addCookies(cookies.map(v=>{const i=v.indexOf('=');return {name:v.slice(0,i),value:v.slice(i+1),url:origin};}));
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/admin/console?section=monnify');await page.getByRole('heading',{name:'Monnify payment test',exact:true}).waitFor();
   await page.getByLabel('Existing account email').fill('browser@monnify.invalid');await page.getByLabel('This opens a real payment. Check the amount before paying.').check();await page.getByRole('button',{name:'Prepare payment',exact:true}).click();const pay=page.getByRole('link',{name:'Open Monnify payment',exact:true});await pay.waitFor();assert.equal(await pay.getAttribute('href'),'https://sdk.monnify.com/checkout/fixture');assert.equal(initiations,width===390?1:2);await page.getByRole('heading',{name:/900/}).waitFor();assert.equal((await pool.query('SELECT 1 FROM premium_entitlements')).rowCount,width===390?0:1);
   // A signed server lookup is still needed; this only exercises mocked network.
   paid=true;await page.getByRole('button',{name:'Check payment',exact:true}).click();await page.getByText('Payment verified. The purchased service is active.',{exact:true}).waitFor();assert.equal((await pool.query('SELECT 1 FROM premium_entitlements')).rowCount,width===390?1:2);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));console.log('PASS private Monnify checkout, exact NGN total and independently verified mock activation at '+width);await context.close();
  }
  const publicPage=await browser.newPage();await publicPage.goto(origin+'/premium');await publicPage.getByRole('heading',{name:/Premium/}).first().waitFor();assert.equal(await publicPage.getByRole('link',{name:'Open Monnify payment',exact:true}).count(),0);console.log('PASS Monnify remains unavailable to public visitors. No real payment or real API request.');
 }finally{Object.assign(policy,savedPolicy);global.fetch=original;await browser?.close();if(server)await new Promise(r=>server.close(r));await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
})().catch(error=>{console.error(error);process.exitCode=1;});
