'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const terms=require('../lib/membership-terms'),plans=require('../lib/plans');
test('annual terms have one source and maintain two separate tracks per generation',()=>{
 for(const [plan,generations,tracks]of [['starter',3,6],['growth',6,12],['professional',15,30]]){assert.equal(terms.terms(plan).included_generations,generations);assert.equal(terms.terms(plan).publish_track_limit,tracks);assert.equal(plans[plan].studioGenerations,generations);assert.equal(plans[plan].uploads,tracks);}
 assert.deepEqual(terms.allowance({plan:'starter',included_generations:2,publish_track_limit:7}),{generations:2,tracks:7},'Legacy entitlements remain intact');
});
test('configured prices require explicit approval before replacing the existing prices',()=>{
 const config=require('../config/artist-membership.json').additional_generation_prices,old=config.approved;
 try{config.approved=false;for(const p of Object.keys(plans))assert.equal(terms.additionalPrice(p).effective_usd,plans[p].additionalGenerationUsd);config.approved=true;for(const [p,n]of Object.entries({starter:2,growth:1.8,professional:1.5}))assert.equal(require('../lib/commerce').quote('studio_generation',p).amount_minor,Math.round(n*100));}finally{config.approved=old;}
});
test('annual renewal preserves UTC time and clamps February 29 to February 28',()=>{
 const {annualExpiry}=require('../lib/subscriptions');for(const [a,b]of [['2024-02-29T13:22:00Z','2025-02-28T13:22:00.000Z'],['2026-11-05T00:00:00Z','2027-11-05T00:00:00.000Z']])assert.equal(annualExpiry(a).toISOString(),b);
});
test('agreement disclosure has a stable full-content hash and does not authorize recurring deductions',()=>{
 const a=require('../lib/creator-agreement').disclosure(),{content_hash,...body}=a;
 assert.equal(content_hash,require('node:crypto').createHash('sha256').update(JSON.stringify(body)).digest('hex'));assert(a.sections.some(s=>/no recurring royalty deduction/.test(s.text)));assert(a.sections.some(s=>/does not set or change royalty shares, affiliate rates or payouts/.test(s.text)));
});

test('reviewable Creator Agreement is exactly the customer agreement document',()=>{
 const a=require('../config/music-creator-agreement.json');
 const expected='# '+a.title+'\n\nVersion: '+a.version+'\n\n'+a.sections.map(s=>'## '+s.title+'\n\n'+s.text).join('\n\n')+'\n';
 assert.equal(require('node:fs').readFileSync(require('node:path').join(__dirname,'../docs/MUSIC-CREATOR-AGREEMENT.md'),'utf8'),expected);
});
