'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),f=require('../lib/affiliate-framework'),policy=require('../lib/partner-policy');
test('approved $1.80 Premium framework is 54 cents unallocated, 63 cents streaming, 63 cents platform',()=>{const x=f.distribution(180);assert.deepEqual([x.affiliate_and_team_minor,x.artist_pool_minor,x.platform_minor],[54,63,63]);assert.equal(x.allocation_status,'pending_decisions');assert.equal(x.individual_rates,null);});
test('minor-unit allocation conserves every cent and uses existing platform residual rounding',()=>{for(let n=0;n<10000;n++){const x=f.distribution(n);assert.equal(x.affiliate_and_team_minor+x.artist_pool_minor+x.platform_minor,n);assert(x.platform_minor-x.artist_pool_minor<=1);assert.equal(x.remaining_minor,x.artist_pool_minor+x.platform_minor);}for(const v of [-1,1.5,Infinity,'bad'])assert.throws(()=>f.distribution(v));});
test('new framework has free voluntary participation, no expiry and no invented individual or team rate',()=>{const p=f.disclosure();assert.equal(p.registration_free,true);assert.equal(p.participation_optional,true);assert.equal(p.eligibility_expires,false);for(const k of ['individual_premium_rates','team_qualification_rules','artist_and_generation_commission_rules'])assert.equal(p[k],null);assert.equal(p.new_individual_allocations_enabled,false);assert.equal(p.payouts_enabled,false);assert.equal(policy.premiumRates(policy.REVISION).direct,null);assert.throws(()=>policy.calculate([{order_id:'pending',source:'premium',policy_revision:policy.REVISION,eligible_minor:180}]),e=>e.status===409);});
test('earlier earned contracts remain versioned independently of the new framework',()=>{assert.deepEqual(policy.premiumRates(policy.PURCHASE_YEAR_REVISION),{direct:20,quarterly_team:10,immediate_indirect:0});assert.deepEqual(policy.premiumRates(policy.LEGACY_REVISION),{direct:10,quarterly_team:5,immediate_indirect:0});});

test('monthly artist recognition never exceeds its parent revenue, including low-cent annual balances',()=>{
 const p=require('../lib/premium-policy');
 for(const [from,to] of [['2026-01-01','2027-01-01'],['2026-11-17','2027-11-17']]){
  const start=new Date(from+'T00:00:00Z'),end=new Date(to+'T00:00:00Z');
  for(let eligible=0;eligible<1000;eligible++){
   const allocation=f.distribution(eligible);let artistTotal=0,remainingTotal=0,date=new Date(start);date.setUTCDate(1);
   while(date<end){const period=p.month(date.toISOString().slice(0,7)),remaining=p.recognize(allocation.remaining_minor,start,end,period),artist=f.recognizeArtistShare(allocation,start,end,period);assert(artist>=0&&artist<=remaining,JSON.stringify({eligible,period:period.code,artist,remaining}));artistTotal+=artist;remainingTotal+=remaining;date.setUTCMonth(date.getUTCMonth()+1);}
   assert.equal(artistTotal,allocation.artist_pool_minor);assert.equal(remainingTotal,allocation.remaining_minor);
  }
 }
});
