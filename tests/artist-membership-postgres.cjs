'use strict';
const target=require('./ci-database.cjs').ciDatabase();
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const {runtime}=require('./runtime.cjs'),agreement=require('../lib/creator-agreement'),terms=require('../lib/membership-terms');
const finance=require('../lib/finance'),{createCommerce}=require('../lib/commerce'),{createMembership,availableRoyalties}=require('../lib/artist-membership');
const key=()=>crypto.randomUUID();
test('annual artist membership, consent, generation terms and funded royalty renewals',async t=>{
 const control=new Pool({connectionString:target.href}),schema='membership_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});
 let external=0;const oldFetch=global.fetch;global.fetch=async()=>{external++;throw Error('Membership tests never contact a real provider.');};
 try{
  const app=await runtime({pool,env:{NODE_ENV:'test',STUDIO_RELEASE_WORKER_ENABLED:'false'}}),payments=new Map();
  const adapter={verified:true,name:'membership_fixture',merchantId:'local_fixture',verifyEvent:async raw=>JSON.parse(raw),retrievePayment:async id=>payments.get(id)};
  const commerce=createCommerce({pool,adapter}),membership=createMembership({pool,commerce}),a=agreement.disclosure();
  const api=async(path,body,cookie,requestKey=key(),headers={})=>{const r=await app.request(path,{method:body===undefined?'GET':'POST',body,headers:{...(cookie?{cookie}:{}),'idempotency-key':requestKey,...headers}});return {status:r.status,data:()=>r.json(),cookie:(Array.isArray(r.headers['set-cookie'])?r.headers['set-cookie']:[r.headers['set-cookie']]).filter(Boolean).map(s=>s.split(';')[0]).join('; ')};};
  async function artist(name){const r=await api('/api/register',{name,country:'Nigeria',email:name+'@membership.invalid',password:'MembershipFixture1234',confirmPassword:'MembershipFixture1234',plan:'starter'});assert.equal(r.status,201);return {id:r.data().user.id,cookie:r.cookie};}
  const artist1=await artist('annual_one'),artist2=await artist('annual_two');
  const accept=id=>agreement.accept(pool,id,{accepted:true,version:a.version,content_hash:a.content_hash});
  const funding=(id,n,kind='funded_finalized_streaming_royalty')=>require('../lib/transactions').transaction(pool,db=>finance.transfer(db,'membership-fixture:'+key(),kind,'USD',n,'platform:fixture:USD',finance.earnedAccount(id,'USD'),id));
  const renewal=plan=>({plan,amount_minor:require('../lib/commerce').quote('artist_subscription',plan).amount_minor,currency:'USD',deduction_consent:true,agreement_version:a.version,agreement_hash:a.content_hash});
  async function pay(order){const id='payment_'+key();payments.set(id,{id,orderId:order.id,merchantId:adapter.merchantId,currency:'USD',amountMinor:Number(order.amount_minor),status:'paid'});const x=await commerce.ingest(Buffer.from(JSON.stringify({id:key(),paymentId:id})),{});assert.equal(x.outcome,'accepted');return (await pool.query('SELECT * FROM artist_subscriptions WHERE id=(SELECT subscription_id FROM commerce_orders WHERE id=$1)',[order.id])).rows[0];}
  await t.test('new package catalogue uses approved annual quantities; proposed extras never silently change charges',async()=>{
   const p=(await api('/api/plans')).data().plans;assert.deepEqual(Object.values(p).map(p=>[p.usd,p.studioGenerations,p.uploads,p.tracksPerGeneration]),[[6,3,6,2],[10,6,12,2],[20,15,30,2]]);
   for(const [plan,value]of Object.entries({starter:2,growth:1.8,professional:1.5})){const price=terms.additionalPrice(plan);assert.equal(price.proposed_usd,value);assert.equal(price.approved,false);assert.equal(require('../lib/commerce').quote('studio_generation',plan).amount_minor,Math.round(price.effective_usd*100));}
  });
  await t.test('agreement is public, acceptance is explicit, versioned, immutable and scoped to the account',async()=>{
   assert.equal((await api('/api/artist/agreement')).status,200);assert.equal((await api('/api/platform/membership')).status,401);
   for(const input of [{accepted:false,version:a.version,content_hash:a.content_hash},{accepted:true,version:'old',content_hash:a.content_hash},{accepted:true,version:a.version,content_hash:'0'.repeat(64)}])assert.equal((await api('/api/platform/membership/agreement',input,artist1.cookie)).status,400);
   const first=await accept(artist1.id),second=await accept(artist1.id);assert.equal(first.id,second.id);assert.equal(await agreement.accepted(pool,artist2.id),null);
   await assert.rejects(pool.query("UPDATE creator_agreement_acceptances SET version='forged' WHERE id=$1",[first.id]),/history|mutat/i);
   assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM membership_royalty_renewals')).rows[0].n,0);
  });
  await t.test('verified purchase snapshots the new yearly entitlement and independent extra order terms',async()=>{
   const order=await commerce.create(artist1.id,key(),{kind:'artist_subscription',plan:'starter'}),sub=await pay(order);assert.deepEqual([sub.included_generations,sub.publish_track_limit],[3,6]);
   const extra=await commerce.create(artist1.id,key(),{kind:'studio_generation',plan:'starter'});await payExtra(extra);
   async function payExtra(o){const id='extra_'+key();payments.set(id,{id,orderId:o.id,merchantId:adapter.merchantId,currency:'USD',amountMinor:Number(o.amount_minor),status:'paid'});assert.equal((await commerce.ingest(Buffer.from(JSON.stringify({id:key(),paymentId:id})),{})).outcome,'accepted');}
   assert.equal(String((await pool.query('SELECT subscription_id FROM membership_generation_terms WHERE order_id=$1',[extra.id])).rows[0].subscription_id),String(sub.id));
   const allowance=(await api('/api/artist/studio-allowance',undefined,artist1.cookie)).data();assert.equal(allowance.included_generations,3);assert.equal(allowance.purchased_generations_remaining,1);assert.equal(allowance.remaining_generations,4);assert.equal((await api('/api/artist/subscription',undefined,artist1.cookie)).data().upload_limit,8);
  });
  await t.test('real generation reservation enforces each new annual quota and restores a rejected provider request',async()=>{
   const vm=require('node:vm'),fs=require('node:fs'),{createRequire}=require('node:module'),path=require('node:path');
   let calls=0,reject=false;const sandbox={module:{exports:{}},console,process:{env:{MUSICAPI_API_KEY:'local_fixture_only'}},URL,AbortController,setTimeout,clearTimeout,require:createRequire(path.resolve('musicapi-sonic.js')),fetch:async()=>{calls++;return reject?{ok:false,status:400,json:async()=>({error:'fixture provider rejection'}),headers:{get:()=>null}}:{ok:true,status:200,json:async()=>({task_id:'membership_audio_'+key().replaceAll('-','')})};}};
   vm.runInNewContext(fs.readFileSync('musicapi-sonic.js','utf8'),sandbox);
   for(const [plan,limit]of [['starter',3],['growth',6],['professional',15]]){
    const who=await artist('quota_'+plan),sub=await pay(await commerce.create(who.id,key(),{kind:'artist_subscription',plan}));
    const run=async()=>{const req={method:'POST',url:'/api/music/sonic/create',headers:{'idempotency-key':key()},async *[Symbol.asyncIterator](){yield JSON.stringify({title:'Quota fixture',lyrics:'These original words are a short local fixture for annual membership tests.',style:'Gospel acoustic guitar'});}},res={writeHead(n){this.status=n;},end(data){this.data=JSON.parse(data);}};await sandbox.module.exports(req,res,'/api/music/sonic/create',{me:async()=>who,pool,validOrigin:()=>true});return res;};
    reject=true;const failed=await run();assert.equal(failed.status,502);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_studio_usage WHERE subscription_id=$1',[sub.id])).rows[0].n,0);reject=false;
    for(let i=0;i<limit;i++){const r=await run();assert.equal(r.status,200,JSON.stringify(r.data));await pool.query("UPDATE sonic_test_tasks SET status='succeeded',created_at=NOW()-INTERVAL '2 days' WHERE task_id=$1",[r.data.task_id]);}
    const before=calls,blocked=await run();assert.equal(blocked.status,402);assert.equal(calls,before,'Exhausted quota never contacts the provider');assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_studio_usage WHERE subscription_id=$1',[sub.id])).rows[0].n,limit);
   }
  });
  await t.test('completed generation retains two separate account-linked upload codes without paid calls',async()=>{
   const task='membership_task_123';await pool.query("INSERT INTO sonic_test_tasks(task_id,creator_id,status) VALUES($1,$2,'succeeded')",[task,artist1.id]);
   const provider={clips:async()=>['clip_membership_a','clip_membership_b'].map((clip_id,i)=>({clip_id,title:'Separate song '+i,audio_url:'https://fixture.invalid/'+i}))};
   const issue=clipId=>require('../lib/music-upload-codes').issue({pool,provider,artistId:artist1.id,taskId:task,clipId,download:async()=>({bytes:Buffer.alloc(2048,1)})});
   const [one,two]=await Promise.all(['clip_membership_a','clip_membership_b'].map(issue));assert.notEqual(one.uploadCode,two.uploadCode);assert.equal((await issue('clip_membership_a')).uploadCode,one.uploadCode);assert.notEqual(one.generation_id,two.generation_id);
  });
  await t.test('unaccepted agreement blocks new creation even with a paid package',async()=>{
   await pay(await commerce.create(artist2.id,key(),{kind:'artist_subscription',plan:'growth'}));
   for(const p of ['/api/music/sonic/create','/api/music/upload/start'])assert.equal((await api(p,{},artist2.cookie)).status,428,p);
   assert.equal((await api('/api/platform/membership',undefined,artist2.cookie)).status,200);
  });
  await t.test('unfunded earnings, missing consent, wrong amounts, cross-site and foreign accounts cannot deduct royalties',async()=>{
   await funding(artist1.id,5000,'pending_product_commission');assert.equal(await availableRoyalties(pool,artist1.id),0);
   await assert.rejects(membership.renew(artist1.id,key(),renewal('starter')),e=>e.status===409);
   for(const data of [{...renewal('starter'),deduction_consent:false},{...renewal('starter'),amount_minor:1},{...renewal('starter'),currency:'NGN'}])await assert.rejects(membership.renew(artist1.id,key(),data),e=>e.status===400);
   assert.equal((await api('/api/platform/membership/renew',renewal('starter'),artist1.cookie,key(),{origin:'https://evil.invalid','sec-fetch-site':'cross-site'})).status,403);
   assert.equal((await api('/api/platform/membership/renew',renewal('starter'))).status,401);
  });
  await t.test('one-time royalty renewal deducts once under concurrent retries and starts after the active year',async()=>{
   await funding(artist1.id,2000);const before=(await membership.status(artist1.id)).active_subscription,k=key();
   const results=await Promise.all(Array.from({length:5},()=>membership.renew(artist1.id,k,renewal('growth'))));assert(results.every(r=>r.order_id===results[0].order_id));assert.equal(await availableRoyalties(pool,artist1.id),1000);
   const sub=(await pool.query('SELECT * FROM artist_subscriptions WHERE id=$1',[results[0].subscription_id])).rows[0];assert.equal(+sub.starts_at,+new Date(before.expires_at));assert.equal(sub.included_generations,6);assert.equal(sub.publish_track_limit,12);
   assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM membership_royalty_renewals')).rows[0].n,1);assert.equal((await commerce.report()).summary.discrepancies,0);
   const reconciliation=await require('../lib/reconciliation').createReconciliation({pool}).overview({currency:'USD',mode:'all'});
   const externalSales=(await pool.query("SELECT SUM(amount_minor)::text AS total FROM commerce_receipts WHERE provider<>'royalty_balance'")).rows[0].total;
   assert.equal(reconciliation.totals.filter(x=>x.product==='artist').reduce((n,x)=>n+Number(x.gross_minor),0),Number(externalSales));
   await assert.rejects(membership.renew(artist1.id,key(),renewal('starter')),e=>e.status===409&&/already scheduled/.test(e.message));
   await assert.rejects(membership.renew(artist1.id,k,renewal('starter')),e=>e.status===409);
  });
  await t.test('expiry keeps songs, dashboard and records accessible while creation and publishing require renewal',async()=>{
   const track=(await pool.query("INSERT INTO music_tracks(creator_id,title,genre,audio_key,audio_mime,audio_bytes,status,published_at) VALUES($1,'Kept forever','Gospel','fixture/original.mp3','audio/mpeg',2048,'published',NOW()) RETURNING id",[artist2.id])).rows[0];
   await pool.query("UPDATE artist_subscriptions SET starts_at=NOW()-INTERVAL '2 years',expires_at=NOW()-INTERVAL '1 day' WHERE artist_id=$1",[artist2.id]);await accept(artist2.id);
   assert.equal((await membership.status(artist2.id)).status,'expired');assert.equal((await api('/api/platform/artist-overview',undefined,artist2.cookie)).status,200);
   assert.equal((await api('/api/artist/subscription',undefined,artist2.cookie)).data().artist_features_active,false);
   for(const p of ['/api/music/sonic/create','/api/music/upload/start','/api/platform/studio/releases/1/publish'])assert.equal((await api(p,{},artist2.cookie)).status,402,p);
   assert.equal((await pool.query('SELECT status FROM music_tracks WHERE id=$1',[track.id])).rows[0].status,'published');
   assert.equal((await require('../lib/artist-access').status(pool,artist2.id,{LAE_ARTIST_STUDIO_TESTING:'1'})).active,false);
   await funding(artist2.id,600);const renewalResult=await membership.renew(artist2.id,key(),renewal('starter'));assert.equal((await membership.status(artist2.id)).status,'active');assert(renewalResult.subscription_id);
  });
  await t.test('held subscription benefits block a royalty charge until payment review is resolved',async()=>{
   const who=await artist('held_renewal');await accept(who.id);await funding(who.id,600);const sub=await pay(await commerce.create(who.id,key(),{kind:'artist_subscription',plan:'starter'}));await pool.query('UPDATE artist_subscriptions SET payment_hold=TRUE WHERE id=$1',[sub.id]);
   assert.equal((await membership.status(who.id)).status,'payment_review');await assert.rejects(membership.renew(who.id,key(),renewal('starter')),e=>e.status===409&&/under review/.test(e.message));assert.equal(await availableRoyalties(pool,who.id),600);
  });
  await t.test('customer HTTP renewal uses the signed-in account and stores exact one-time consent',async()=>{
   const who=await artist('http_renewal');const accepted=await api('/api/platform/membership/agreement',{accepted:true,version:a.version,content_hash:a.content_hash},who.cookie);assert.equal(accepted.status,200);
   await funding(who.id,600);const k=key(),data={...renewal('starter'),artist_id:artist1.id};
   const first=await api('/api/platform/membership/renew',data,who.cookie,k);assert.equal(first.status,200,JSON.stringify(first.data()));const second=await api('/api/platform/membership/renew',data,who.cookie,k);assert.equal(second.status,200);assert.deepEqual(second.data(),first.data());
   assert.equal(await availableRoyalties(pool,who.id),0);const record=(await pool.query('SELECT * FROM membership_royalty_renewals WHERE order_id=$1',[first.data().order_id])).rows[0];assert.equal(String(record.artist_id),String(who.id));assert.equal(Number(record.amount_minor),600);assert.equal(record.deduction_consent,true);assert.match(record.consent_text,/USD 6.00/);
  });
  await t.test('simultaneous withdrawal and renewal cannot spend the same funded royalties',async()=>{
   const who=await artist('royalty_race');await accept(who.id);await funding(who.id,600);
   const results=await Promise.allSettled([membership.renew(who.id,key(),renewal('starter')),finance.requestWithdrawal(pool,who.id,key(),'USD',600)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await finance.balance(pool,finance.earnedAccount(who.id,'USD')),0);
  });
  await t.test('failed consent persistence rolls the charge, subscription and receipts back together',async()=>{
   const who=await artist('rollback_member');await accept(who.id);await funding(who.id,600);
   await pool.query("CREATE FUNCTION reject_renewal_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture persistence failure'; END; $$; CREATE TRIGGER reject_renewal_fixture BEFORE INSERT ON membership_royalty_renewals FOR EACH ROW EXECUTE FUNCTION reject_renewal_fixture()");
   await assert.rejects(membership.renew(who.id,key(),renewal('starter')),/fixture persistence failure/);await pool.query('DROP TRIGGER reject_renewal_fixture ON membership_royalty_renewals');
   assert.equal(await availableRoyalties(pool,who.id),600);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_subscriptions WHERE artist_id=$1',[who.id])).rows[0].n,0);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM commerce_receipts r JOIN commerce_orders o ON o.id=r.order_id WHERE o.artist_id=$1',[who.id])).rows[0].n,0);
  });
  await t.test('renewal reminders are deduplicated and suppress an already scheduled term',async()=>{
   const who=await artist('reminder_member');const sub=await pay(await commerce.create(who.id,key(),{kind:'artist_subscription',plan:'starter'}));const notices=require('../lib/artist-notifications').createArtistNotifications({pool,env:{}});
   for(const days of [29,6,0.5,-0.5]){await pool.query("UPDATE artist_subscriptions SET expires_at=NOW()+$2*INTERVAL '1 day' WHERE id=$1",[sub.id,days]);await notices.remind(who.id);const count=(await notices.list(who.id)).notifications.length;await notices.remind(who.id);assert.equal((await notices.list(who.id)).notifications.length,count);}
   assert.equal((await notices.list(who.id)).notifications.filter(n=>n.kind==='subscription').length,4);
   await pool.query("UPDATE artist_subscriptions SET expires_at=NOW()+INTERVAL '10 days' WHERE id=$1",[sub.id]);
   await pay(await commerce.create(who.id,key(),{kind:'artist_subscription',plan:'starter'}));
   const before=(await pool.query("SELECT COUNT(*)::int AS n FROM artist_notifications WHERE artist_id=$1 AND kind='subscription'",[who.id])).rows[0].n;await notices.remind(who.id);
   assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM artist_notifications WHERE artist_id=$1 AND kind='subscription'",[who.id])).rows[0].n,before);
  });
  assert.equal(external,0);
 }finally{global.fetch=oldFetch;await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
