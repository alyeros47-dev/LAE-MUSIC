'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {quote,royaltySplit,createCommerce}=require('../lib/commerce');
const {subscriptionView}=require('../lib/subscription-view');
test('purchase quotes use approved server prices and reject unsupported products and prototype plans',()=>{
 for(const [plan,subscription,extra]of [['starter',600,300],['growth',1000,250],['professional',2000,200]]){assert.equal(quote('artist_subscription',plan).amount_minor,subscription);assert.equal(quote('studio_generation',plan).amount_minor,extra);assert.equal(quote('studio_generation',plan).quantity,1);}
 for(const [kind,plan]of [['recruitment','starter'],['download','growth'],['artist_subscription','constructor'],['studio_generation','__proto__']])assert.throws(()=>quote(kind,plan));
});
test('legacy non-streaming allocation snapshots preserve historical shares and exact integer totals without minting ledger funds',()=>{
 for(const plan of ['starter','growth','professional'])for(const amount of [0,1,99,101,100000000]){const r=royaltySplit(amount,plan);assert.equal(r.artist_minor+r.platform_minor,amount);assert.equal(r.royalty_percent,plan==='professional'?60:50);}
 assert.deepEqual(royaltySplit(101,'professional'),{eligible_minor:101,artist_minor:61,platform_minor:40,royalty_percent:60});
 for(const amount of [-1,1.1,'100',Infinity,NaN,100000001])assert.throws(()=>royaltySplit(amount,'starter'));assert.throws(()=>royaltySplit(100,'__proto__'));
});
test('no payment adapter or an incomplete adapter can activate verified settlement',async()=>{
 for(const adapter of [null,{verified:true},{verified:true,name:'fixture',merchantId:'merchant',verifyEvent(){}}]){const commerce=createCommerce({pool:{query(){throw Error('Database must not be queried');}},adapter});assert.equal(commerce.enabled(),false);await assert.rejects(commerce.ingest(Buffer.from('{}'),{}),e=>e.status===503);}
});
test('signature rejection stops before provider retrieval or financial writes',async()=>{
 let calls=0;const commerce=createCommerce({pool:{query(){calls++;}},adapter:{verified:true,name:'fixture',merchantId:'merchant',verifyEvent(){throw Object.assign(Error('Invalid signature'),{status:401});},retrievePayment(){calls++;}}});
 await assert.rejects(commerce.ingest(Buffer.from('{"paid":true}'),{}),/signature/);assert.equal(calls,0);
});
test('empty or oversized original webhook bytes are rejected before verification',async()=>{
 const commerce=createCommerce({pool:null,adapter:{verified:true,name:'fixture',merchantId:'merchant',verifyEvent(){throw Error('Must not verify');},retrievePayment(){}}});
 for(const raw of [Buffer.alloc(0),Buffer.alloc(200001),'{}',{}])await assert.rejects(commerce.ingest(raw,{}),e=>e.status===400);
});
test('invalid purchase bodies and unsupported referrals fail before touching the database',async()=>{
 const commerce=createCommerce({pool:{connect(){throw Error('Must not connect');}}});
 for(const input of [null,[],false,{kind:'free_reward',plan:'starter'},{kind:'artist_subscription',plan:'constructor'},{kind:'studio_generation',plan:'starter',referral_token:'a'.repeat(64)}])await assert.rejects(commerce.create(1,'purchase_key_123456',input),e=>e.status===400);
});
test('provider lookup failures remain retriable and never record a successful event',async()=>{
 const calls=[];const commerce=createCommerce({pool:{query:async sql=>{calls.push(sql);return {rowCount:0,rows:[]};},connect(){throw Error('Must not start settlement');}},adapter:{verified:true,name:'fixture',merchantId:'merchant',verifyEvent:async()=>({id:'event1',paymentId:'payment1'}),retrievePayment:async()=>{throw Error('Provider timeout');}}});
 await assert.rejects(commerce.ingest(Buffer.from('{}'),{}),/timeout/);assert.equal(calls.length,1);assert(calls[0].startsWith('SELECT'));
});
test('active package stays authoritative when a different future renewal exists',async()=>{
 const active={id:1,plan:'starter',starts_at:'2026-01-01',expires_at:'2027-01-01'};const future={id:2,plan:'professional',starts_at:'2027-01-01',expires_at:'2028-01-01',upcoming:true};const calls=[];
 const pool={query:async(sql,args)=>{calls.push({sql,args});return sql.includes('COUNT(*)')?{rows:[{n:3}]}:sql.includes('starts_at<=NOW()')?{rowCount:1,rows:[active]}:{rows:[future,{...active,upcoming:false}]};}};
 const result=await subscriptionView(pool,9,'professional');assert.equal(result.artist_features_active,true);assert.equal(result.plan,'starter');assert.equal(result.subscription.id,1);assert.equal(result.upload_limit,7);assert.deepEqual(result.upcoming_subscriptions,[future]);assert.equal(calls.find(c=>c.sql.includes('COUNT(*)')).args[1],active.starts_at);
});
test('future-only subscription does not activate access or look like an expired package',async()=>{
 const pool={query:async sql=>sql.includes('COUNT(*)')?{rows:[{n:0}]}:sql.includes('starts_at<=NOW()')?{rowCount:0,rows:[]}:{rows:[{id:2,plan:'growth',upcoming:true}]}};
 const result=await subscriptionView(pool,9,'growth');assert.equal(result.artist_features_active,false);assert.equal(result.subscription,null);assert.equal(result.upcoming_subscriptions.length,1);assert.equal(result.expired,false);
});
