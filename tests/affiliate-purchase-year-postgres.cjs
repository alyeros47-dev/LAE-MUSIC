'use strict';
// Financial-policy journeys use a disposable local database and mocked gateways only.
const target=require('./ci-database.cjs').ciDatabase();
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Pool}=require('pg'),{runtime}=require('./runtime.cjs');
const currentAccess=require('../lib/affiliate-access'),policy=require('../lib/partner-policy');
const {createPremium}=require('../lib/premium-listeners'),{createPaystack}=require('../lib/payments/paystack');
const {createExchangeRates}=require('../lib/exchange-rates'),{createCheckoutService}=require('../lib/payments/checkout');
const {createCommerce}=require('../lib/commerce');
const access={...currentAccess,status:(db,id,options)=>currentAccess.status(db,id,{...options,policyRevision:policy.PURCHASE_YEAR_REVISION})};
const key=()=>crypto.randomUUID(),confirmation={policy_accepted:true,policy_revision:require('../lib/financial-policy').disclosure().revision};
test('purchase-qualified affiliate year, linked roles, versioned commissions and refunds',async t=>{
 const control=new Pool({connectionString:target.href,ssl:false}),schema='affiliate_year_'+crypto.randomBytes(6).toString('hex');
 await control.query('CREATE SCHEMA '+schema);
 const pool=new Pool({connectionString:target.href,ssl:false,options:'-c search_path='+schema});
 try{
  let sequence=0;const payments=new Map(),refunds=new Map();
  const adapter=createPaystack({secretKey:'sk_test_affiliate_year_fixture',merchantId:'affiliate-year-fixture',mode:'test',approvedCurrencies:['USD','NGN'],reviewed:true,fetchImpl:async(url,options={})=>{
   if(url.endsWith('/transaction/initialize')){const x=JSON.parse(options.body);payments.set(x.reference,{id:++sequence,reference:x.reference,domain:'test',status:'success',amount:Number(x.amount),currency:x.currency,metadata:JSON.parse(x.metadata)});return Response.json({status:true,data:{reference:x.reference,authorization_url:'https://checkout.paystack.com/affiliate-year-fixture'}});}
   if(url.includes('/transaction/verify/'))return Response.json({status:true,data:payments.get(url.split('/').at(-1))});
   if(url.includes('/refund/'))return Response.json({status:true,data:refunds.get(url.split('/').at(-1))});
   throw Error('Unexpected external operation: '+url);
  }});
  const rates=createExchangeRates({pool,env:{},fetchImpl:async()=>Response.json({result:'success',base_code:'USD',time_last_update_unix:Math.floor(Date.now()/1000),time_next_update_unix:Math.floor(Date.now()/1000)+86400,rates:{USD:1,NGN:1600}})});
  const options={affiliatePolicyRevision:policy.PURCHASE_YEAR_REVISION,pool,rates,adapters:{paystack:adapter},callbackOrigin:'https://lae.test'};
  const premium=createPremium(options),checkout=createCheckoutService({...options,mode:'sandbox',merchantCountry:'NG'});
  const app=await runtime({pool,premiumService:premium,paymentService:checkout,env:{NODE_ENV:'test',ADMIN_KEY:'affiliate-year-local-admin',STUDIO_RELEASE_WORKER_ENABLED:'false'}});
  const api=async(path,body,cookie)=>{
   const r=await app.request(path,{method:body===undefined?'GET':'POST',body,remoteAddress:'192.0.2.'+(1+(++sequence)%200),headers:{...(cookie?{cookie}:{}),'idempotency-key':key()}});
   return {status:r.status,data:r.json(),cookie:[r.headers['set-cookie']||[]].flat().map(c=>c.split(';')[0]).join('; ')};
  };
  async function register(role,name,password='AffiliateYearFixture123'){const r=await api(role==='artist'?'/api/register':'/api/listener/register',{name,email:name+'@affiliate-year.invalid',country:'Nigeria',plan:'starter',password,confirmPassword:password});assert.equal(r.status,201,JSON.stringify(r.data));return {id:r.data.user.id,cookie:r.cookie};}
  async function purchase(user,plan,referrer_id=null,service=premium){
   const order=await service.prepare(user.id,key(),{plan,...(referrer_id?{referrer_id}:{})});
   const quote=await service.prepareQuote(user.id,{order_id:order.id,provider:'paystack',currency:'NGN'});
   await service.checkout(user.id,key(),{quote_id:quote.id,...confirmation});
   const attempt=(await pool.query('SELECT * FROM premium_attempts WHERE order_id=$1',[order.id])).rows[0];
   await service.verify(user.id,attempt.id);
   return {order,quote,attempt,payment:payments.get(attempt.reference)};
  }
  async function activate(user){const r=await api('/api/platform/partners/activate',{participating:true},user.cookie);assert.equal(r.status,200,JSON.stringify(r.data));return {id:r.data.artist_id,cookie:r.cookie,listenerId:user.id};}
  let leader,sponsor,buyer,leaderPurchase,sponsorPurchase,sale,renewal,monthlyOnly;
  await t.test('free signup, pending labels, demo receipts and short Premium cannot qualify',async()=>{
   const artist=await register('artist','unpaid');
   const x=await api('/api/platform/partners/eligibility',undefined,artist.cookie);assert.equal(x.data.eligible,false);
   assert.equal((await api('/api/affiliate/product-links',undefined,artist.cookie)).status,402);
   await pool.query("INSERT INTO artist_subscriptions(artist_id,plan,amount_cents,payment_reference,status,starts_at,expires_at) VALUES($1,'starter',600,'unverified-label','paid',NOW(),NOW()+INTERVAL '1 year')",[artist.id]);
   assert.equal((await access.status(pool,artist.id,{mode:'test'})).eligible,false);
   monthlyOnly=await register('listener','monthly-only');await purchase(monthlyOnly,'monthly');
   assert.equal((await access.status(pool,null,{listenerId:monthlyOnly.id,mode:'test'})).eligible,false);
   assert.equal((await api('/api/platform/partners/activate',{},monthlyOnly.cookie)).status,400);
  });
  await t.test('$1.80 quarterly Premium qualifies a listener using the same email, without granting artist tools',async()=>{
   const l=await register('listener','leader');leaderPurchase=await purchase(l,'quarterly');
   assert.equal(Number(leaderPurchase.order.amount_minor),180);assert.equal(leaderPurchase.order.days,90);
   assert.equal(Number(leaderPurchase.quote.charge_minor),288000);
   assert.equal((await access.status(pool,null,{listenerId:l.id,mode:'live'})).eligible,false);
   leader=await activate(l);
   const again=await activate(l);assert.equal(again.id,leader.id);
   assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_subscriptions WHERE artist_id=$1',[leader.id])).rows[0].n,0);
   assert.equal((await require('../lib/artist-access').status(pool,leader.id,{})).active,false);
   assert.equal((await api('/api/affiliate/product-links',undefined,leader.cookie)).status,200);
   assert.equal((await pool.query('SELECT email FROM creators WHERE id=$1',[leader.id])).rows[0].email,'leader@affiliate-year.invalid');
  });
  await t.test('three-month purchase plus monthly renewal book 20% direct and 10% two-step team volume once',async()=>{
   const s=await register('listener','sponsor');sponsorPurchase=await purchase(s,'quarterly',leader.id);sponsor=await activate(s);
   assert.equal(String((await pool.query('SELECT referred_by FROM creators WHERE id=$1',[sponsor.id])).rows[0].referred_by),String(leader.id));
   buyer=await register('listener','buyer');sale=await purchase(buyer,'quarterly',sponsor.id);renewal=await purchase(buyer,'monthly');assert.equal(String(renewal.order.referrer_id),String(sponsor.id));
   const attemptedReassignment=await premium.prepare(buyer.id,key(),{plan:'monthly',referrer_id:leader.id});assert.equal(String(attemptedReassignment.referrer_id),String(sponsor.id));
   for(const x of [sale,renewal]){const raw=Buffer.from(JSON.stringify({event:'charge.success',data:{reference:x.attempt.reference}}));await premium.webhook('paystack',raw,{'x-paystack-signature':crypto.createHmac('sha512','sk_test_affiliate_year_fixture').update(raw).digest('hex')});}
   const c=(await pool.query('SELECT beneficiary_id,level,percent,amount_minor FROM premium_commissions WHERE order_id=ANY($1::uuid[]) ORDER BY amount_minor',[ [sale.order.id,renewal.order.id] ])).rows;
   assert.deepEqual(c.map(x=>[String(x.beneficiary_id),x.level,x.percent,Number(x.amount_minor)]),[[String(sponsor.id),1,20,12],[String(sponsor.id),1,20,36]]);
   const team=(await pool.query('SELECT team_leader_id,reserved_minor,policy_revision FROM premium_quarterly_team_sales WHERE order_id=ANY($1::uuid[]) ORDER BY reserved_minor',[[sale.order.id,renewal.order.id]])).rows;
   assert.deepEqual(team.map(x=>[String(x.team_leader_id),Number(x.reserved_minor),x.policy_revision]),[[String(leader.id),6,policy.PURCHASE_YEAR_REVISION],[String(leader.id),18,policy.PURCHASE_YEAR_REVISION]]);
   const quarter=policy.periodForSale(new Date()),report=await require('../lib/partner-accounting').create({pool}).overview(leader.id,{quarter,mode:'test'});
   assert.equal(report.team_projection_minor,24);assert.equal(report.rollup.team.eligible_minor,240);
  });
  await t.test('own payment starts a full calendar year; monthly purchases do not reset it; expiry stops only new earnings',async()=>{
   const receipt=(await pool.query('SELECT verified_at FROM premium_receipts WHERE order_id=$1',[leaderPurchase.order.id])).rows[0];
   const at100=new Date(+receipt.verified_at+100*86400000),boundary=new Date(receipt.verified_at);boundary.setUTCFullYear(boundary.getUTCFullYear()+1);
   const mid=await access.status(pool,leader.id,{at:at100,mode:'test'});assert.equal(mid.eligible,true);
   assert.equal(new Date(mid.qualifying_purchase.expires_at).toISOString(),boundary.toISOString());
   assert.equal((await access.status(pool,leader.id,{at:new Date(+boundary+1),mode:'test'})).eligible,false);
   await purchase({id:leader.listenerId},'monthly');
   const unchanged=await access.status(pool,leader.id,{mode:'test'});assert.equal(unchanged.qualifying_purchase.order_id,leaderPurchase.order.id);
   const recipients=await access.recipients(pool,sponsor.id,leader.id,{at:new Date(+boundary+1),mode:'test',revision:policy.PURCHASE_YEAR_REVISION});
   assert.equal(recipients.team,false);
   const before=(await pool.query('SELECT COUNT(*)::int AS n FROM premium_commissions')).rows[0].n;
   assert(before>=2);assert.equal((await pool.query('SELECT SUM(amount_minor)::int AS n FROM premium_commissions WHERE beneficiary_id=$1',[sponsor.id])).rows[0].n,48);
  });
  await t.test('an unqualified sponsor receives nothing while a qualified exactly-two-step leader can still earn',async()=>{
   const unqualified=await register('artist','unqualified-sponsor');await pool.query('UPDATE creators SET referred_by=$1 WHERE id=$2',[leader.id,unqualified.id]);
   const u=await register('listener','unqualified-chain-buyer'),x=await purchase(u,'monthly',unqualified.id);
   assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM premium_commissions WHERE order_id=$1',[x.order.id])).rows[0].n,0);
   assert.equal(Number((await pool.query('SELECT reserved_minor FROM premium_quarterly_team_sales WHERE order_id=$1',[x.order.id])).rows[0].reserved_minor),6);
  });
  await t.test('verified $6 artist payment qualifies, but does not alter the artist product-specific direct rate',async()=>{
   const artist=await register('artist','qualifying-artist'),commerce=createCommerce({affiliatePolicyRevision:policy.PURCHASE_YEAR_REVISION,pool});
   await pool.query('UPDATE creators SET referred_by=$1 WHERE id=$2',[sponsor.id,artist.id]);
   const order=await commerce.create(artist.id,key(),{kind:'artist_subscription',plan:'starter'});
   const quote=await checkout.prepare(artist.id,{order_id:order.id,provider:'paystack',currency:'NGN'});
   const start=await checkout.start(artist.id,key(),{quote_id:quote.id,...confirmation});
   const attempt=(await pool.query('SELECT * FROM payment_checkout_attempts WHERE order_id=$1',[order.id])).rows[0];
   await checkout.reconcile(artist.id,attempt.id);
   await currentAccess.setParticipation(pool,artist.id,{mode:'test',participating:true});
   const eligibility=await access.status(pool,artist.id,{mode:'test'});assert.equal(eligibility.eligible,true);assert.equal(eligibility.qualifying_purchase.product,'artist_subscription');
   const commission=(await pool.query('SELECT amount_cents FROM affiliate_subscription_commissions WHERE referred_artist_id=$1',[artist.id])).rows[0];assert.equal(Number(commission.amount_cents),90);
   assert(start);
  });
  await t.test('historical Premium contracts retain 10% direct and 5% quarterly, alongside new 20% and 10%',async()=>{
   const old=createPremium({...options,affiliatePolicyRevision:policy.LEGACY_REVISION}),u=await register('listener','historical-buyer'),x=await purchase(u,'monthly',sponsor.id,old);
   assert.equal(Number((await pool.query('SELECT amount_minor FROM premium_commissions WHERE order_id=$1',[x.order.id])).rows[0].amount_minor),6);
   assert.equal(Number((await pool.query('SELECT reserved_minor FROM premium_quarterly_team_sales WHERE order_id=$1',[x.order.id])).rows[0].reserved_minor),3);
  });
  await t.test('closed-quarter finalization honors earned money even after the qualifying year ends',async()=>{
   const quarter=policy.periodForSale(new Date()),reporter=require('../lib/partner-statements').create({pool,now:()=>new Date(Date.now()+2*366*86400000)});
   const preview=await reporter.preview(leader.id,{quarter,mode:'test'});
   assert(preview);
   const result=await reporter.finalize({role:'owner',source:'shared_key'},{artist_id:leader.id,quarter,mode:'test',snapshot_hash:preview.statement_snapshot_hash,note:'Local fixture: verify earned commissions survive eligibility expiry.'});
   assert(result);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM partner_bonus_statements WHERE leader_id=$1',[leader.id])).rows[0].n,1);
  });
  await t.test('refunds reverse actual sale amounts once and revoke only the refunded qualifying proof',async()=>{
   const refund=async(x,id)=>{refunds.set(id,{id,transaction:x.payment.id,domain:'test',currency:x.payment.currency,amount:x.payment.amount,status:'processed'});return premium.reverse(key(),{order_id:x.order.id,refund_id:id});};
   await refund(sale,'9001');await refund(sale,'9001');
   assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM premium_reversals WHERE order_id=$1',[sale.order.id])).rows[0].n,1);
   await refund(leaderPurchase,'9002');
   assert.equal((await access.status(pool,leader.id,{mode:'test'})).eligible,false);
   assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM premium_commissions WHERE beneficiary_id=$1',[sponsor.id])).rows[0].n,3);
   // Historical records remain accessible; marketing links are now locked.
   assert.equal((await api('/api/affiliate/product-links',undefined,leader.cookie)).status,402);
   const renewed=await purchase({id:leader.listenerId},'quarterly');
   const reopened=await access.status(pool,leader.id,{mode:'test'});assert.equal(reopened.eligible,true);assert.equal(reopened.qualifying_purchase.order_id,renewed.order.id);
  });
  await t.test('existing same-email creator requires ownership verification instead of automatic role takeover',async()=>{
   const a=await register('artist','collision'),l=await register('listener','collision-listener','OtherListenerFixturePassword123');await pool.query('UPDATE listeners SET email=$1 WHERE id=$2',['collision@affiliate-year.invalid',l.id]);await purchase(l,'quarterly');
   const r=await api('/api/platform/partners/activate',{participating:true},l.cookie);assert.equal(r.status,409);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM account_role_links WHERE artist_id=$1',[a.id])).rows[0].n,0);
  });
 }finally{await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
