'use strict';
const target=require('./ci-database.cjs').ciDatabase(),test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const key=()=>crypto.randomUUID(),policy=require('../lib/financial-policy').disclosure();
test('real guest bank purchase precedes registration and activates only the verified matching account',async t=>{
 const control=new Pool({connectionString:target.href}),schema='guest_bank_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});const originalFetch=global.fetch;let requests=0;global.fetch=async()=>{requests++;throw Error('External providers and real payments forbidden');};
 try{
  const app=await require('./runtime.cjs').runtime({pool,env:{NODE_ENV:'test',ADMIN_KEY:'GuestBankFixtureOwner1234567',STUDIO_RELEASE_WORKER_ENABLED:'false',MANUAL_BANK_PAYMENTS_JSON:JSON.stringify({enabled:true,invoice_hours:24,account:{bank_name:'Fixture Bank - NOT REAL',account_name:'Guest test company - NOT REAL',account_number:'0000000000',currency:'NGN',country:'NG'}})}});
  await pool.query("INSERT INTO currency_rate_snapshots(id,source,as_of,next_update,rates) VALUES($1,'exchangerate-api',NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 day',$2)",[key(),JSON.stringify({USD:'1',NGN:'1500'})]);
  const api=async(path,body,cookie,k=key(),headers={})=>{const r=await app.request(path,{method:body===undefined?'GET':'POST',body,headers:{...(cookie?{cookie}:{}),'idempotency-key':k,...headers}});return {status:r.status,data:r.json(),cookie:[r.headers['set-cookie']||[]].flat().map(x=>x.split(';')[0]).join('; '),headers:r.headers};};
  const admin=(await api('/api/admin/login',{password:'GuestBankFixtureOwner1234567'})).cookie;
  const input={kind:'artist_subscription',plan:'starter',email:'new-artist@guest-fixture.invalid',policy_accepted:true,policy_revision:policy.revision,amount_minor:1};
  let guest,other,invoice,artist,listener;
  const bootstrap=async()=>{const r=await api('/api/platform/guest-payments');assert.equal(r.status,200,JSON.stringify(r.data));assert.match(r.headers['set-cookie'].toString(),/HttpOnly; Secure; SameSite=Lax/);return r.cookie;};
  async function submit(cookie,p){const r=await api('/api/platform/guest-payments/'+p.id+'/submit',{payer_name:'Synthetic payer',transfer_reference:'CLAIM-'+key(),transferred_at:new Date().toISOString()},cookie);assert.equal(r.status,200,JSON.stringify(r.data));}
  async function approve(p,reference='BANK-'+key(),extra={}){return api('/api/platform/admin/manual-payments/'+p.id+'/review',{decision:'approved',receipt_verified:true,bank_reference:reference,received_amount:(p.charge_minor/100).toFixed(2),currency:p.charge_currency,received_at:new Date().toISOString(),note:'Independently checked fictional bank receipt for local tests.',...extra},admin);}
  async function register(role,email){const r=await api(role==='artist'?'/api/register':'/api/listener/register',{name:role==='artist'?'Guest Artist':'Guest Listener',email,password:'GuestCheckoutFixture123',confirmPassword:'GuestCheckoutFixture123',country:'Nigeria',plan:'starter'});assert.equal(r.status,201,JSON.stringify(r.data));return {id:r.data.user.id,cookie:r.cookie};}
  await t.test('private signed browser capability, authoritative prices and no provisional account or early entitlement',async()=>{
   guest=await bootstrap();other=await bootstrap();assert.notEqual(guest,other);
   assert.equal((await api('/api/platform/guest-payments',input)).status,403);
   assert.equal((await api('/api/platform/guest-payments',input,guest,key(),{origin:'https://evil.invalid','sec-fetch-site':'cross-site'})).status,403);
   const r=await api('/api/platform/guest-payments',input,guest);assert.equal(r.status,201,JSON.stringify(r.data));invoice=r.data.purchase.payment;assert.equal(Number(invoice.base_minor),600);assert.equal(Number(invoice.charge_minor),900000);assert.equal(r.data.purchase.email,input.email);assert(!JSON.stringify(r.data).includes('session_hash'));
   const again=await api('/api/platform/guest-payments',input,guest);assert.equal(again.data.purchase.payment.id,invoice.id);
   assert.equal((await pool.query('SELECT 1 FROM creators')).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM artist_subscriptions')).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM commerce_receipts')).rowCount,0);
   assert.equal((await api('/api/platform/guest-payments/'+invoice.id,undefined,other)).status,404);
   assert.equal((await api('/api/platform/guest-payments',{...input,email:'changed@guest-fixture.invalid'},guest)).status,409);
   assert.equal((await api('/api/platform/manual-payments?role=guest',input,guest)).status,400);
  });
  await t.test('only finance/owner can approve; exact receipt and one bank reference are required before signup',async()=>{
   assert.equal((await approve(invoice)).status,409);await submit(guest,invoice);
   const path='/api/platform/admin/manual-payments/'+invoice.id+'/review';assert.equal((await api(path,{decision:'approved'},guest)).status,401);
   assert.equal((await approve(invoice,'BANK-ONE',{receipt_verified:false})).status,400);assert.equal((await approve(invoice,'BANK-ONE',{received_amount:'8999.99'})).status,409);
   const r=await approve(invoice,'BANK-ONE');assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.payment.status,'approved');assert.match(r.data.payment.notice,/Finish account setup/);
   assert.equal((await pool.query('SELECT 1 FROM creators')).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM artist_subscriptions')).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM commerce_receipts')).rowCount,0);
   const queue=await api('/api/platform/admin/manual-payments?status=approved',undefined,admin);assert.equal(queue.status,200);assert.equal(queue.data.payments[0].customer_email,input.email);
  });
  await t.test('registration followed by concurrent claim activates one annual membership and preserves bank history',async()=>{
   artist=await register('artist',input.email);const wrong=await register('artist','other-account@guest-fixture.invalid');
   assert.equal((await api('/api/platform/guest-payments/claim',{},guest+'; '+wrong.cookie)).status,403);
   const cookie=guest+'; '+artist.cookie,id=key(),r=await Promise.all([api('/api/platform/guest-payments/claim',{},cookie,id),api('/api/platform/guest-payments/claim',{},cookie,id)]);for(const x of r)assert.equal(x.status,200,JSON.stringify(x.data));assert.equal(r[0].data.order_id,r[1].data.order_id);
   assert.equal((await api('/api/platform/guest-payments/claim',{},cookie)).status,200);
   const rows=(await pool.query('SELECT * FROM artist_subscriptions WHERE artist_id=$1',[artist.id])).rows;assert.equal(rows.length,1);assert.equal(rows[0].included_generations,3);assert.equal(rows[0].publish_track_limit,6);assert(+new Date(rows[0].expires_at)>Date.now()+364*86400000);
   const state=await api('/api/platform/guest-payments',undefined,cookie);assert.equal(state.data.purchase.claimed,true);assert.equal(state.data.purchase.payment.guest_claimed,true);
   const history=await api('/api/platform/manual-payments?role=artist',undefined,artist.cookie);assert.equal(history.data.payments.length,1);assert.equal(history.data.payments[0].id,invoice.id);assert.equal(history.data.payments[0].artist_order_id,r[0].data.order_id);
   assert.equal((await pool.query('SELECT 1 FROM commerce_receipts')).rowCount,1);assert.equal((await pool.query('SELECT 1 FROM affiliate_subscription_commissions')).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM guest_purchase_fulfillments')).rowCount,1);
   await assert.rejects(pool.query("UPDATE guest_purchase_orders SET email='stolen@fixture.invalid'"),/histor|mutat/i);
   const balance=await api('/api/generation/wallet',undefined,artist.cookie);assert.equal(balance.status,200,JSON.stringify(balance.data));assert.equal(balance.data.credits,3,'The purchased annual plan also unlocks its companion lyrics drafts');assert.equal((await api('/api/generation/wallet',undefined,artist.cookie)).data.credits,3,'Reloading cannot regrant credits');
   const acceptance=await require('../lib/creator-agreement').accepted(pool,artist.id);assert.equal(acceptance,null,'Payment does not fabricate agreement consent');
  });
  await t.test('Premium guest payment shares duplicate-receipt protection and activates the correct listener duration',async()=>{
   const cookie=await bootstrap(),data={...input,kind:'premium_listener',plan:'quarterly',email:'new-listener@guest-fixture.invalid'};const r=await api('/api/platform/guest-payments',data,cookie);assert.equal(r.status,201,JSON.stringify(r.data));const p=r.data.purchase.payment;assert.equal(Number(p.base_minor),180);await submit(cookie,p);
   assert.equal((await approve(p,'BANK-ONE')).status,409);const paid=await approve(p,'BANK-TWO');assert.equal(paid.status,200,JSON.stringify(paid.data));
   listener=await register('listener',data.email);const activated=await api('/api/platform/guest-payments/claim',{},cookie+'; '+listener.cookie);assert.equal(activated.status,200,JSON.stringify(activated.data));
   const ent=(await pool.query('SELECT * FROM premium_entitlements WHERE listener_id=$1',[listener.id])).rows;assert.equal(ent.length,1);assert.equal((+new Date(ent[0].expires_at)-+new Date(ent[0].starts_at))/86400000,90);
   const history=await api('/api/platform/manual-payments?role=listener',undefined,listener.cookie);assert.equal(history.data.payments[0].listener_order_id,activated.data.order_id);
   assert.equal((await pool.query('SELECT 1 FROM premium_commissions')).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM premium_quarterly_team_sales')).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM royalty_cash_releases')).rowCount,0);
  });
  await t.test('paid lyrics reserve/refund once, and held companion credits cannot be spent or converted into free credits',async()=>{
   const credits=require('../lib/credits'),options={requireArtistPackage:true,accessEnv:{NODE_ENV:'test'}},request=key(),reserved=await credits.reserveLyrics(pool,artist.id,request,{idea:'Original fixture gratitude song'},options);
   const debit=(await pool.query('SELECT source_order_id FROM generation_ledger WHERE reference=$1',[reserved.reference])).rows[0];assert(debit.source_order_id);
   assert.equal((await api('/api/generation/wallet',undefined,artist.cookie)).data.credits,2);
   await Promise.all([credits.refundLyrics(pool,artist.id,reserved.reference,request),credits.refundLyrics(pool,artist.id,reserved.reference,request)]);
   assert.equal((await api('/api/generation/wallet',undefined,artist.cookie)).data.credits,3);
   await pool.query("INSERT INTO payment_refund_cases(order_id,reason,status) VALUES($1,'Synthetic hold for paid lyrics isolation','review')",[debit.source_order_id]);
   assert.equal((await api('/api/generation/wallet',undefined,artist.cookie)).data.credits,0);
   await assert.rejects(credits.reserveLyrics(pool,artist.id,key(),{idea:'Blocked while the actual purchase is held'},options),e=>e.status===402);
   assert.equal(Number((await pool.query('SELECT credits FROM generation_wallets WHERE creator_id=$1',[artist.id])).rows[0].credits),3,'Held balances remain recorded and are not silently deleted');
   await pool.query("UPDATE payment_refund_cases SET status='declined' WHERE order_id=$1",[debit.source_order_id]);assert.equal((await api('/api/generation/wallet',undefined,artist.cookie)).data.credits,3);
  });
  await t.test('guest referral survives a later renewal request without activating commissions',async()=>{
   const cookie=await bootstrap(),email='referred@guest-fixture.invalid',r=await api('/api/platform/guest-payments',{...input,email,plan:'growth',ref:String(artist.id)},cookie);assert.equal(r.status,201,JSON.stringify(r.data));const p=r.data.purchase.payment;assert.equal(Number(p.base_minor),1000);await submit(cookie,p);assert.equal((await approve(p,'BANK-REFERRED')).status,200);
   const buyer=await register('artist',email),claimed=await api('/api/platform/guest-payments/claim',{},cookie+'; '+buyer.cookie);assert.equal(claimed.status,200,JSON.stringify(claimed.data));
   const original=await require('../lib/affiliate-framework').originalReferrer(pool,{artistId:buyer.id,mode:'test'});assert.equal(String(original.referrer_id),String(artist.id));
   const renewal=await require('../lib/commerce').createCommerce({pool,referralMode:'test'}).create(buyer.id,key(),{kind:'artist_subscription',plan:'growth'});
   const saved=(await pool.query('SELECT direct_referrer_id FROM commerce_order_referral_snapshots WHERE order_id=$1',[renewal.id])).rows[0];assert.equal(String(saved.direct_referrer_id),String(artist.id));
   assert.equal((await api('/api/generation/wallet',undefined,buyer.cookie)).data.credits,6);assert.equal((await pool.query('SELECT 1 FROM affiliate_subscription_commissions')).rowCount,0);
  });
  await t.test('an expired draft with no issued invoice can restart, while an unresolved paid invoice cannot be abandoned',async()=>{
   const cookie=await bootstrap(),hash=require('../lib/transactions').digest(cookie.slice(cookie.indexOf('=')+1));
   await pool.query("INSERT INTO guest_purchase_orders(id,session_hash,email,kind,plan,currency,amount_minor,product_snapshot,policy_revision,created_at,expires_at) VALUES($1,$2,'expired@guest-fixture.invalid','artist_subscription','starter','USD',600,'{}',$3,NOW()-INTERVAL '2 hours',NOW()-INTERVAL '1 hour')",[key(),hash,policy.revision]);
   const fresh=await api('/api/platform/guest-payments',undefined,cookie);assert.equal(fresh.data.purchase,null);assert(fresh.cookie);assert.notEqual(fresh.cookie,cookie);
   assert.equal((await api('/api/platform/guest-payments',{...input,email:'restarted@guest-fixture.invalid'},fresh.cookie)).status,201);
   assert.equal((await api('/api/platform/guest-payments/reset',{},fresh.cookie)).status,409,'Issued transfer instructions must be cancelled or reconciled explicitly');
  });
  await t.test('existing accounts must sign in and malformed or unapproved products cannot create guest orders',async()=>{
   const cookie=await bootstrap();assert.equal((await api('/api/platform/guest-payments',{...input,email:input.email},cookie)).status,409);
   assert.equal((await api('/api/platform/guest-payments',{...input,kind:'studio_generation',email:'new@guest-fixture.invalid'},cookie)).status,400);
   assert.equal((await api('/api/platform/guest-payments',{...input,policy_accepted:false,email:'new@guest-fixture.invalid'},cookie)).status,409);
   const bad=cookie.slice(0,-1)+(cookie.endsWith('0')?'1':'0');assert.equal((await api('/api/platform/guest-payments',input,bad)).status,403);
  });
  assert.equal(requests,0);
 }finally{global.fetch=originalFetch;await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
