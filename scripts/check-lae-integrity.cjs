'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync('server.js','utf8');
new vm.Script(source,{filename:'server.js'});
function contains(needle,label){assert(source.includes(needle),label);}
contains("if(p==='/api/dashboard/summary'","Unified dashboard summary API");
contains("if(p==='/api/affiliate/prepare-purchase'","Product purchase intent API");
contains("affiliate_product_intents","Referral token ledger");
contains("consumed_at IS NULL FOR UPDATE","Single-use token locking");
contains("ON CONFLICT(subscription_id,tier) DO NOTHING","Idempotent direct commission");
contains("quarter_start","Quarterly team ledger");
contains("ENABLE_LEGACY_DEMO_ARTIST_ACTIVATION","Demo artist activation disabled by default");
contains("artist_features_active:!!sub&&new Date(sub.expires_at)>new Date()","Artist access requires paid valid subscription");
contains("paymentEnabled:false","Payment remains disabled without gateway");
const marker='const onboardingHtml=String.raw`';
const start=source.indexOf(marker);
assert(start>=0,'Onboarding HTML found');
const end=source.indexOf('`;',start+marker.length);
assert(end>start,'Onboarding HTML ends');
const html=source.slice(start+marker.length,end);
assert(html.includes('id="dashboard"'),'Unified dashboard markup');
assert(html.includes('id="referralLink"'),'Affiliate links available in dashboard');
assert(html.includes('id="subscriptionStatus"'),'Subscription status visible');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert(scripts.length>0,'Onboarding JavaScript present');
for(let i=0;i<scripts.length;i++)new vm.Script(scripts[i][1],{filename:'onboarding-script-'+i+'.js'});
const sonic=fs.readFileSync('musicapi-sonic.js','utf8');
new vm.Script(sonic,{filename:'musicapi-sonic.js'});
for(const [needle,label] of [
 ["FOR UPDATE","Subscription-level generation lock"],
 ["artist_studio_usage","Studio usage ledger"],
 ["An active paid artist package is required","Paid subscription requirement"],
 ["Your included studio generations are exhausted","Generation quota enforcement"],
 ["await release()","Failed request credit release"],
 ["status==='failed'","Failed task credit refund"]
])assert(sonic.includes(needle),label);
contains("if(p==='/api/artist/studio-history'","Artist studio generation history API");
contains("if(p==='/api/artist/studio-allowance'","Artist generation allowance API");
assert(sonic.includes("SELECT id FROM creators WHERE id=$1 FOR UPDATE"),'Per-artist concurrent generation serialization');
assert(sonic.includes("const active=await client.query"),'Active generation check inside locked transaction');
console.log('LAE-MUSIC: server syntax, unified dashboard, referral invariants and onboarding scripts passed.');
