'use strict';
const target=require('./ci-database.cjs').ciDatabase(),{Pool}=require('pg'),crypto=require('node:crypto'),assert=require('node:assert/strict'),test=require('node:test');
const {runtime}=require('./runtime.cjs'),{receiptProof}=require('./bank-receipt-fixture.cjs'),framework=require('../lib/affiliate-framework'),key=()=>crypto.randomUUID();
test('Premium referrals: 20% direct, 10% exactly two steps, refunds, renewals and quarterly close',async t=>{
 const control=new Pool({connectionString:target.href}),schema='premium_referrals_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});const oldFetch=global.fetch;let external=0;global.fetch=async()=>{external++;throw Error('External paid services forbidden');};
 try{
  const app=await runtime({pool,env:{NODE_ENV:'test',ADMIN_KEY:'ReferralFixtureOwner123456789',STUDIO_RELEASE_WORKER_ENABLED:'false',MANUAL_BANK_PAYMENTS_JSON:JSON.stringify({enabled:true,invoice_hours:24,account:{bank_name:'Fixture - NOT REAL',account_name:'Fixture - NOT REAL',account_number:'0000000000',currency:'NGN',country:'NG'}})}});
  await pool.query("INSERT INTO currency_rate_snapshots(id,source,as_of,next_update,rates) VALUES($1,'exchangerate-api',NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 day',$2)",[key(),JSON.stringify({USD:'1',NGN:'1500'})]);
  const api=async(path,body,cookie,k=key())=>{const r=await app.request(path,{method:body===undefined?'GET':'POST',body,headers:{...(cookie?{cookie}:{}),'idempotency-key':k}});return {status:r.status,data:r.json(),cookie:[r.headers['set-cookie']||[]].flat().map(v=>v.split(';')[0]).join('; ')};};
  const admin=(await api('/api/admin/login',{password:'ReferralFixtureOwner123456789'})).cookie;
  const register=async name=>{const r=await api('/api/listener/register',{name,email:name+'@referral-fixture.invalid',country:'Nigeria',password:'ReferralFixturePassword123',confirmPassword:'ReferralFixturePassword123'});assert.equal(r.status,201,JSON.stringify(r.data));return {id:r.data.user.id,cookie:r.cookie};};
  async function purchase(user,ref,plan='quarterly'){
   const o=await api('/api/platform/premium/orders',{plan,...(ref?{referrer_id:String(ref)}:{})},user.cookie);assert.equal(o.status,201,JSON.stringify(o.data));
   const m=await api('/api/platform/manual-payments?role=listener',{order_id:o.data.id},user.cookie);assert.equal(m.status,201,JSON.stringify(m.data));const payment=m.data.payment;
   const sent=await api('/api/platform/manual-payments/'+payment.id+'/submit?role=listener',{payer_name:'Synthetic sender',proof:receiptProof()},user.cookie);assert.equal(sent.status,200,JSON.stringify(sent.data));
   return {order:o.data,payment,approve:async()=>{const r=await api('/api/platform/admin/manual-payments/'+payment.id+'/review',{decision:'approved',receipt_verified:true},admin);assert.equal(r.status,200,JSON.stringify(r.data));return r;}};
  }
  async function join(user){const r=await api('/api/platform/partners/activate',{participating:true},user.cookie);assert.equal(r.status,200,JSON.stringify(r.data));user.cookie=r.cookie;user.artist=r.data.artist_id;return user;}
  let leader,john,johnPurchase,orders=[],buyers=[];
  await t.test('free opt-in alone earns nothing; the approved quarterly price and copy-link target remain $1.80',async()=>{
   leader=await register('leader');await join(leader);assert.equal((await api('/api/affiliate/product-links',undefined,leader.cookie)).status,402);
   const own=await purchase(leader);await own.approve();const links=await api('/api/affiliate/product-links',undefined,leader.cookie);assert.equal(links.status,200,JSON.stringify(links.data));assert.equal(new URL(links.data.links.premium).pathname,'/premium');assert.equal(new URL(links.data.links.premium).searchParams.get('plan'),'quarterly');assert.equal(new URL(links.data.links.premium).searchParams.get('ref'),String(leader.artist));assert.equal(Number(own.order.amount_minor),180);
  });
  await t.test('Premium guest payment carries the link and bank approval date into the correct registered account',async()=>{
   const boot=await api('/api/platform/guest-payments'),guest=boot.cookie,start=await api('/api/platform/guest-payments',{email:'guest_premium@referral-fixture.invalid',kind:'premium_listener',plan:'quarterly',ref:String(leader.artist)},guest);assert.equal(start.status,201,JSON.stringify(start.data));const p=start.data.purchase.payment;
   const sent=await api('/api/platform/guest-payments/'+p.id+'/submit',{payer_name:'Synthetic guest sender',proof:receiptProof()},guest);assert.equal(sent.status,200);const checked=await api('/api/platform/admin/manual-payments/'+p.id+'/review',{decision:'approved',receipt_verified:true},admin);assert.equal(checked.status,200);
   const user=await register('guest_premium'),claim=await api('/api/platform/guest-payments/claim',{},guest+'; '+user.cookie);assert.equal(claim.status,200,JSON.stringify(claim.data));
   const r=(await pool.query('SELECT r.verified_at,c.amount_minor,c.beneficiary_id FROM premium_receipts r JOIN premium_commissions c ON c.order_id=r.order_id WHERE r.order_id=$1',[claim.data.order_id])).rows[0],review=(await pool.query('SELECT reviewed_at FROM manual_bank_reviews WHERE payment_id=$1',[p.id])).rows[0];assert.equal(r.verified_at.getTime(),review.reviewed_at.getTime());assert.equal(Number(r.amount_minor),36);assert.equal(String(r.beneficiary_id),String(leader.artist));
  });
  await t.test('John purchase grants the leader 36 cents only after bank approval; John keeps original referral',async()=>{
   john=await register('john');const p=await purchase(john,leader.artist);assert.equal((await pool.query('SELECT 1 FROM premium_commissions WHERE order_id=$1',[p.order.id])).rowCount,0);await p.approve();await p.approve();johnPurchase=p.order;
   const c=(await pool.query('SELECT * FROM premium_commissions WHERE order_id=$1',[p.order.id])).rows;assert.equal(c.length,1);assert.deepEqual([String(c[0].beneficiary_id),c[0].level,c[0].percent,Number(c[0].amount_minor)],[String(leader.artist),1,20,36]);await join(john);
  });
  await t.test('five paid referrals give John 20% each and build 10% only for his leader',async()=>{
   for(let n=0;n<5;n++){const buyer=await register('buyer'+n),p=await purchase(buyer,john.artist);assert.equal(String(p.order.indirect_id),String(leader.artist));await p.approve();orders.push(p.order);buyers.push(buyer);}
   const ids=orders.map(o=>o.id),direct=(await pool.query('SELECT beneficiary_id,level,percent,amount_minor FROM premium_commissions WHERE order_id=ANY($1::uuid[])',[ids])).rows,team=(await pool.query('SELECT * FROM premium_quarterly_team_sales WHERE order_id=ANY($1::uuid[])',[ids])).rows;
   assert.equal(direct.length,5);for(const c of direct)assert.deepEqual([String(c.beneficiary_id),c.level,c.percent,Number(c.amount_minor)],[String(john.artist),1,20,36]);assert.equal(team.length,5);for(const c of team){assert.equal(String(c.team_leader_id),String(leader.artist));assert.equal(Number(c.reserved_minor),18);assert.equal(c.policy_revision,framework.PREMIUM_REVISION);}
   const report=(await api('/api/platform/partners/accounting?mode=test',undefined,leader.cookie)).data;assert.equal(report.rollup.team.eligible_sales,5);assert.equal(report.team_projection_minor,90);assert.equal(report.rollup.direct.recorded_commission_minor,72);assert.equal(report.team_by_referrer[0].eligible_minor,900);
   const jr=(await api('/api/platform/partners/accounting?mode=test',undefined,john.cookie)).data;assert.equal(jr.rollup.direct.recorded_commission_minor,180);assert.equal(jr.team_projection_minor,0,'John gets no second bonus on his own direct five');
   assert.equal((await require('../lib/finance').balance(pool,'artist:'+leader.artist+':earned:USD')),0,'Earning records do not invent settled bank money');
  });
  await t.test('renewal keeps original referrer and second-step parent, even after listening expires',async()=>{
   const u=await register('renewing'),first=await purchase(u,john.artist);await first.approve();const renewal=await purchase(u,leader.artist,'monthly');assert.equal(String(renewal.order.referrer_id),String(john.artist));assert.equal(String(renewal.order.indirect_id),String(leader.artist));await renewal.approve();
   const c=(await pool.query('SELECT amount_minor FROM premium_commissions WHERE order_id=$1',[renewal.order.id])).rows[0];assert.equal(Number(c.amount_minor),12);assert.equal(Number((await pool.query('SELECT reserved_minor FROM premium_quarterly_team_sales WHERE order_id=$1',[renewal.order.id])).rows[0].reserved_minor),6);
  });
  await t.test('a third referral level does not pay the first leader, and free or opted-out partners cannot earn',async()=>{
   await join(buyers[0]);const grandchild=await register('third_level'),p=await purchase(grandchild,buyers[0].artist);await p.approve();const team=(await pool.query('SELECT team_leader_id FROM premium_quarterly_team_sales WHERE order_id=$1',[p.order.id])).rows[0];assert.equal(String(team.team_leader_id),String(john.artist));assert.notEqual(String(team.team_leader_id),String(leader.artist));
   const free=await register('free_partner');await join(free);const u=await register('free_referred'),unqualified=await purchase(u,free.artist);await unqualified.approve();assert.equal((await pool.query('SELECT 1 FROM premium_commissions WHERE order_id=$1',[unqualified.order.id])).rowCount,0);
   const opted=await api('/api/platform/partners/participation',{participating:false},buyers[0].cookie);assert.equal(opted.status,200);const newBuyer=await register('opted_out_referred'),op=await purchase(newBuyer,buyers[0].artist);await op.approve();assert.equal((await pool.query('SELECT 1 FROM premium_commissions WHERE order_id=$1',[op.order.id])).rowCount,0,'Opted-out affiliates earn no new direct commission');
   const future=new Date(Date.now()+400*86400000);assert.equal((await require('../lib/affiliate-access').status(pool,leader.artist,{at:future,mode:'test'})).eligible,true);assert.equal(await require('../lib/premium-listeners').createPremium({pool,now:()=>future.getTime()}).active(leader.id),null,'Expired listening does not extend paid benefits');
  });
  await t.test('approved 30/35/35 revenue remains balanced for fully and partly assigned Premium sales',async()=>{
   const royalties=require('../lib/streaming-royalties').createRoyalties(pool);
   for(const row of (await pool.query('SELECT order_id FROM premium_receipts')).rows)await royalties.costs(key(),{order_id:row.order_id,fees_minor:0,tax_minor:0,evidence:'Synthetic receipt classification for the focused referral test.'});
   for(const [id,unassigned]of [[johnPurchase.id,18],[orders[0].id,0]]){
    const term=(await pool.query('SELECT * FROM premium_entitlements WHERE order_id=$1',[id])).rows[0],end=new Date(term.expires_at),date=new Date(term.starts_at);date.setUTCDate(1);date.setUTCHours(0,0,0,0);const totals={gross:0,commissions:0,unassigned:0,artist:0,platform:0};
    while(date<end){const report=await royalties.preview(date.toISOString().slice(0,7),'test','USD'),l=report.lines.find(x=>x.order_id===id);if(l){totals.gross+=l.gross_minor;totals.commissions+=l.commissions_minor;totals.unassigned+=l.unallocated_affiliate_minor;totals.artist+=l.artist_pool_share_minor;totals.platform+=l.platform_share_minor;assert(l.unallocated_affiliate_minor>=0&&l.unallocated_affiliate_minor<=l.commissions_minor);}date.setUTCMonth(date.getUTCMonth()+1);}
    assert.deepEqual(totals,{gross:180,commissions:54,unassigned,artist:63,platform:63});
   }
  });
  await t.test('simulated refund and dispute records remove eligible earnings and hold quarter close',async()=>{
   const user=await register('refunded'),p=await purchase(user,john.artist);await p.approve();
   await require('../lib/transactions').transaction(pool,async db=>{
    await db.query("INSERT INTO premium_reversals(order_id,provider,merchant_id,refund_id,amount_minor,reason) SELECT order_id,provider,merchant_id,$2,amount_minor,'Synthetic verified refund evidence' FROM premium_receipts WHERE order_id=$1",[p.order.id,key()]);
    await require('../lib/partner-attribution').reversePremiumTeam(db,{order_id:p.order.id,mode:'test'});
   });
   const report=(await api('/api/platform/partners/accounting?mode=test',undefined,leader.cookie)).data,line=report.activity.find(x=>x.order_id===p.order.id);assert.equal(line.eligible_minor,0);assert.equal(line.refund_minor,180);
   const holdLeader=await register('hold_leader'),own=await purchase(holdLeader);await own.approve();await join(holdLeader);const holdJohn=await register('hold_john'),jp=await purchase(holdJohn,holdLeader.artist);await jp.approve();await join(holdJohn);const holdBuyer=await register('hold_buyer'),hp=await purchase(holdBuyer,holdJohn.artist);await hp.approve();
   await pool.query("INSERT INTO premium_payment_reviews(order_id,reason) VALUES($1,'Synthetic unresolved bank dispute')",[hp.order.id]);
   const quarter=require('../lib/partner-policy').periodForSale(new Date()),end=new Date(require('../lib/partner-policy').period(quarter).end),closed=require('../lib/partner-statements').create({pool,now:()=>end}),held=await closed.preview(holdLeader.artist,{quarter,mode:'test'});assert.equal(held.can_finalize,false);

  });
  await t.test('quarterly calculation cannot release early; after close it awards once and preserves all source receipts',async()=>{
   const period=require('../lib/partner-policy').periodForSale(new Date()),current=require('../lib/partner-statements').create({pool});let p=await current.preview(leader.artist,{quarter:period,mode:'test'});assert.equal(p.can_finalize,false);
   await assert.rejects(current.finalize({role:'owner',source:'shared_key'},{artist_id:String(leader.artist),quarter:period,mode:'test',snapshot_hash:p.statement_snapshot_hash,note:'Synthetic quarter verification only.'}),e=>e.status===409);
   const end=new Date(require('../lib/partner-policy').period(period).end),closed=require('../lib/partner-statements').create({pool,now:()=>end});p=await closed.preview(leader.artist,{quarter:period,mode:'test'});assert(p.can_finalize);const auto=await closed.closePremiumPeriods({mode:'test'});assert.equal(auto.closed,2);assert.equal((await closed.closePremiumPeriods({mode:'test'})).closed,0);const body={artist_id:String(leader.artist),quarter:period,mode:'test',snapshot_hash:p.statement_snapshot_hash,note:'Synthetic quarter verification only.'},a=await closed.finalize({role:'owner',source:'shared_key'},body),b=await closed.finalize({role:'owner',source:'shared_key'},body);assert.equal(a.statement.id,b.statement.id);assert(b.replayed);assert.equal(a.funds_sent,false);
  });
  await t.test('new direct-level inserts cannot divert money to the leader or add a third level',async()=>{
   await assert.rejects(pool.query('INSERT INTO premium_commissions(order_id,beneficiary_id,level,percent,amount_minor) VALUES($1,$2,2,5,9)',[orders[0].id,leader.artist]),/20 percent|direct referrer/);
  });
  assert.equal(external,0);
 }finally{global.fetch=oldFetch;await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
