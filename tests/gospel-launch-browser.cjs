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
  let unavailable=false,listenerSignedIn=false,uploadPlanActive=false,reviewUploadAccess=false,uploadStorageAvailable=false,artistTestAccess=false,createdTask=false,failNextAudioPut=false,uploadReserved=false;
  const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/api/**',async route=>{
   const request=route.request(),p=new URL(request.url()).pathname,data=request.method()==='POST'?request.postDataJSON():{};calls.push({p,data});
   const send=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   if(p==='/api/platform/currencies')return send(require('../lib/currency').options());
   if(p==='/api/platform/pricing')return send({country:'NG',currency:'USD',base_currency:'USD',plans:[]});
   if(p==='/api/platform/session')return send({artist:{id:7,display_name:'Gospel test artist',country:'NG'},listener:listenerSignedIn?{id:8,display_name:'Historical Premium listener'}:null,admin:false});
   if(p==='/api/artist/studio-allowance')return send({active:true,included_generations:2,remaining_generations:2});
   if(p==='/api/platform/capabilities')return send({music_provider_configured:!unavailable,lyrics_configured:!unavailable,studio_release_import:false,voice_upload_available:false,payments:false,payment_mode:'sandbox',payouts:false,review_tools:false,affiliate_demo:true,offline_listening:false});
   if(p==='/api/platform/account/capabilities')return send({email_delivery_enabled:false});
   if(p==='/api/plans')return send({plans:require('../lib/plans')});
   if(p==='/api/artist/subscription')return send({artist_features_active:uploadPlanActive,review_test_access:reviewUploadAccess,artist_test_access:artistTestAccess,plan:'starter',uploads_used:0,upload_limit:7,subscription:null});
   if(p==='/api/music/status')return send({uploadsEnabled:uploadStorageAvailable});
   if(p==='/api/platform/financial-policy')return send(require('../lib/financial-policy').disclosure());
   if(p==='/api/platform/finance')return send({balances:{USD:{available_minor:0,held_minor:0},NGN:{available_minor:0}},legacy_gift_kobo:0,withdrawals:[],history:[],notice:'Verified records only.'});
   if(p==='/api/platform/premium/complaints')return send({complaints:[]});
   if(p==='/api/platform/premium/status')return send({active:false,current:null,activity:{premium_streams:0},orders:[{id:'owned_history_123',plan:'Monthly Premium',amount_minor:60,currency:'USD',mode:'sandbox',verified_at:'2026-01-01T00:00:00Z',reference:'historic-owned-order-ref',checkout_url:'https://checkout.paystack.com/old-test',attempt_id:'historic_attempt_123'}],entitlements:[]});
   if(p==='/api/platform/premium/plans')return send({...require('../lib/premium-pricing').catalog(),providers:[],price_status:'approved'});
   if(p==='/api/platform/partners/practice')return send({demo:true,products:['starter','growth','professional'].map(require('../lib/partner-practice').quote),simulation_products:require('../lib/partner-demo').products(),sales:[],disclosure:require('../lib/partner-practice').disclosure});
   if(p==='/api/platform/partners/practice/preview')return send(require('../lib/partner-demo').preview(data));
   if(p==='/api/affiliate/earnings')return send({totals:[],history:[]});
   if(p==='/api/affiliate/product-links')return send({links:{}});
   if(p==='/api/platform/partners-overview')return send({monthly:[]});
   if(p==='/api/platform/affiliate-premium')return send({commissions:[],notice:'Verified records only.'});
   if(p==='/api/platform/partners/accounting')return send({unavailable:true});
   if(p==='/api/voice/profile')return send({status:'none',hasVoice:false});
   if(p==='/api/artist/studio-history')return send({generations:createdTask?[{generation_reference:'browser_gospel_task_123',created_at:new Date().toISOString(),status:'succeeded',funding_source:'recorded'}]:[]});
   if(p==='/api/generation/wallet')return send({credits:2});
   if(p==='/api/generation/history')return send({records:[]});
   if(p==='/api/platform/studio/catalog')return send(require('../lib/studio-launch').legacyCatalogue());
   if(p==='/api/platform/studio/dna/catalog')return send(catalogue);
   if(p==='/api/generation/code/check')return send({valid:true,resumable:uploadReserved,title:'My original prayer'});
   if(p==='/api/music/upload/start'){const resumed=uploadReserved;uploadReserved=true;return send({id:'upload-fixture-1',resumed,audio_already_stored:resumed});}
   if(p==='/api/music/upload/file'){if(failNextAudioPut&&new URL(request.url()).searchParams.get('kind')==='cover'){failNextAudioPut=false;return route.abort('failed');}return send({saved:true});}
   if(p==='/api/music/upload/finish')return send({published:true});
   if(p==='/api/platform/artist-overview')return send({tracks:[],stats:{published:0,plays:0,followers:0}});
   if(p==='/api/music/sonic/create'){createdTask=true;assert.equal(data.creationMode,'own');assert.equal(data.rightsConfirmed,true);assert(request.headers()['idempotency-key']);return send({task_id:'browser_gospel_task_123',status:'pending'});}
   if(p==='/api/music/sonic/status')return send({task_id:'browser_gospel_task_123',status:'succeeded',songs:[{clip_id:'browser_gospel_clip_123',title:'My original prayer',audio_url:origin+'/mock.mp3'}]});
   if(p==='/api/music/sonic/upload-code')return send({uploadCode:'A'.repeat(36),title:'My original prayer'});
   return send({});
  });
  await page.goto(origin+'/studio');await page.getByLabel('Creation method').waitFor({timeout:10000}).catch(async e=>{console.error('UI diagnostics',errors,await page.locator('main').innerText());throw e;});
  assert.equal(await page.locator('#lyrics-studio-form [name="musicDnaDepartment"] option').count(),2);
  const lyricsType=page.getByLabel('Lyrics Type (optional)',{exact:true});assert.equal(await lyricsType.locator('option').count(),18);assert.equal(await lyricsType.inputValue(),'');await lyricsType.selectOption('personal-testimony');await page.reload();await page.getByLabel('Creation method').waitFor();assert.equal(await lyricsType.inputValue(),'personal-testimony');
  assert.equal(await page.getByLabel('Music department',{exact:true}).inputValue(),'gospel');assert(await page.locator('#lyrics-studio-form [name=musicDnaGroup]').evaluate(x=>x.required));assert(await page.locator('#lyrics-studio-form [name=musicProfile]').isDisabled());
  await page.getByLabel('Music department',{exact:true}).selectOption('gospel');
  assert.equal(await page.locator('#lyrics-studio-form [name="musicDnaGroup"] option').count(),15);
  for(const group of catalogue.categories){await page.getByLabel('Music group',{exact:true}).selectOption(group.id);assert.equal(await page.locator('#lyrics-studio-form [name="musicDnaStyle"] option').count(),6);}
  for(const text of ['Secular music','Western & International Music','Also explore Reggae Gospel'])assert.equal(await page.getByText(text,{exact:true}).count(),0);
  await page.getByLabel('Creation method').selectOption('own');assert(await page.locator('[data-ai-creation]').isHidden());assert(await lyricsType.isHidden());
  await page.locator('#studio-form [name=musicDnaGroup]').selectOption('gospel-g1');await page.getByLabel('Gospel individual style',{exact:true}).selectOption('G1-01');
  await page.locator('#studio-form [name="musicDnaMood"]').selectOption('energetic');await page.getByLabel('Lead voice',{exact:true}).selectOption('female');await page.getByLabel('Lyrics languages',{exact:true}).selectOption(['en','yo']);
  await page.getByLabel('Song title for music',{exact:true}).fill('My original prayer');await page.getByLabel('Song lyrics',{exact:true}).fill('These are my original words of prayer and gratitude to God.');
  assert(await page.getByLabel('Song style & arrangement',{exact:true}).isDisabled());
  const before=calls.filter(c=>c.p==='/api/music/sonic/create').length;await page.getByRole('button',{name:/Generate music/}).click();assert.equal(calls.filter(c=>c.p==='/api/music/sonic/create').length,before);
  await page.getByRole('checkbox',{name:/I have permission to use these lyrics/}).check();await page.getByRole('button',{name:/Generate music/}).click();await page.getByLabel('Upload code for My original prayer',{exact:true}).waitFor();
  let sent=calls.filter(c=>c.p==='/api/music/sonic/create').at(-1).data;assert.equal(sent.musicDnaStyle,'G1-01');assert.deepEqual(sent.musicDnaLanguages,['en','yo']);
  await page.getByLabel('Upload code for My original prayer',{exact:true}).waitFor();
  const createdBeforeRefresh=calls.filter(c=>c.p==='/api/music/sonic/create').length;
  await page.reload();await page.getByLabel('Upload code for My original prayer',{exact:true}).waitFor();
  assert.equal(calls.filter(c=>c.p==='/api/music/sonic/create').length,createdBeforeRefresh);
  await page.evaluate(()=>localStorage.setItem('lae_last_generation:7','another_artists_task'));
  await page.reload();await page.getByLabel('Upload code for My original prayer',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('lae_last_generation:7')),'browser_gospel_task_123');
  await page.getByRole('button',{name:'Prepare a new generation',exact:true}).click();
  await page.waitForURL(/create=new/);await page.getByLabel('Creation method').waitFor();assert(await page.locator('#generation-result').isHidden());
  await page.getByRole('button',{name:'Check progress & previews',exact:true}).click();await page.getByLabel('Upload code for My original prayer',{exact:true}).waitFor();
  assert.equal(new URL(page.url()).searchParams.has('create'),false);await page.reload();await page.getByLabel('Upload code for My original prayer',{exact:true}).waitFor();
  assert.equal(calls.filter(c=>c.p==='/api/music/sonic/create').length,createdBeforeRefresh);
  await page.getByRole('link',{name:'Upload this song ↗',exact:true}).click();
  await page.getByLabel('Generated-song upload code',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Generated-song upload code',{exact:true}).inputValue(),'A'.repeat(36));
  assert.equal(await page.getByLabel('Song title',{exact:true}).inputValue(),'My original prayer');
  for(const name of ['audio','cover'])assert(await page.locator('#upload-form [name='+name+']').isVisible());
  assert(await page.getByRole('button',{name:'Upload & publish',exact:true}).isDisabled());
  assert((await page.locator('#upload-access-status').innerText()).includes('storage'));
  uploadStorageAvailable=true;await page.reload();await page.locator('#upload-form').waitFor();
  assert((await page.locator('#upload-access-status').innerText()).includes('active artist package'));
  assert(await page.getByRole('button',{name:'Upload & publish',exact:true}).isDisabled());
  assert.equal(calls.filter(c=>c.p==='/api/music/upload/start').length,results.length*4);
  // Active paid and explicitly granted review access both retain the file controls.
  for(const access of ['paid','review','complimentary']){
   uploadPlanActive=access==='paid';reviewUploadAccess=access==='review';artistTestAccess=access==='complimentary';uploadReserved=false;failNextAudioPut=access==='complimentary';
   await page.reload();await page.locator('#upload-form').waitFor();
   if(artistTestAccess){
    await page.getByLabel('Generated-song upload code',{exact:true}).fill('');assert(await page.getByRole('button',{name:'Upload & publish',exact:true}).isDisabled());
    await page.getByLabel('Generated-song upload code',{exact:true}).fill('not-a-code');assert(await page.getByRole('button',{name:'Upload & publish',exact:true}).isDisabled());
    await page.getByLabel('Generated-song upload code',{exact:true}).fill('a'.repeat(36));assert(await page.getByRole('button',{name:'Upload & publish',exact:true}).isEnabled());
   }
   await page.getByLabel('Genre',{exact:true}).fill('Gospel');
   await page.locator('#upload-form [name=audio]').setInputFiles({name:'prayer.mp3',mimeType:'audio/mpeg',buffer:Buffer.alloc(2048,1)});
   await page.locator('#upload-form [name=cover]').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:Buffer.from('fixture-cover')});
   await page.locator('#upload-form [name=rights]').check();
   assert(await page.getByRole('button',{name:'Upload & publish',exact:true}).isEnabled());
   const generationsBeforeUpload=calls.filter(c=>c.p==='/api/music/sonic/create').length;
   await page.getByRole('button',{name:'Upload & publish',exact:true}).click();
   if(artistTestAccess){
    await page.locator('#upload-form .form-status').getByText(/Your song and code are preserved/).waitFor();
    assert.equal((await page.getByLabel('Generated-song upload code',{exact:true}).inputValue()).toUpperCase(),'A'.repeat(36));
    await page.getByRole('button',{name:'Upload & publish',exact:true}).click();
   }
   await page.getByRole('heading',{name:'Your music catalog',exact:true}).waitFor();
   assert.equal(calls.filter(c=>c.p==='/api/music/sonic/create').length,generationsBeforeUpload);
   assert.equal(calls.filter(c=>c.p==='/api/music/upload/start').at(-1).data.uploadCode,'A'.repeat(36));
   await page.goto(origin+'/workspace?tab=upload');await page.locator('#upload-form').waitFor();
  }
  assert.equal(calls.filter(c=>c.p==='/api/music/upload/finish').length,(results.length+1)*3);
  assert.equal(calls.filter(c=>c.p==='/api/music/upload/file').length,(results.length+1)*7);
  const uploadAxe=await new AxeBuilder({page}).analyze();assert.deepEqual(uploadAxe.violations.map(v=>v.id),[]);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/upload-form-'+viewport.width+'.png',fullPage:true});
  uploadPlanActive=false;reviewUploadAccess=false;artistTestAccess=false;uploadStorageAvailable=false;
  await page.goto(origin+'/studio');await page.getByLabel('Creation method').waitFor();
  await page.getByRole('checkbox',{name:/I have permission to use these lyrics/}).check();
  await page.getByLabel('Music direction',{exact:true}).selectOption('custom');await page.getByLabel('Song style & arrangement',{exact:true}).fill('Christian praise with traditional Ogene percussion and warm acoustic guitar.');await page.locator('#studio-form [name="musicDnaMood"]').selectOption('smooth');
  await page.getByRole('button',{name:/Generate music/}).click();await page.waitForFunction(()=>!document.querySelector('#studio-form button[type=submit]').disabled);sent=calls.filter(c=>c.p==='/api/music/sonic/create').at(-1).data;assert.equal(sent.musicDnaStyle,'');assert(sent.style.includes('Ogene'));
  assert.equal(calls.filter(c=>c.p==='/api/music/lyrics-generate').length,0);
  await page.reload();await page.getByLabel('Creation method').waitFor();assert.equal(await page.getByLabel('Creation method').inputValue(),'own');assert.equal(await page.getByLabel('Music direction',{exact:true}).inputValue(),'custom');assert((await page.getByLabel('Song lyrics',{exact:true}).inputValue()).includes('original words'));
  const axe=await new AxeBuilder({page}).analyze();assert.deepEqual(axe.violations.map(v=>({id:v.id,impact:v.impact})),[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  assert(await page.locator('#studio-voice').isHidden());assert.equal(await page.locator('#lyrics-studio-form option[value=custom]').count(),0);assert(await page.locator('[data-studio-custom-direction]').isHidden());
  unavailable=true;await page.reload();await page.getByLabel('Creation method').waitFor({state:'attached'});assert(await page.locator('[data-ai-creation]').isHidden());assert(await page.locator('.music-studio-panel').isHidden());assert(await page.getByLabel('Creation method').isHidden());
  await page.goto(origin+'/workspace?tab=plans');await page.getByRole('heading',{name:'Your music. Your pace.',exact:true}).waitFor();assert.equal(await page.locator('[data-plan]:visible').count(),0);assert.equal(await page.getByRole('button',{name:/Checkout unavailable|Save unpaid purchase/}).count(),0);
  await page.goto(origin+'/workspace?tab=finance');await page.getByRole('heading',{name:'Your ledger',exact:true}).waitFor();assert(await page.locator('#withdraw-form').isHidden());
  await page.goto(origin+'/workspace?tab=upload');await page.locator('#upload-form').waitFor({state:'attached'});assert(await page.locator('#upload-form').isVisible());assert(await page.locator('#upload-form [name=audio]').isVisible());assert(await page.locator('#upload-form [name=cover]').isVisible());assert(await page.getByRole('button',{name:'Upload & publish',exact:true}).isDisabled());
  await page.goto(origin+'/premium');await page.getByRole('heading',{name:'Your music stays yours.',exact:true}).waitFor();assert.equal(await page.locator('[data-premium-plan]:visible').count(),0);assert.equal(await page.locator('[data-feature=offline_save]:visible').count(),0);
  await page.goto(origin+'/partners');await page.getByRole('link',{name:'Test referrals with demo payments',exact:true}).click();
  await page.getByRole('heading',{name:'Follow the referral. Check the numbers.',exact:true}).waitFor();
  const demoForm=page.locator('#partner-demo-form');await demoForm.locator('[name=product]').selectOption('artist:professional');await demoForm.locator('[name=payment_state]').selectOption('verified');
  await page.getByRole('button',{name:'Run demo payment example',exact:true}).click();await page.locator('#partner-demo-result').getByText('$2.00',{exact:true}).first().waitFor();
  await demoForm.locator('[name=product]').selectOption('premium:monthly');await page.getByRole('button',{name:'Run demo payment example',exact:true}).click();await page.locator('#partner-demo-result').getByText('$0.03',{exact:true}).first().waitFor();
  await demoForm.locator('[name=payment_state]').selectOption('full_refund');await page.getByRole('button',{name:'Run demo payment example',exact:true}).click();await page.locator('#partner-demo-result').getByText(/assumed approved refund/).filter({hasText:'$0.60'}).waitFor();
  assert((await page.locator('#partner-demo-result').innerText()).includes('No payment was received'));
  const demoAxe=await new AxeBuilder({page}).analyze();assert.deepEqual(demoAxe.violations.map(v=>v.id),[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.getByRole('link',{name:'Open saved direct-sale examples',exact:true}).click();await page.locator('#partner-practice-form').waitFor();assert.deepEqual(errors,[]);

  listenerSignedIn=true;await page.goto(origin+'/premium');await page.getByText('historic-owned-order-ref',{exact:true}).waitFor();assert(await page.locator('.sidebar a[href="/premium"]').isVisible());assert(await page.getByRole('button',{name:'Submit a payment complaint',exact:true}).isVisible());assert.equal(await page.locator('[data-feature=checkout]:visible').count(),0);
  listenerSignedIn=false;

  await page.goto(origin+'/recover');await page.locator('#account-recovery-form').waitFor({state:'attached'});assert(await page.locator('#account-recovery-form').isHidden());
  await page.goto(origin+'/join');await page.locator('#auth-form').waitFor();assert(await page.locator('a[href^="/recover"]').isHidden());
  fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/gospel-phase-one-'+viewport.width+'.png',fullPage:true});results.push({width:viewport.width,groups:14,styles:70,own_lyrics_dna:true,own_lyrics_custom:true,rights_gate:true,upload_code:true,upload_audio_and_cover:true,upload_access_gates:true,upload_mocked_publish:true,draft_restored:true,axe_violations:0,inactive_customer_features_hidden:true,historical_premium_records_preserved:true});await context.close();
 }}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
 console.log(JSON.stringify({status:'passed',viewports:results,paid_calls:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
