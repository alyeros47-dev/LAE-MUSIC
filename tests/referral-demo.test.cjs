'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{allocations}=require('../lib/referral-demo');
test('artist demo direct rates match approved product rates; only the second ancestor gets the 10% projection',()=>{
 for(const [plan,price,rate,direct]of [['starter',600,15,90],['growth',1000,25,250],['professional',2000,25,500]]){
  const q=require('../lib/partner-practice').quote(plan),order={owner_id:'7',base_minor:q.base_minor,direct_percent:q.percent};assert.equal(q.base_minor,price);assert.equal(q.percent,rate);
  let a=allocations(order,null,new Date('2026-11-01T12:00:00Z'));assert.deepEqual(a,[{kind:'direct',artist:'7',percent:rate,amount_minor:direct,period:'2026-Q4'}]);
  a=allocations(order,{id:'child',parent_id:null},new Date('2026-11-01T12:00:00Z'));assert.equal(a[0].flow,'child');assert.equal(a[1].artist,'7');assert.equal(a[1].amount_minor,price/10);
  a=allocations(order,{id:'grandchild',parent_id:'child'},new Date('2026-11-01T12:00:00Z'));assert.equal(a[0].flow,'grandchild');assert.equal(a[1].flow,'child');assert(!a.some(x=>x.artist==='7'));
 }
});
test('demo projections use the existing December 20 cutoff without promising an immediate payout',()=>{const o={owner_id:'7',base_minor:1000,direct_percent:25},p={id:'child',parent_id:null};for(const [date,quarter]of [['2026-12-20T23:59:59Z','2026-Q4'],['2026-12-21T00:00:00Z','2027-Q1'],['2026-12-31T23:59:59Z','2027-Q1'],['2027-03-31T23:59:59Z','2027-Q1']])assert(allocations(o,p,new Date(date)).every(x=>x.period===quarter));});
test('unattributed demo purchases never invent a real partner recipient',()=>{assert.deepEqual(allocations({owner_id:null,base_minor:600,direct_percent:15},null,new Date()),[]);assert.equal(allocations({owner_id:null,base_minor:600,direct_percent:15},{id:'first',parent_id:null},new Date()).length,1);});
test('demo writes have an explicit anonymous network budget and never classify as provider webhooks',()=>{const {requestPolicy}=require('../lib/request-policy');for(const path of ['/api/platform/referral-demo/start','/api/platform/referral-demo/orders/a/payment','/api/platform/referral-demo/orders/a/profile']){const p=requestPolicy('POST',path);assert.equal(p.id,'referral_demo');assert.equal(p.client_max,120);assert.equal(p.role,null);}});
