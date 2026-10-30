'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const modulePromise=import('data:text/javascript;base64,'+fs.readFileSync('web/feature-visibility.js').toString('base64'));
test('customer feature visibility fails closed for absent, string-valued and inactive capabilities',async()=>{
 const {customerFeatures}=await modulePromise;
 assert(Object.values(customerFeatures()).every(x=>x===false));
 assert(Object.values(customerFeatures({payments:'true',review_tools:'true',payouts:'true',music_provider_configured:'true'})).every(x=>x===false));
 const sandbox=customerFeatures({payments:true,payment_mode:'sandbox'});assert.equal(sandbox.checkout,false);assert.equal(sandbox.review,false);
});
test('configured customer features stay independent of unrelated payments and provider states',async()=>{
 const {customerFeatures}=await modulePromise;
 const c=customerFeatures({payments:true,payment_mode:'live',payouts:true,music_provider_configured:true,lyrics_configured:true,voice_upload_available:true,studio_release_import:true,offline_listening:true},{offline:true});
 for(const k of ['checkout','payouts','music','lyrics','voice_upload','imports','offline_save'])assert.equal(c[k],true);
 assert.equal(c.review,false);assert.equal(customerFeatures({},{listenerAccount:true,premiumActive:false}).premium_access,true);assert.equal(customerFeatures({},{premiumActive:true}).premium_access,true);assert.equal(customerFeatures({},{offline:true,offlineCached:true}).offline_library,true);assert.equal(customerFeatures({offline_listening:true},{offline:false}).offline_save,false);
});
test('explicit review environment can exercise sandbox controls without enabling public live checkout',async()=>{
 const {customerFeatures}=await modulePromise;const c=customerFeatures({review_tools:true,payments:false});assert.equal(c.review,true);assert.equal(c.checkout,true);assert.equal(c.payouts,true);
});
test('unavailable controls are actually hidden and retain a monotonic display fence through form updates',async()=>{
 const {hideInactiveFeatures}=await modulePromise,off={hidden:false,dataset:{feature:'imports'}},on={hidden:false,dataset:{feature:'music'}},workflow={hidden:false,dataset:{feature:'lyrics'}};
 hideInactiveFeatures({querySelectorAll:selector=>selector==='[data-feature]'?[off,on,workflow]:[]},{music:true,lyrics:true});assert.equal(off.hidden,true);assert.equal(off.dataset.featureInactive,'true');assert.equal(on.hidden,false);assert.equal(workflow.hidden,false);
 hideInactiveFeatures({querySelectorAll:selector=>selector==='[data-feature]'?[off]:[]},{imports:true});assert.equal(off.hidden,false);assert.equal(off.dataset.featureInactive,undefined);
 assert(fs.readFileSync('web/ui.css','utf8').includes('[data-feature-inactive="true"]{display:none!important}'));
});
test('public production capabilities do not expose review-only tools or activate paid operations',async()=>{
 const app=await require('./runtime.cjs').runtime({env:{NODE_ENV:'production',LAE_REVIEW_TEST_ACCESS:'1',LAE_REVIEW_ENVIRONMENT:'pr6-ephemeral-review-v1'}});
 const r=await app.request('/api/platform/capabilities');assert.equal(r.status,200);const c=r.json();assert.equal(c.review_tools,false);assert.equal(c.payments,false);assert.equal(c.payouts,false);assert.equal(c.offline_listening,false);
 const asset=await app.request('/web/feature-visibility.js');assert.equal(asset.status,200);assert(asset.text.includes('hideInactiveFeatures'));
});
test('initially hidden navigation reveals only when its actual capability or existing account permits it',async()=>{
 const {hideInactiveFeatures}=await modulePromise;
 const link={hidden:true,dataset:{feature:'premium_access',featurePending:'true'}},root={querySelectorAll:s=>s==='[data-feature]'?[link]:[]};
 hideInactiveFeatures(root,{premium_access:false});assert.equal(link.hidden,true);hideInactiveFeatures(root,{premium_access:true});assert.equal(link.hidden,false);assert.equal(link.dataset.featureInactive,undefined);
});
test('read-only production inspection can use the current development migration inventory without authorizing deployment',()=>{
 const source=fs.readFileSync('.github/workflows/platform-tests.yml','utf8'),audit=source.slice(source.indexOf('  existing-service-audit:'),source.indexOf('  review-auth-diagnostic:'));
 assert(audit.includes("github.ref == 'refs/heads/codex/gospel-phase-one'"));assert(audit.includes('node scripts/audit-existing-service.cjs'));assert(!audit.includes('LAE_EXISTING_RECOVERY_REHEARSAL'));assert(!audit.includes('release-existing-service.cjs'));
});
