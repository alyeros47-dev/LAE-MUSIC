'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs');
const {runtime,AccountPool}=require('./runtime.cjs'),{launchBrowser}=require('./browser-engine.cjs'),AxeBuilder=require('@axe-core/playwright').default;
class CampaignFixture extends AccountPool{
 constructor(){super();this.config=new Map();this.events=new Map();this.claims=new Set();}
 async query(sql,args=[]){
  const rows=value=>({rows:value,rowCount:value.length});
  if(sql==='SELECT slug,invitation_url,pixel_id FROM community_campaign_settings')return rows([...this.config.values()]);
  if(sql.startsWith('INSERT INTO community_campaign_settings')){if(args.length===3||!this.config.has(args[0]))this.config.set(args[0],{slug:args[0],invitation_url:args[1]||'',pixel_id:args[2]||''});return rows([]);}
  if(sql.startsWith('INSERT INTO community_campaign_daily')){const k=args[0]+args[1],old=this.events.get(k)||{slug:args[0],day:'2026-11-22',attribution:JSON.parse(args[1]),visits:0,clicks:0};old.visits+=args[2];old.clicks+=args[3];this.events.set(k,old);return rows([]);}
  if(sql.startsWith('INSERT INTO community_campaign_clicks')){if(this.claims.has(args[0]))return rows([]);this.claims.add(args[0]);return rows([{token_hash:args[0]}]);}
  if(sql.startsWith('SELECT slug,day,attribution'))return rows([...this.events.values()]);
  if(sql.startsWith('SELECT slug,COALESCE(SUM'))return rows([...this.config.keys()].map(slug=>{const list=[...this.events.values()].filter(r=>r.slug===slug);return {slug,visits:String(list.reduce((n,r)=>n+r.visits,0)),clicks:String(list.reduce((n,r)=>n+r.clicks,0))};}));
  return super.query(sql,args);
 }
}
(async()=>{
 const pool=new CampaignFixture(),secret='campaign-browser-local-fixture-only',app=await runtime({pool,env:{NODE_ENV:'test',ADMIN_KEY:secret}}),browser=await launchBrowser();
 const server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const r=await app.request(req.url,{method:req.method,headers:req.headers,body:Buffer.concat(chunks)});res.writeHead(r.status,r.headers);res.end(r.body);}catch{res.writeHead(500);res.end('Fixture failure');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  for(const width of [360,390,1440]){
   const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/join/creator-network');assert(await page.getByRole('button',{name:'Join WhatsApp Group'}).isDisabled());assert.equal(await page.locator('form').count(),0);
   await page.goto(origin+'/join/gospel-creators');assert(await page.getByText('LAE MUSIC CREATORS',{exact:true}).isVisible());await page.reload();assert.equal(await page.locator('h1').count(),1);
   await context.close();
  }
  const owner=await browser.newContext({viewport:{width:1440,height:1000}}),admin=await owner.newPage();
  const expires=String(Date.now()+3600000),mac=crypto.createHmac('sha256',secret).update('lae-admin:'+expires).digest('hex');await owner.addCookies([{name:'lae_admin',value:expires+'.'+mac,url:origin}]);
  await owner.addInitScript(()=>localStorage.setItem('lae_listening_preferences_v1',JSON.stringify({version:1,selections:[{family:'gospel',genres:['praise']}]})));
  await admin.goto(origin+'/admin/console?section=campaigns');await admin.getByRole('heading',{name:'WhatsApp communities',exact:true}).waitFor();
  const a=admin.locator('form[data-campaign="creator-network"]'),b=admin.locator('form[data-campaign="gospel-creators"]');
  await a.locator('[name=invitation_url]').fill('https://chat.whatsapp.com/CreatorFixture123456789');await a.locator('[name=pixel_id]').fill('123456789012345');await a.getByRole('button',{name:'Save settings'}).click();await a.getByText('Saved.',{exact:true}).waitFor();
  await b.locator('[name=invitation_url]').fill('https://chat.whatsapp.com/OfficialFixture123456789');await b.getByRole('button',{name:'Save settings'}).click();await b.getByText('Saved.',{exact:true}).waitFor();
  await admin.reload();await admin.getByRole('heading',{name:'WhatsApp communities',exact:true}).waitFor();assert.equal(await a.locator('[name=invitation_url]').inputValue(),'https://chat.whatsapp.com/CreatorFixture123456789');
  fs.mkdirSync('artifacts',{recursive:true});await admin.screenshot({path:'artifacts/community-admin.png',fullPage:true});await owner.close();
  for(const width of [360,390,1440]){
   const context=await browser.newContext({viewport:{width,height:950}}),page=await context.newPage(),errors=[];let metaRequests=0;page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://connect.facebook.net/**',r=>{metaRequests++;return r.fulfill({contentType:'application/javascript',body:'/* intercepted Meta fixture; no live advertising request */'});});
   let destination='';
   await page.route('**/join/*/whatsapp?*',async route=>{const response=await route.fetch({maxRedirects:0});assert.equal(response.status(),303);destination=response.headers().location;await route.fulfill({status:200,contentType:'text/html',body:'<h1>Redirect verified without contacting WhatsApp</h1>'});});
   for(const [slug,identity,link] of [['creator-network','CREATOR SUPPORT NETWORK','CreatorFixture123456789'],['gospel-creators','LAE MUSIC CREATORS','OfficialFixture123456789']]){
    await page.goto(origin+'/join/'+slug+'?utm_source=facebook&utm_campaign='+slug+'&fbclid=not-for-reporting');await page.reload();
    assert(await page.getByText(identity,{exact:true}).isVisible());assert.equal(await page.locator('form').count(),0);assert.equal(await page.locator('#audio').count(),0);
    const cta=page.getByRole('link',{name:'Join WhatsApp Group'});assert(await cta.isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(metaRequests,0);const axe=await new AxeBuilder({page}).analyze();assert.deepEqual(axe.violations,[]);
    await page.screenshot({path:'artifacts/community-'+slug+'-'+width+'.png',fullPage:true});
    if(slug==='creator-network'){
     await page.getByRole('button',{name:'Allow',exact:true}).click();await page.waitForFunction(()=>window.fbq?.queue.length>=3);assert.equal(await page.evaluate(()=>window.fbq.queue.some(args=>args[1]==='PageView')),true);assert(!page.url().includes('fbclid'));
    }
    await cta.click();await page.getByRole('heading',{name:'Redirect verified without contacting WhatsApp'}).waitFor();assert.equal(destination,'https://chat.whatsapp.com/'+link);if(slug==='creator-network')metaRequests=0;
   }
   assert.deepEqual(errors,[]);await context.close();console.log('PASS '+width+'px: direct/refreshed routes, exact communities, usable correct destinations, no forms/player, responsive layout, zero accessibility violations, opt-in-only Meta measurement.');
  }
  const final=[...pool.events.values()];assert(final.some(r=>r.slug==='creator-network'&&r.clicks>0));assert(final.some(r=>r.slug==='gospel-creators'&&r.clicks>0));assert(final.every(r=>!JSON.stringify(r.attribution).includes('fbclid')));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
