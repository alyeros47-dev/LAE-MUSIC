'use strict';
// Verification only. Disposable local schema, intercepted gateway transport and
// explicitly synthetic historical settlement evidence. Never real money or production.
const target=require('./ci-database.cjs').ciDatabase();
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const {runtime}=require('./runtime.cjs'),{transaction}=require('../lib/transactions');
const {createCommerce}=require('../lib/commerce'),{createPaystack}=require('../lib/payments/paystack');
const {createCheckoutService}=require('../lib/payments/checkout'),{createPremium}=require('../lib/premium-listeners');
const {createRoyalties}=require('../lib/streaming-royalties'),{createRoyaltySettlement}=require('../lib/royalty-settlement');
const {createMembership,availableRoyalties}=require('../lib/artist-membership'),agreement=require('../lib/creator-agreement');
const finance=require('../lib/finance'),key=()=>crypto.randomUUID();
test('PR27 payment verification, independently funded royalty ledger and consented annual renewal compose safely',async t=>{
 const control=new Pool({connectionString:target.href}),schema='member_integration_'+crypto.randomBytes(6).toString('hex');
 await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});
 const originalFetch=global.fetch;let realNetwork=0,initialized=0,lookedUp=0,sequence=100;
 global.fetch=async()=>{realNetwork++;throw Error('Real provider requests are forbidden by this verification.');};
 try{
  const payments=new Map(),secret='sk_test_pr27_integration_fixture_only';
  const adapter=createPaystack({secretKey:secret,merchantId:'pr27-fixture',mode:'test',approvedCurrencies:['USD'],reviewed:true,fetchImpl:async(url,options={})=>{
   if(url.endsWith('/transaction/initialize')){initialized++;const b=JSON.parse(options.body);payments.set(b.reference,{id:++sequence,reference:b.reference,domain:'test',status:'pending',amount:Number(b.amount),currency:b.currency,metadata:JSON.parse(b.metadata)});return Response.json({status:true,data:{reference:b.reference,authorization_url:'https://checkout.paystack.com/pr27-isolated-fixture'}});}
   if(url.includes('/transaction/verify/')){lookedUp++;return Response.json({status:true,data:payments.get(url.split('/').at(-1))});}
   throw Error('Unexpected fixture transport request');
  }});
  const checkout=createCheckoutService({pool,adapters:{paystack:adapter},mode:'sandbox',merchantCountry:'NG',callbackOrigin:'https://lae.test'});
  const historicalAdapter=require('../lib/payments/flutterwave').createFlutterwave({secretKey:'FLWSECK_TEST-pr27_fixture_only-X',secretHash:'pr27_fixture_webhook_hash_only_123456789',merchantId:'12345',mode:'test',approvedCurrencies:['USD'],reviewed:true,fetchImpl:async()=>{throw Error('Historical accounting fixtures must not contact a provider');}});
  const premium=createPremium({affiliatePolicyRevision:require("../lib/partner-policy").LEGACY_REVISION,pool,adapters:{paystack:adapter,flutterwave:historicalAdapter},callbackOrigin:'https://lae.test'});
  const app=await runtime({pool,paymentService:checkout,env:{NODE_ENV:'test',STUDIO_RELEASE_WORKER_ENABLED:'false'}});
  const commerce=createCommerce({pool}),membership=createMembership({pool,commerce}),royalties=createRoyalties(pool);
  const api=async(path,body,cookie,k=key())=>{const r=await app.request(path,{method:body===undefined?'GET':'POST',body,headers:{...(cookie?{cookie}:{}),'idempotency-key':k}});return {status:r.status,data:r.json(),cookie:[r.headers['set-cookie']||[]].flat().map(x=>x.split(';')[0]).join('; ')};};
  const password='Pr27IntegrationFixturePassword123';const registered=await api('/api/register',{name:'Integration artist',email:'artist@pr27-integration.invalid',country:'Nigeria',password,confirmPassword:password,plan:'starter'});assert.equal(registered.status,201);
  const artist=registered.data.user.id,cookie=registered.cookie,a=agreement.disclosure();
  await agreement.accept(pool,artist,{accepted:true,version:a.version,content_hash:a.content_hash});
  let originalSubscription,statement,preview;
  const renewal={plan:'starter',amount_minor:600,currency:'USD',deduction_consent:true,agreement_version:a.version,agreement_hash:a.content_hash};
  await t.test('signed test-mode checkout activates exactly the quoted annual membership once',async()=>{
   const order=await commerce.create(artist,key(),{kind:'artist_subscription',plan:'starter'});assert.equal(Number(order.amount_minor),600);
   const quote=await checkout.prepare(artist,{order_id:order.id,provider:'paystack',currency:'USD'});
   const attempt=await checkout.start(artist,key(),{quote_id:quote.id,policy_accepted:true,policy_revision:require('../lib/financial-policy').disclosure().revision});
   assert.equal(initialized,1);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_subscriptions WHERE artist_id=$1',[artist])).rows[0].n,0,'A redirect is not payment proof');
   const raw=Buffer.from(JSON.stringify({event:'charge.success',data:{reference:attempt.reference}})),headers={'x-paystack-signature':crypto.createHmac('sha512',secret).update(raw).digest('hex')};
   await assert.rejects(checkout.webhook('paystack',raw,{'x-paystack-signature':'bad'}),e=>e.status===401);
   payments.get(attempt.reference).status='success';
   await Promise.all([checkout.webhook('paystack',raw,headers),checkout.webhook('paystack',raw,headers)]);
   assert(lookedUp>0);const rows=(await pool.query('SELECT * FROM artist_subscriptions WHERE artist_id=$1',[artist])).rows;assert.equal(rows.length,1);originalSubscription=rows[0];assert.deepEqual([originalSubscription.included_generations,originalSubscription.publish_track_limit],[3,6]);
   assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM commerce_receipts WHERE order_id=$1',[order.id])).rows[0].n,1);
   assert.equal(await availableRoyalties(pool,artist),0,'A membership purchase cannot fabricate artist royalties');
  });
  await t.test('actual default production wiring remains closed, regardless of client success flags',async()=>{
   const runtime=require('../lib/payments/runtime');const closed=runtime.checkoutRuntime({pool,env:{NODE_ENV:'production',PAYSTACK_SECRET_KEY:secret}});assert.equal(closed.enabled(),false);
   assert.equal(createRoyaltySettlement({pool}).enabled(),false);await assert.rejects(createRoyaltySettlement({pool}).release(key(),{statement_id:key()}),e=>e.status===503);
  });
  await t.test('historical live-book fixtures finalize an existing-price royalty statement without making it spendable',async()=>{
   await pool.query("UPDATE artist_subscriptions SET starts_at=NOW()-INTERVAL '2 years',expires_at=NOW()-INTERVAL '1 day' WHERE id=$1",[originalSubscription.id]);
   const track=(await pool.query("INSERT INTO music_tracks(creator_id,title,genre,audio_key,audio_mime,audio_bytes,status,published_at) VALUES($1,'Preserved integration song','Gospel','fixture/never-a-real-file.mp3','audio/mpeg',2048,'published',NOW()-INTERVAL '1 year') RETURNING id",[artist])).rows[0].id;
   const start=new Date('2026-09-01T00:00:00Z'),end=new Date('2026-10-01T00:00:00Z');
   // Reconstruct historical receipts using the unchanged approved monthly price.
   // These fixtures are not created through the test checkout and are never real settlement evidence.
   for(let i=0;i<24;i++){
    const listener=(await pool.query("INSERT INTO listeners(display_name,email,password_salt,password_hash) VALUES('Historical fixture listener',$1,'fixture-salt','fixture-hash') RETURNING id",['history-'+i+'@pr27-integration.invalid'])).rows[0].id;
    const order=await premium.prepare(listener,key(),{plan:'monthly'});assert.equal(Number(order.amount_minor),require('../lib/premium-pricing').catalog().plans.find(p=>p.code==='monthly').usd_minor);
    if(i===0)await assert.rejects(premium.prepareQuote(listener,{order_id:order.id,provider:'paystack',currency:'USD'}),e=>e.status===409&&/minimum/.test(e.message));
    const quote=await premium.prepareQuote(listener,{order_id:order.id,provider:'flutterwave',currency:'USD'}),attempt=key(),reference='historical-fixture-'+key();
    await pool.query("INSERT INTO premium_attempts(id,order_id,provider,merchant_id,mode,reference,status,quote_id) VALUES($1,$2,'flutterwave','12345','live',$3,'paid',$4)",[attempt,order.id,reference,quote.id]);
    await transaction(pool,async db=>{await db.query("INSERT INTO premium_receipts(order_id,provider,merchant_id,payment_id,mode,currency,amount_minor) VALUES($1,'flutterwave','12345',$2,'live','USD',$3)",[order.id,reference,order.amount_minor]);await db.query("INSERT INTO premium_presentments(order_id,quote_id,attempt_id,base_currency,base_minor,charge_currency,charge_minor,usd_equivalent_minor,exchange_rate,conversion_at) VALUES($1,$2,$3,'USD',$4,'USD',$4,$4,'1',(SELECT created_at FROM payment_checkout_quotes WHERE id=$2))",[order.id,quote.id,attempt,order.amount_minor]);});
    const entitlement=(await pool.query('INSERT INTO premium_entitlements(order_id,listener_id,starts_at,expires_at) VALUES($1,$2,$3,$4) RETURNING id',[order.id,listener,start,end])).rows[0].id;
    await transaction(pool,db=>finance.transfer(db,'premium:'+order.id,'premium_verified_sale','USD',Number(order.amount_minor),'platform:premium_receivable:live:USD','platform:premium_deferred:live:USD'));
    await royalties.costs(key(),{order_id:order.id,fees_minor:0,tax_minor:0,evidence:'Synthetic historical base-currency fee and tax evidence; no real provider transport.'});
    const playback=key();await pool.query('INSERT INTO premium_playback(id,listener_id,track_id,artist_id,entitlement_id) VALUES($1,$2,$3,$4,$5)',[playback,listener,track,artist,entitlement]);await pool.query("INSERT INTO premium_streams(playback_id,listener_id,track_id,artist_id,entitlement_id,occurred_at,listened_ms) VALUES($1,$2,$3,$4,$5,'2026-09-15T12:00:00Z',30000)",[playback,listener,track,artist,entitlement]);
   }
   preview=await royalties.preview('2026-09','live','USD');assert.deepEqual(preview.issues,[]);assert(preview.artist_pool_minor>=600);
   statement=await royalties.finalize(key(),{month:'2026-09',mode:'live',currency:'USD',snapshot_hash:preview.snapshot_hash,review_note:'Isolated historical integration fixture, not actual funds or a live payout.'});
   assert.equal(await availableRoyalties(pool,artist),0);await assert.rejects(membership.renew(artist,key(),renewal),e=>e.status===409&&/Insufficient/.test(e.message));
   assert.equal((await pool.query('SELECT status FROM music_tracks WHERE id=$1',[track])).rows[0].status,'published');
  });
  await t.test('independent funding checks reject missing or insufficient proofs and release exactly once with fixture evidence',async()=>{
   const receipts=(await pool.query("SELECT order_id,provider,merchant_id,payment_id,amount_minor FROM premium_receipts WHERE mode='live'")).rows;
   const proofs=receipts.map(r=>({orderId:r.order_id,provider:r.provider,merchantId:r.merchant_id,paymentId:r.payment_id,currency:'USD',receivedMinor:Number(r.amount_minor),settlementReference:'SYNTHETIC-ONLY:'+r.order_id}));
   const make=values=>createRoyaltySettlement({pool,verifier:{verified:true,verifyStatementFunding:async()=>values}});
   await assert.rejects(make([]).release(key(),{statement_id:statement.id}),e=>e.status===409);await assert.rejects(make(proofs.map(p=>({...p,receivedMinor:1}))).release(key(),{statement_id:statement.id}),e=>e.status===409);
   assert.equal(await availableRoyalties(pool,artist),0);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM royalty_funding_sources')).rows[0].n,0);
   const cash=make(proofs);await Promise.all([cash.release(key(),{statement_id:statement.id}),cash.release(key(),{statement_id:statement.id})]);assert.equal(await availableRoyalties(pool,artist),preview.artist_pool_minor);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM royalty_cash_releases')).rows[0].n,1);
  });
  await t.test('customer HTTP renewal consumes only funded royalties, records consent and never counts the deduction as new external cash',async()=>{
   const k=key(),first=await api('/api/platform/membership/renew',renewal,cookie,k),second=await api('/api/platform/membership/renew',renewal,cookie,k);assert.equal(first.status,200,JSON.stringify(first.data));assert.deepEqual(second.data,first.data);
   assert.equal(await availableRoyalties(pool,artist),preview.artist_pool_minor-600);assert.equal((await membership.status(artist)).status,'active');
   const record=(await pool.query('SELECT * FROM membership_royalty_renewals WHERE order_id=$1',[first.data.order_id])).rows[0];assert.equal(Number(record.amount_minor),600);assert.equal(record.deduction_consent,true);
   const report=await require('../lib/reconciliation').createReconciliation({pool}).overview({currency:'USD',mode:'all'});assert.equal(report.totals.filter(t=>t.product==='artist').reduce((n,r)=>n+Number(r.gross_minor),0),600);
   assert.equal((await commerce.report()).summary.discrepancies,0);
  });
  assert.equal(realNetwork,0);
 }finally{global.fetch=originalFetch;await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
