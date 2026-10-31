'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const demo=require('../lib/partner-demo');
const sample={product:'artist:professional',depth:'2',payment_state:'verified',sale_date:'2026-06-30'};
test('demo uses approved USD prices and existing product-specific rates',()=>{
 const products=demo.products();assert.equal(products.length,11);
 for(const p of products){assert.equal(p.currency,'USD');assert(p.base_minor>0);}
 for(const [plan,p]of Object.entries(require('../lib/plans'))){const q=products.find(x=>x.id==='artist:'+plan);assert.equal(q.base_minor,Math.round(p.usd*100));assert.equal(q.direct_percent,p.directReferralPercent);}
 const monthly=products.find(p=>p.id==='premium:monthly');assert.equal(monthly.base_minor,60);assert.equal(monthly.direct_percent,10);assert.equal(monthly.team_percent,5);
});
test('direct, exactly-two-step and deeper examples assign the correct recipients',()=>{
 const direct=demo.preview({...sample,depth:'1'});assert.equal(direct.your_direct_minor,500);assert.equal(direct.your_team_projection_minor,0);
 const team=demo.preview(sample);assert.equal(team.direct.recipient,'Demo Partner B');assert.equal(team.direct.amount_minor,500);assert.equal(team.team.recipient,'You');assert.equal(team.your_direct_minor,0);assert.equal(team.your_team_projection_minor,200);assert.equal(team.team.immediate_indirect_minor,0);
 const deeper=demo.preview({...sample,depth:'3'});assert.equal(deeper.your_direct_minor,0);assert.equal(deeper.your_team_projection_minor,0);assert.equal(deeper.team.recipient,'Demo Partner B');
});
test('Premium is five-percent team volume and studio retains its approved zero direct rate',()=>{
 const premium=demo.preview({...sample,product:'premium:monthly'});assert.equal(premium.direct.amount_minor,6);assert.equal(premium.your_team_projection_minor,3);
 const studio=demo.preview({...sample,product:'studio:starter'});assert.equal(studio.direct.amount_minor,0);assert.equal(studio.your_team_projection_minor,30);
});
test('unpaid registrations, held payments and full refunds generate no example earnings',()=>{
 for(const payment_state of ['pending','held','full_refund']){const x=demo.preview({...sample,payment_state});assert.equal(x.eligible_minor,0);assert.equal(x.direct.amount_minor,0);assert.equal(x.team.projection_minor,0);assert.equal(x.registration_reward_minor,0);}
 const x=demo.preview({...sample,payment_state:'full_refund'});assert.equal(x.refund_minor,2000);assert.equal(x.eligible_minor,0);
});
test('quarterly aggregation rounds the total pool, and late December rolls into next Q1',()=>{
 const x=demo.preview({...sample,product:'premium:daily',count:'25'});assert.equal(x.eligible_minor,200);assert.equal(x.team.projection_minor,10);
 assert.equal(demo.preview({...sample,sale_date:'2026-12-20'}).team.period,'2026-Q4');assert.equal(demo.preview({...sample,sale_date:'2026-12-21'}).team.period,'2027-Q1');
});
test('all scenarios remain simulations and reject manipulated or invalid inputs',()=>{
 for(const p of demo.products())for(const depth of [1,2,3])for(const payment_state of ['pending','verified','full_refund','held']){
  const x=demo.preview({...sample,product:p.id,depth,payment_state});assert.equal(x.demo,true);assert.equal(x.actual_payment_received_minor,0);assert.equal(x.actual_withdrawable_minor,0);assert.match(x.disclosure,/does not verify Paystack/);
 }
 for(const update of [{product:'unknown'},{depth:0},{depth:true},{depth:{toString:null}},{count:{toString:null}},{count:101},{count:0},{count:1.5},{sale_date:'2026-02-30'},{payment_state:'paid'},{commission_minor:9999},{currency:'NGN'}])assert.throws(()=>demo.preview({...sample,...update}),e=>e.status===400);
});
