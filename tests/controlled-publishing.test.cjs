'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const policy=require('../lib/publishing-policy'),{runtime}=require('./runtime.cjs');
test('approved business copy and package projection preserve prices without promising new quantities or external benefits',async()=>{
 const x=policy.disclosure();assert.equal(x.business_description,'LAE-MUSIC is an AI-powered music creation, streaming and creator monetization platform.');
 assert.equal(x.external_uploads_enabled,false);assert.equal(x.generation_record_required,true);
 assert.deepEqual(Object.entries(x.packages).map(([id,p])=>[id,p.name,p.usd]),[['starter','Starter',6],['growth','Growth',10],['professional','Premium',20]]);
 for(const p of Object.values(x.packages)){assert.equal(p.externalUploadLimit,0);for(const field of ['uploads','studioGenerations','tracksPerGeneration','additionalGenerationUsd'])assert(!Object.hasOwn(p,field));}
 assert.match(x.own_lyrics_notice,/own original lyrics/);assert.match(x.rights_notice,/not automatically copyright-free/);assert.match(x.publishing_notice,/conventional recording studios/);
 const internal=require('../lib/plans');assert.deepEqual(Object.values(internal).map(p=>p.studioGenerations),[2,3,6]);assert.deepEqual(Object.values(internal).map(p=>p.additionalGenerationUsd),[3,2.5,2]);
});
test('About, How It Works, publishing policy, FAQs and gateway-readable business data need no account or database',async()=>{
 const app=await runtime();
 for(const path of ['/about','/about-us','/business','/how-it-works','/publishing-policy','/faq','/about?legacy=1','/artist?legacy=1']){const r=await app.request(path);assert.equal(r.status,200,path);assert.match(r.text,/src="\/web\/app.js"/);}
 const business=await app.request('/api/platform/business');assert.equal(business.status,200);assert.equal(business.json().revision,policy.disclosure().revision);
 const plans=(await app.request('/api/plans')).json();assert.deepEqual(plans.plans,policy.packages());assert.equal(plans.publishingPolicy.external_uploads_enabled,false);assert.equal(plans.paymentEnabled,false);
 assert.equal((await app.request('/web/business.js')).status,200);
});
test('review upload entry rejects code-free external recordings even during complimentary testing',async()=>{
 const calls=[],pool={query:async(sql)=>{calls.push(sql);return {rows:sql.startsWith('SELECT expires_at')?[{active:true}]:[]};}};
 const create=require('../lib/review-testing').create;
 const env={NODE_ENV:'staging',LAE_REVIEW_ENVIRONMENT:'pr6-ephemeral-review-v1',LAE_REVIEW_TEST_ACCESS:'1',LAE_REVIEW_TEST_OPEN:'1'};
 const instance=create({pool,env,me:async()=>({id:7}),validOrigin:()=>true,body:async()=>({title:'External song',genre:'Gospel',rightsConfirmed:true,generated:true,studioOnly:false,audioMime:'audio/mpeg',audioBytes:2048}),json(){throw Error('External draft must not be accepted.');}});
 await assert.rejects(instance.handle({method:'POST',headers:{}},{},new URL('https://review.invalid/api/music/upload/start')),e=>e.status===403&&/Only songs generated through LAE-MUSIC Studio/.test(e.message));
 assert(!calls.some(q=>/INSERT INTO music_tracks|UPDATE generation_records/.test(q)));
});
test('Gospel configuration and own-lyrics workflow are unchanged by publishing policy',()=>{
 const catalogue=require('../lib/studio-launch').catalogue();assert.equal(catalogue.categories.length,14);assert.equal(catalogue.styles.length,70);assert.equal(catalogue.launch,'gospel-phase-one');
 assert.equal(require('../lib/partner-policy').disclosure.direct_rates.artist_subscription.professional,25);
});
