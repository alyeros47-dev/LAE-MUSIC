'use strict';
const target=require('./ci-database.cjs').ciDatabase();
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const {runtime}=require('./runtime.cjs'),policy=require('../lib/financial-policy').disclosure(),agreement=require('../lib/creator-agreement');
const {receiptProof}=require('./bank-receipt-fixture.cjs');
const key=()=>crypto.randomUUID(),fixture={enabled:true,invoice_hours:24,account:{bank_name:'Fixture Bank - NOT REAL',account_name:'Fixture business - NOT REAL',account_number:'0000000000',currency:'NGN',country:'NG'}};
test('manual bank purchases preserve prices, approved entitlement and independent receipt review',async t=>{
 const control=new Pool({connectionString:target.href}),schema='manual_bank_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});
 const realFetch=global.fetch;let requests=0;global.fetch=async()=>{requests++;throw Error('Paid providers and external requests are forbidden in this fixture');};
 try{
 const app=await runtime({pool,env:{NODE_ENV:'test',ADMIN_KEY:'ManualBankFixtureAdminOnly12345',MANUAL_BANK_PAYMENTS_JSON:JSON.stringify(fixture),STUDIO_RELEASE_WORKER_ENABLED:'false'}});
 await pool.query("INSERT INTO currency_rate_snapshots(id,source,as_of,next_update,rates) VALUES($1,'exchangerate-api',NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 day',$2)",[key(),JSON.stringify({USD:'1',NGN:'1500'})]);
 const api=async(path,body,cookie,k=key(),headers={})=>{const r=await app.request(path,{method:body===undefined?'GET':'POST',body,headers:{...(cookie?{cookie}:{}),'idempotency-key':k,...headers}});return {status:r.status,data:r.json(),cookie:[r.headers['set-cookie']||[]].flat().map(x=>x.split(';')[0]).join('; ')};};
 const login=await api('/api/admin/login',{password:'ManualBankFixtureAdminOnly12345'});assert.equal(login.status,200,JSON.stringify(login.data));const admin=login.cookie;
 async function account(role,name){const r=await api(role==='artist'?'/api/register':'/api/listener/register',{name,email:name+'@manual-bank.invalid',country:'Nigeria',password:'ManualBankFixture1234',confirmPassword:'ManualBankFixture1234',plan:'starter'});assert.equal(r.status,201,JSON.stringify(r.data));return {id:(r.data.user||r.data.listener).id,cookie:r.cookie};}
 const a=await account('artist','first'),b=await account('artist','second'),listener=await account('listener','listen');
 const prepare=async(owner,kind='artist_subscription',plan='starter')=>{const r=await api('/api/platform/purchases',{kind,plan},owner.cookie);assert.equal(r.status,201,JSON.stringify(r.data));return r.data.order;};
 const start=async(role,owner,order)=>{const r=await api('/api/platform/manual-payments?role='+role,{order_id:order.id,amount_minor:1},owner.cookie);assert.equal(r.status,201,JSON.stringify(r.data));return r.data.payment;};
 const submit=async(role,owner,m)=>{const r=await api('/api/platform/manual-payments/'+m.id+'/submit?role='+role,{payer_name:'Fixture payer',proof:receiptProof()},owner.cookie);assert.equal(r.status,200,JSON.stringify(r.data));return r.data.payment;};
 const details=(m,extra={})=>({decision:'approved',receipt_verified:true,bank_reference:'BANK-ENTRY-'+key(),received_at:new Date().toISOString(),received_amount:(m.charge_minor/100).toFixed(2),currency:m.charge_currency,note:'Independently checked fixture bank receipt.',...extra});
 const approve=async(m,payload=details(m),k=key())=>api('/api/platform/admin/manual-payments/'+m.id+'/review',payload,admin,k);
 let m;
 await t.test('instructions and submitted claims never grant paid benefits; ownership and approval are protected',async()=>{
  const cap=(await api('/api/platform/payments/capabilities')).data;assert.equal(cap.enabled,false);assert.equal(cap.manual_bank.enabled,true);
  const o=await prepare(a);m=await start('artist',a,o);assert.equal(Number(m.base_minor),600);assert.equal(Number(m.charge_minor),900000);assert.equal(m.bank_account.account_number,'0000000000');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_subscriptions')).rows[0].n,0);
  assert.equal((await api('/api/platform/manual-payments/'+m.id+'?role=artist',undefined,b.cookie)).status,404);
  assert.equal((await api('/api/platform/admin/manual-payments/'+m.id+'/review',details(m),a.cookie)).status,401);
  assert.equal((await approve(m)).status,409);
  await submit('artist',a,m);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM commerce_receipts')).rows[0].n,0);
  assert.equal((await approve(m,details(m,{receipt_verified:false}))).status,400);
  assert.equal((await approve(m,details(m,{received_amount:'1.00'}))).status,409);
  assert.equal((await approve(m,details(m,{currency:'USD'}))).status,400);
  assert.equal((await api('/api/platform/admin/manual-payments/'+m.id+'/review',details(m),admin,key(),{origin:'https://evil.invalid','sec-fetch-site':'cross-site'})).status,403);
 });
 await t.test('approval is atomic and idempotent; Starter terms, receipt and presentment reconcile',async()=>{
  const data=details(m),k=key(),results=await Promise.all([approve(m,data,k),approve(m,data,k)]);for(const r of results)assert.equal(r.status,200,JSON.stringify(r.data));assert.equal((await approve(m,data)).status,200);
  const sub=(await pool.query('SELECT * FROM artist_subscriptions WHERE artist_id=$1',[a.id])).rows;assert.equal(sub.length,1);assert.deepEqual([sub[0].included_generations,sub[0].publish_track_limit],[3,6]);
  assert.equal((await require('../lib/commerce').createCommerce({pool}).report()).summary.discrepancies,0);
  await assert.rejects(pool.query("UPDATE manual_bank_reviews SET note='tampered' WHERE payment_id=$1",[m.id]),/history|mutat/i);
  assert.equal((await approve(m,{decision:'rejected',note:'Cannot overwrite a completed approval.'})).status,409);
  const o=await prepare(b),other=await start('artist',b,o);await submit('artist',b,other);assert.equal((await approve(other,{...data,received_at:new Date().toISOString()})).status,409,'One bank entry cannot pay two products');
 });
 await t.test('all three annual artist plans and additional generation purchases use existing quantities and prices',async()=>{
  for(const [plan,amount,generations,tracks]of [['growth',1000,6,12],['professional',2000,15,30]]){const owner=await account('artist',plan),o=await prepare(owner,'artist_subscription',plan),p=await start('artist',owner,o);assert.equal(p.base_minor,amount);await submit('artist',owner,p);assert.equal((await approve(p)).status,200);const s=(await pool.query('SELECT * FROM artist_subscriptions WHERE artist_id=$1',[owner.id])).rows[0];assert.deepEqual([s.included_generations,s.publish_track_limit],[generations,tracks]);const extra=await prepare(owner,'studio_generation',plan),em=await start('artist',owner,extra);assert.equal(em.base_minor,require('../lib/commerce').quote('studio_generation',plan).amount_minor);await submit('artist',owner,em);assert.equal((await approve(em)).status,200);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM studio_purchased_credits WHERE artist_id=$1',[owner.id])).rows[0].n,1);}
  const extra=await prepare(a,'studio_generation','starter'),em=await start('artist',a,extra);await submit('artist',a,em);assert.equal((await approve(em)).status,200);
 });
 await t.test('every existing Premium duration, including $1.80 quarterly, activates only on approval',async()=>{
  for(const plan of require('../lib/premium-pricing').catalog().plans){const o=await api('/api/platform/premium/orders',{plan:plan.code},listener.cookie);assert.equal(o.status,201,JSON.stringify(o.data));const p=await start('listener',listener,o.data);assert.equal(p.base_minor,plan.usd_minor);await submit('listener',listener,p);assert.equal((await pool.query('SELECT 1 FROM premium_entitlements WHERE order_id=$1',[o.data.id])).rowCount,0);const paid=await approve(p);assert.equal(paid.status,200,JSON.stringify(paid.data));const term=(await pool.query('SELECT *,EXTRACT(EPOCH FROM expires_at-starts_at) AS seconds FROM premium_entitlements WHERE order_id=$1',[o.data.id])).rows[0];assert.equal(Number(term.seconds),plan.days*86400);assert.equal((await approve(p)).status,200);}
  assert.equal((await api('/api/platform/premium/status',undefined,listener.cookie)).data.active,true);
 });
 await t.test('rejection, history, protected images and disabled configuration retain all records',async()=>{
  const o=await prepare(b),p=await start('artist',b,o);await submit('artist',b,p);assert.equal((await approve(p,{decision:'rejected',note:'No matching cleared bank receipt was found.'})).status,200);assert.equal((await pool.query('SELECT 1 FROM commerce_receipts WHERE order_id=$1',[o.id])).rowCount,0);
  assert.equal((await api('/api/platform/manual-payments/'+p.id+'?role=artist',undefined,b.cookie)).data.payment.status,'rejected');assert.equal((await api('/api/platform/manual-payments?role=artist',undefined,b.cookie)).data.payments.length,2);
  const closed=await runtime({pool,env:{NODE_ENV:'test',MANUAL_BANK_PAYMENTS_JSON:'{"enabled":true}'}});const c=await closed.request('/api/platform/manual-payments/capabilities');assert.equal(c.json().enabled,false);
  assert.equal((await api('/api/platform/admin/manual-payments?status=approved',undefined,admin)).data.payments.length,12);
 });
 await t.test('a persistence failure rolls back approval, entitlement, receipt and ledger together',async()=>{
  const who=await account('artist','rollback'),o=await prepare(who),p=await start('artist',who,o);await submit('artist',who,p);
  await pool.query("CREATE FUNCTION reject_manual_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'manual fixture persistence failure'; END; $$; CREATE TRIGGER reject_manual_fixture BEFORE INSERT ON commerce_receipts FOR EACH ROW EXECUTE FUNCTION reject_manual_fixture()");
  const data=details(p);try{assert.equal((await approve(p,data)).status,500);}finally{await pool.query('DROP TRIGGER reject_manual_fixture ON commerce_receipts');}
  assert.equal((await pool.query('SELECT 1 FROM manual_bank_reviews WHERE payment_id=$1',[p.id])).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM artist_subscriptions WHERE artist_id=$1',[who.id])).rowCount,0);assert.equal((await api('/api/platform/manual-payments/'+p.id+'?role=artist',undefined,who.cookie)).data.payment.status,'submitted');assert.equal((await approve(p,data)).status,200);
 });
 await t.test('manual payments preserve attribution and hold all newly undecided commissions',async()=>{
  const ref=await account('artist','affiliate'),qual=await prepare(ref),qp=await start('artist',ref,qual);await submit('artist',ref,qp);assert.equal((await approve(qp)).status,200);
  const leader=await account('artist','leader'),lo=await prepare(leader),lm=await start('artist',leader,lo);await submit('artist',leader,lm);assert.equal((await approve(lm)).status,200);await pool.query('UPDATE creators SET referred_by=$1 WHERE id=$2',[leader.id,ref.id]);
  const buyer=await account('artist','referred');await pool.query('UPDATE creators SET referred_by=$1 WHERE id=$2',[ref.id,buyer.id]);const o=await prepare(buyer),p=await start('artist',buyer,o);await submit('artist',buyer,p);assert.equal((await approve(p)).status,200);
  assert.equal((await pool.query('SELECT 1 FROM affiliate_subscription_commissions WHERE referred_artist_id=$1',[buyer.id])).rowCount,0,'New individual allocations remain on hold');
  assert.equal((await pool.query('SELECT 1 FROM affiliate_purchase_opportunities WHERE artist_order_id=$1',[o.id])).rowCount,1);
  const eo=await prepare(buyer,'studio_generation','starter'),ep=await start('artist',buyer,eo);await submit('artist',buyer,ep);assert.equal((await approve(ep)).status,200);assert.equal((await pool.query('SELECT 1 FROM studio_quarterly_team_sales WHERE order_id=$1',[eo.id])).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM affiliate_purchase_opportunities WHERE artist_order_id=$1',[eo.id])).rowCount,1);
  const renewalListener=await account('listener','renewal'),po=await api('/api/platform/premium/orders',{plan:'quarterly',referrer_id:String(ref.id)},renewalListener.cookie),pm=await start('listener',renewalListener,po.data);await submit('listener',renewalListener,pm);assert.equal((await approve(pm)).status,200);assert.equal((await pool.query('SELECT 1 FROM premium_quarterly_team_sales WHERE order_id=$1',[po.data.id])).rowCount,0);
  const renewal=await api('/api/platform/premium/orders',{plan:'monthly',referrer_id:String(leader.id)},renewalListener.cookie);assert.equal(String(renewal.data.referrer_id),String(ref.id),'Manual renewals preserve the verified original referral');const rm=await start('listener',renewalListener,renewal.data);await submit('listener',renewalListener,rm);assert.equal((await approve(rm)).status,200);assert.equal((await pool.query('SELECT 1 FROM premium_commissions WHERE order_id=$1',[renewal.data.id])).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM affiliate_purchase_opportunities WHERE premium_order_id=$1',[renewal.data.id])).rowCount,0,'New Premium policy does not create a held artist allocation');
 });
 await t.test('manual live-book receipts work without enabling gateway live mode or releasing projected royalties',async()=>{
  const who=await account('artist','live_fixture'),o=await prepare(who),rates={snapshot:async()=> (await pool.query('SELECT * FROM currency_rate_snapshots LIMIT 1')).rows[0]},premium=require('../lib/premium-listeners').createPremium({pool,manualPaymentMode:'live'});
  const live=require('../lib/manual-bank-payments').createManualBankPayments({pool,env:{NODE_ENV:'production'},config:fixture,rates,premium}),p=await live.start('artist',who.id,key(),{order_id:o.id,policy_accepted:true,policy_revision:policy.revision});assert.equal(p.mode,'live');await live.submit('artist',who.id,p.id,key(),{payer_name:'Synthetic live-book payer',proof:receiptProof()});
  await live.review({id:'local-fixture-owner',role:'owner',source:'shared_key'},p.id,key(),details(p));assert.equal((await pool.query('SELECT mode FROM payment_presentments WHERE order_id=$1',[o.id])).rows[0].mode,'live');assert.equal(await require('../lib/artist-membership').availableRoyalties(pool,who.id),0);
  assert.equal(require('../lib/payments/runtime').checkoutRuntime({pool,env:{NODE_ENV:'production'}}).enabled(),false);
 });
 await t.test('receipt-only submission and one-click approval need no retyped bank fields and activate exactly once',async()=>{
  const owner=await account('artist','simple'),o=await prepare(owner),p=await start('artist',owner,o),path='/api/platform/manual-payments/'+p.id+'/submit?role=artist',evidence=receiptProof('simple-approval');
  assert.equal((await api(path,{payer_name:'Sender account name'},owner.cookie)).status,400,'A receipt is required');
  assert.equal((await api(path,{payer_name:'',proof:evidence},owner.cookie)).status,400,'A sender name is required');
  assert.equal((await api(path,{payer_name:'Sender',proof:'data:text/html;base64,PHNjcmlwdD4='},owner.cookie)).status,400);
  const input={payer_name:'Sender account name',proof:evidence},submitKey=key();
  const sent=await Promise.all([api(path,input,owner.cookie,submitKey),api(path,input,owner.cookie,submitKey)]);for(const r of sent)assert.equal(r.status,200,JSON.stringify(r.data));
  const submitted=(await pool.query('SELECT * FROM manual_bank_submissions WHERE payment_id=$1',[p.id])).rows[0];assert.equal(submitted.transfer_reference,null);assert.equal(submitted.transferred_at,null);assert.equal(submitted.payer_name,input.payer_name);
  assert.equal((await pool.query('SELECT 1 FROM artist_subscriptions WHERE artist_id=$1',[owner.id])).rowCount,0);
  const queue=(await api('/api/platform/admin/manual-payments?status=submitted',undefined,admin)).data.payments;assert.equal(queue.find(x=>x.id===p.id).payer_name,input.payer_name);
  const privateReceipt=await app.request('/api/platform/admin/manual-payments/'+p.id+'/receipt',{headers:{cookie:admin}});assert.equal(privateReceipt.status,200);assert(privateReceipt.body.equals(submitted.proof));
  assert.equal((await api('/api/platform/manual-payments/'+p.id+'/receipt?role=artist',undefined,b.cookie)).status,404,'Receipt ownership is enforced');
  assert.equal((await approve(p,{decision:'approved'})).status,400,'Bank verification remains mandatory');
  assert.equal((await approve(p,{decision:'approved',receipt_verified:true,received_amount:'1.00'})).status,409,'Cannot override the expected amount');
  const payload={decision:'approved',receipt_verified:true},results=await Promise.all([approve(p,payload),approve(p,payload)]);for(const r of results)assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal((await pool.query('SELECT 1 FROM commerce_receipts WHERE order_id=$1',[o.id])).rowCount,1);
  const review=(await pool.query('SELECT * FROM manual_bank_reviews WHERE payment_id=$1',[p.id])).rows[0];assert.equal(review.verification_method,'receipt_review');for(const name of ['bank_reference','bank_reference_hash','received_at'])assert.equal(review[name],null,'Do not invent '+name);assert.equal(Number(review.received_minor),p.charge_minor);assert.equal(review.receipt_hash,crypto.createHash('sha256').update(submitted.proof).digest('hex'));
  const other=await account('artist','duplicate_image'),op=await start('artist',other,await prepare(other));await api('/api/platform/manual-payments/'+op.id+'/submit?role=artist',{payer_name:'Other sender',proof:evidence},other.cookie);
  assert.equal((await approve(op,payload)).status,409,'The same receipt image cannot activate another purchase');assert.equal((await pool.query('SELECT 1 FROM artist_subscriptions WHERE artist_id=$1',[other.id])).rowCount,0);
  assert.equal((await approve(op,{decision:'rejected'})).status,200,'Rejection needs no typed code or note');
 });
 await t.test('concurrent duplicate receipts activate only one invoice; older submissions remain reviewable',async()=>{
  const evidence=receiptProof('concurrent-duplicate'),pending=[];
  for(const name of ['duplicate_race_one','duplicate_race_two']){const owner=await account('artist',name),p=await start('artist',owner,await prepare(owner));await api('/api/platform/manual-payments/'+p.id+'/submit?role=artist',{payer_name:name,proof:evidence},owner.cookie);pending.push(p);}
  const results=await Promise.all(pending.map(p=>approve(p,{decision:'approved',receipt_verified:true})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const owner=await account('artist','old_pending'),p=await start('artist',owner,await prepare(owner));
  await pool.query("INSERT INTO manual_bank_submissions(payment_id,payer_name,transfer_reference,transferred_at) VALUES($1,'Older sender','OLD-SUBMISSION-ONLY',NOW())",[p.id]);await pool.query("UPDATE manual_bank_payments SET status='submitted' WHERE id=$1",[p.id]);
  assert.equal((await approve(p,{decision:'approved',receipt_verified:true})).status,200,'Do not strand pre-update submitted confirmations');
 });
 assert.equal((await pool.query('SELECT 1 FROM payment_policy_acceptances')).rowCount,0,'No manual bank purchase fabricates customer consent');
 assert.equal(requests,0);
 }finally{global.fetch=realFetch;await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
