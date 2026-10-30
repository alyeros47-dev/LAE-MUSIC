'use strict';
// Actual application UI on loopback; every external/provider request is intercepted.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http');
const {runtime}=require('./runtime.cjs'),{launchBrowser}=require('./browser-engine.cjs');
const AxeBuilder=require('@axe-core/playwright').default;
(async()=>{
 const app=await runtime(),browser=await launchBrowser();
 const server=http.createServer(async(req,res)=>{const r=await app.request(req.url);res.writeHead(r.status,r.headers);res.end(r.body);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const catalogue=require('../lib/studio-launch').catalogue(),calls=[],results=[];
 try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  let unavailable=false;
  const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/api/**',async route=>{
   const request=route.request(),p=new URL(request.url()).pathname,data=request.method()==='POST'?request.postDataJSON():{};calls.push({p,data});
   const send=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   if(p==='/api/platform/currencies')return send(require('../lib/currency').options());
   if(p==='/api/platform/pricing')return send({country:'NG',currency:'USD',base_currency:'USD',plans:[]});
   if(p==='/api/platform/session')return send({artist:{id:7,display_name:'Gospel test artist',country:'NG'},listener:null,admin:false});
   if(p==='/api/artist/studio-allowance')return send({active:true,included_generations:2,remaining_generations:2});
   if(p==='/api/platform/capabilities')return send({music_provider_configured:!unavailable,lyrics_configured:!unavailable,studio_release_import:false,voice_upload_available:false,payments:false,payment_mode:'sandbox',payouts:false,review_tools:false,offline_listening:false});
   if(p==='/api/platform/account/capabilities')return send({email_delivery_enabled:false});
   if(p==='/api/plans')return send({plans:require('../lib/plans')});
   if(p==='/api/artist/subscription')return send({artist_features_active:false,plan:'starter',uploads_used:0,upload_limit:7,subscription:null});
   if(p==='/api/music/status')return send({uploadsEnabled:false});
   if(p==='/api/platform/financial-policy')return send(require('../lib/financial-policy').disclosure());
   if(p==='/api/platform/finance')return send({balances:{USD:{available_minor:0,held_minor:0},NGN:{available_minor:0}},legacy_gift_kobo:0,withdrawals:[],history:[],notice:'Verified records only.'});
   if(p==='/api/platform/premium/plans')return send({...require('../lib/premium-pricing').catalog(),providers:[],price_status:'approved'});
   if(p==='/api/affiliate/earnings')return send({totals:[],history:[]});
   if(p==='/api/affiliate/product-links')return send({links:{}});
   if(p==='/api/platform/partners-overview')return send({monthly:[]});
   if(p==='/api/platform/affiliate-premium')return send({commissions:[],notice:'Verified records only.'});
   if(p==='/api/platform/partners/accounting')return send({unavailable:true});
   if(p==='/api/voice/profile')return send({status:'none',hasVoice:false});
   if(p==='/api/artist/studio-history')return send({generations:[]});
   if(p==='/api/generation/wallet')return send({credits:2});
   if(p==='/api/generation/history')return send({records:[]});
   if(p==='/api/platform/studio/catalog')return send(require('../lib/studio-launch').legacyCatalogue());
   if(p==='/api/platform/studio/dna/catalog')return send(catalogue);
   if(p==='/api/music/sonic/create'){assert.equal(data.creationMode,'own');assert.equal(data.rightsConfirmed,true);assert(request.headers()['idempotency-key']);return send({task_id:'browser_gospel_task_123',status:'pending'});}
   if(p==='/api/music/sonic/status')return send({task_id:'browser_gospel_task_123',status:'succeeded',songs:[{clip_id:'browser_gospel_clip_123',title:'My original prayer',audio_url:origin+'/mock.mp3'}]});
   if(p==='/api/music/sonic/upload-code')return send({uploadCode:'A'.repeat(36),title:'My original prayer'});
   return send({});
  });
  await page.goto(origin+'/studio');await page.getByLabel('Creation method').waitFor({timeout:10000}).catch(async e=>{console.error('UI diagnostics',errors,await page.locator('main').innerText());throw e;});
  assert.equal(await page.locator('#lyrics-studio-form [name="musicDnaDepartment"] option').count(),2);
  await page.getByLabel('Music department',{exact:true}).selectOption('gospel');
  assert.equal(await page.locator('#lyrics-studio-form [name="musicDnaGroup"] option').count(),15);
  for(const group of catalogue.categories){await page.getByLabel('Music group',{exact:true}).selectOption(group.id);assert.equal(await page.locator('#lyrics-studio-form [name="musicDnaStyle"] option').count(),6);}
  for(const text of ['Secular music','Western & International Music','Also explore Reggae Gospel'])assert.equal(await page.getByText(text,{exact:true}).count(),0);
  await page.getByLabel('Creation method').selectOption('own');assert(await page.locator('[data-ai-creation]').isHidden());
  await page.locator('#studio-form [name=musicDnaGroup]').selectOption('gospel-g1');await page.getByLabel('Gospel individual style',{exact:true}).selectOption('G1-01');
  await page.locator('#studio-form [name="musicDnaMood"]').selectOption('energetic');await page.getByLabel('Lead voice',{exact:true}).selectOption('female');await page.getByLabel('Lyrics languages',{exact:true}).selectOption(['en','yo']);
  await page.getByLabel('Song title for music',{exact:true}).fill('My original prayer');await page.getByLabel('Song lyrics',{exact:true}).fill('These are my original words of prayer and gratitude to God.');
  assert(await page.getByLabel('Song style & arrangement',{exact:true}).isDisabled());
  const before=calls.filter(c=>c.p==='/api/music/sonic/create').length;await page.getByRole('button',{name:/Generate music/}).click();assert.equal(calls.filter(c=>c.p==='/api/music/sonic/create').length,before);
  await page.getByRole('checkbox',{name:/I have permission to use these lyrics/}).check();await page.getByRole('button',{name:/Generate music/}).click();await page.getByRole('button',{name:'Get upload code',exact:true}).waitFor();
  let sent=calls.filter(c=>c.p==='/api/music/sonic/create').at(-1).data;assert.equal(sent.musicDnaStyle,'G1-01');assert.deepEqual(sent.musicDnaLanguages,['en','yo']);
  await page.getByRole('button',{name:'Get upload code',exact:true}).click();await page.getByLabel('Upload code for My original prayer',{exact:true}).waitFor();
  await page.getByLabel('Music direction',{exact:true}).selectOption('custom');await page.getByLabel('Song style & arrangement',{exact:true}).fill('Christian praise with traditional Ogene percussion and warm acoustic guitar.');await page.locator('#studio-form [name="musicDnaMood"]').selectOption('smooth');
  await page.getByRole('button',{name:/Generate music/}).click();await page.waitForFunction(()=>!document.querySelector('#studio-form button[type=submit]').disabled);sent=calls.filter(c=>c.p==='/api/music/sonic/create').at(-1).data;assert.equal(sent.musicDnaStyle,'');assert(sent.style.includes('Ogene'));
  assert.equal(calls.filter(c=>c.p==='/api/music/lyrics-generate').length,0);
  await page.reload();await page.getByLabel('Creation method').waitFor();assert.equal(await page.getByLabel('Creation method').inputValue(),'own');assert.equal(await page.getByLabel('Music direction',{exact:true}).inputValue(),'custom');assert((await page.getByLabel('Song lyrics',{exact:true}).inputValue()).includes('original words'));
  const axe=await new AxeBuilder({page}).analyze();assert.deepEqual(axe.violations.map(v=>({id:v.id,impact:v.impact})),[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  assert(await page.locator('#studio-voice').isHidden());assert.equal(await page.locator('#lyrics-studio-form option[value=custom]').count(),0);assert(await page.locator('[data-studio-custom-direction]').isHidden());
  unavailable=true;await page.reload();await page.getByLabel('Creation method').waitFor({state:'attached'});assert(await page.locator('[data-ai-creation]').isHidden());assert(await page.locator('.music-studio-panel').isHidden());assert(await page.getByLabel('Creation method').isHidden());
  await page.goto(origin+'/workspace?tab=plans');await page.getByRole('heading',{name:'Your music. Your pace.',exact:true}).waitFor();assert.equal(await page.locator('[data-plan]:visible').count(),0);assert.equal(await page.getByRole('button',{name:/Checkout unavailable|Save unpaid purchase/}).count(),0);
  await page.goto(origin+'/workspace?tab=finance');await page.getByRole('heading',{name:'Your ledger',exact:true}).waitFor();assert(await page.locator('#withdraw-form').isHidden());
  await page.goto(origin+'/workspace?tab=upload');await page.locator('#upload-form').waitFor({state:'attached'});assert(await page.locator('#upload-form').isHidden());
  await page.goto(origin+'/premium');await page.getByRole('heading',{name:'Your music stays yours.',exact:true}).waitFor();assert.equal(await page.locator('[data-premium-plan]:visible').count(),0);assert.equal(await page.locator('[data-feature=offline_save]:visible').count(),0);
  await page.goto(origin+'/partners?mode=demo');await page.getByRole('heading',{name:'Your connections. Real possibility.',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Practice with demo transactions',exact:true}).count(),0);assert.equal(await page.locator('#partner-practice-form').count(),0);
  assert(!calls.some(c=>c.p==='/api/platform/partners/practice'));assert.deepEqual(errors,[]);
  await page.goto(origin+'/recover');await page.locator('#account-recovery-form').waitFor({state:'attached'});assert(await page.locator('#account-recovery-form').isHidden());
  await page.goto(origin+'/join');await page.locator('#auth-form').waitFor();assert(await page.locator('a[href^="/recover"]').isHidden());
  fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/gospel-phase-one-'+viewport.width+'.png',fullPage:true});results.push({width:viewport.width,groups:14,styles:70,own_lyrics_dna:true,own_lyrics_custom:true,rights_gate:true,upload_code:true,draft_restored:true,axe_violations:0,inactive_customer_features_hidden:true});await context.close();
 }}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
 console.log(JSON.stringify({status:'passed',viewports:results,paid_calls:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
