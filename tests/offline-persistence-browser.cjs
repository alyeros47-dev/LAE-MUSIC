'use strict';
const {createRequire}=require('node:module'),path=require('node:path'),fs=require('node:fs'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
// Actual server, PostgreSQL and browser; only external payment/storage responses are mocked.
const root=path.join(__dirname,'..'),load=createRequire(path.join(root,'server.js')),{Pool}=load('pg'),{runtime}=load('./tests/runtime.cjs'),{launchBrowser}=load('./tests/browser-engine.cjs');
const target=load('./tests/ci-database.cjs').ciDatabase(),key=()=>crypto.randomUUID(),audio=fs.readFileSync(path.join(__dirname,'fixtures/offline-tone.mp3'));
(async()=>{
 const control=new Pool({connectionString:target.href}),schema='saved_journey_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});let browser,server,init=0,storageReads=0,tx;
 const original=global.fetch;global.fetch=async(input,opts={})=>{const url=new URL(input);
  if(url.hostname.endsWith('.r2.cloudflarestorage.com')){storageReads++;assert(url.pathname.endsWith('/fixture.mp3'));return new Response(opts.method==='HEAD'?null:audio,{headers:{'Content-Type':'audio/mpeg','Content-Length':String(audio.length)}});}
  assert.equal(url.hostname,'api.monnify.com');let d;
  if(url.pathname.endsWith('/auth/login'))d={accessToken:'fixture_bearer',expiresIn:3600};
  else if(url.pathname.endsWith('/init-transaction')){init++;tx={...JSON.parse(opts.body),transactionReference:'MNFY|offline|proof'};d={...tx,checkoutUrl:'https://sdk.monnify.com/checkout/fixture'};}
  else d={...tx,paymentStatus:'PAID',amountPaid:tx.amount,currency:'NGN'};
  return Response.json({requestSuccessful:true,responseCode:'0',responseBody:d});
 };
 try{
  const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),env={NODE_ENV:'test',ADMIN_KEY:'OfflineProofOwnerFixture123',STUDIO_RELEASE_WORKER_ENABLED:'false',OFFLINE_LICENSE_PRIVATE_KEY:pair.privateKey.export({format:'pem',type:'pkcs8'}),R2_ACCOUNT_ID:'a'.repeat(32),R2_ACCESS_KEY_ID:'fixture_key',R2_SECRET_ACCESS_KEY:'fixture_secret',R2_BUCKET:'offline-fixture',MONNIFY_API_KEY:'MK_PROD_fixture_not_real',MONNIFY_SECRET_KEY:'offline_fixture_monnify_secret',MONNIFY_CONTRACT_CODE:'1000000001',MONNIFY_BASE_URL:'https://api.monnify.com'};
  const app=await runtime({pool,env});
  await pool.query("INSERT INTO currency_rate_snapshots(id,source,as_of,next_update,rates) VALUES($1,'exchangerate-api',NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 day',$2)",[key(),JSON.stringify({USD:'1',NGN:'1350'})]);
  const api=async(url,body,cookie)=>{const r=await app.request(url,{method:body===undefined?'GET':'POST',body,headers:{...(cookie?{cookie}:{}),'idempotency-key':key(),'content-type':'application/json'}});assert(r.status<300,r.text);return {data:r.json(),cookies:[r.headers['set-cookie']||[]].flat().map(x=>x.split(';')[0]).join('; ')};};
  const listener=await api('/api/listener/register',{name:'Ordinary Paid Listener',email:'ordinary-listener@offline.invalid',country:'Nigeria',password:'OfflineProofPass123',confirmPassword:'OfflineProofPass123'}),admin=await api('/api/admin/login',{password:env.ADMIN_KEY});
  const checkout=await api('/api/platform/admin/monnify/checkout',{role:'listener',email:'ordinary-listener@offline.invalid',plan:'monthly',confirm_real_payment:true},admin.cookies);assert.equal(Number(checkout.data.charge_minor),81000);
  await api('/api/platform/admin/monnify/verify',{role:'listener',attempt_id:checkout.data.checkout.id},admin.cookies);assert.equal((await api('/api/platform/premium/status',undefined,listener.cookies)).data.active,true);
  const artist=(await pool.query("INSERT INTO creators(display_name,email,password_salt,password_hash) VALUES('Offline artist','creator@offline.invalid','fixture','fixture') RETURNING id")).rows[0].id;
  const track=(await pool.query("INSERT INTO music_tracks(creator_id,title,genre,audio_key,audio_mime,audio_bytes,status,published_at) VALUES($1,'Ordinary paid MP3','Gospel','fixture.mp3','audio/mpeg',$2,'published',NOW()) RETURNING id",[artist,audio.length])).rows[0].id;
  server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const b of req)chunks.push(b);const raw=Buffer.concat(chunks),r=await app.request(req.url,{method:req.method,headers:req.headers,...(raw.length?{body:raw}:{})});res.writeHead(r.status,r.headers);res.end(r.body);}catch(e){console.error(e.message);res.writeHead(500);res.end('Fixture failure');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;browser=await launchBrowser();
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await context.addCookies(listener.cookies.split('; ').map(x=>{const i=x.indexOf('=');return {name:x.slice(0,i),value:x.slice(i+1),url:origin};}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/platform/offline/'))console.log('OFFLINE_RESPONSE',r.status(),new URL(r.url()).pathname);});
  await page.goto(origin+'/discover?track='+track);await page.getByRole('heading',{name:'Ordinary paid MP3',exact:true}).waitFor();await page.getByRole('button',{name:'Save offline',exact:true}).click();
  await page.getByText('Saved in your LAE-MUSIC offline library',{exact:true}).waitFor({timeout:35000});
  await page.goto(origin+'/offline');await page.getByRole('heading',{name:'Ordinary paid MP3',exact:true}).waitFor();await page.getByRole('button',{name:'Play saved song',exact:true}).waitFor();
  await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:'Ordinary paid MP3',exact:true}).waitFor();await page.getByRole('button',{name:'Play saved song',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('audio')].some(a=>!a.paused&&a.currentTime>0.1));
  assert.deepEqual(errors,[]);assert.equal(init,1);assert(storageReads>=1);
  const devices=(await pool.query('SELECT * FROM offline_devices WHERE listener_id=$1',[listener.data.user.id])).rows;assert.equal(devices.length,1,'Reopening must keep the original browser, not replace/revoke it');const d=devices[0];assert.equal(d.revoked_at,null);
  const normalized={kty:d.public_jwk.kty,crv:d.public_jwk.crv,x:d.public_jwk.x,y:d.public_jwk.y};assert.notEqual(JSON.stringify(d.public_jwk),JSON.stringify(normalized),'Actual JSONB round-trip changes key order');
  await api('/api/platform/offline/register',{device_id:d.id,public_jwk:normalized},listener.cookies);
  const different=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),register=async(cookie,jwk)=>app.request('/api/platform/offline/register',{method:'POST',body:{device_id:d.id,public_jwk:jwk},headers:{cookie,'idempotency-key':key(),'content-type':'application/json'}});
  assert.equal((await register(listener.cookies,different.publicKey.export({format:'jwk'}))).status,409,'A different key cannot take over the saved browser');
  assert.equal((await register(listener.cookies,different.privateKey.export({format:'jwk'}))).status,400,'Private key material is not accepted');
  const unpaid=await api('/api/listener/register',{name:'Unpaid listener',email:'unpaid@offline.invalid',country:'Nigeria',password:'OfflineProofPass123',confirmPassword:'OfflineProofPass123'});assert.equal((await register(unpaid.cookies,normalized)).status,403,'An unpaid account cannot reuse the paid browser');
  await api('/api/platform/offline/revoke',{device_id:d.id},listener.cookies);assert.equal((await register(listener.cookies,normalized)).status,409,'A revoked browser stays rejected');
  console.log('PASS actual Monnify receipt, original paid-listener Save offline UI, MP3/storage adapter, JSONB device re-registration, retained encrypted library, offline reload/playback and changed-key/private-key/unpaid/revoked guards. External services mocked; no production data or real charges.');
 }finally{global.fetch=original;await browser?.close();if(server)await new Promise(r=>server.close(r));await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
