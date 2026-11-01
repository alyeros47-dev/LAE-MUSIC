'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const dependency='data:text/javascript;base64,'+Buffer.from(fs.readFileSync('web/referral-demo.js','utf8')).toString('base64');
const source=fs.readFileSync('web/artist-packages.js','utf8').replace("'./referral-demo.js'",JSON.stringify(dependency));
const modulePromise=import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const url=path=>new URL(path,'https://lae-music.com');
test('artist referral destinations open packages before any registration regardless of signed-in role',async()=>{
 const {artistPackageEntry}=await modulePromise;
 for(const session of [{},{artist:{id:7}},{listener:{id:8}}])for(const path of ['/start?ref=9&product=growth','/get-started?ref=9','/start?legacy=1','/join?ref=9&product=starter'])assert.equal(artistPackageEntry(url(path),session),true,path);
 assert.equal(artistPackageEntry(url('/join?role=artist&mode=register')),true);
});
test('free partner/listener enrollment, existing-role linking, explicit sign-in and provider completion remain separate',async()=>{
 const {artistPackageEntry}=await modulePromise;
 for(const path of ['/join?role=partner&mode=register&ref=9&product=growth','/join?role=listener&mode=register','/join?role=artist','/start#signin','/join?role=artist&mode=login&product=growth','/join?social=complete','/premium?ref=9'])assert.equal(artistPackageEntry(url(path)),false,path);
 assert.equal(artistPackageEntry(url('/join?role=artist&mode=register'),{listener:{id:8}}),false);
 assert.equal(artistPackageEntry(url('/join?role=artist&mode=register'),{review_test_access:true}),false);
});
test('package selection preserves only valid referral attribution and server-known products, never payment claims',async()=>{
 const {artistPackageLink,packageReferral}=await modulePromise;
 for(const plan of ['starter','growth','professional']){
  const destination=url(artistPackageLink(url('/start?ref=9&product=starter&paid=true&amount=1&redirect=https://evil.invalid'),plan));
  assert.equal(destination.pathname,'/start');assert.equal(destination.searchParams.get('ref'),'9');assert.equal(destination.searchParams.get('product'),plan);assert.equal(destination.searchParams.size,2);
 }
 for(const value of ['0','-1','9x','9007199254740992','<script>alert(1)</script>'])assert.equal(packageReferral(url('/start?ref='+encodeURIComponent(value))),'');
 assert.equal(artistPackageLink(url('/start?ref=9'),'free'),'/start?ref=9');
});
test('real server serves public referral pages and module, including old legacy links, without database or payment activation',async()=>{
 const app=await require('./runtime.cjs').runtime();
 for(const path of ['/start?ref=9&product=growth','/get-started?ref=9','/start?legacy=1&ref=9&product=starter']){const r=await app.request(path);assert.equal(r.status,200,path);assert.match(r.text,/src="\/web\/app.js"/);assert(!r.headers['set-cookie']);}
 const module=await app.request('/web/artist-packages.js');assert.equal(module.status,200);assert.match(module.headers['content-type'],/javascript/);
 const plans=(await app.request('/api/plans')).json();assert.deepEqual(Object.keys(plans.plans),['starter','growth','professional']);assert.equal(plans.paymentEnabled,false);
 const checkout=await app.request('/api/platform/checkout',{method:'POST',body:{plan:'growth',paid:true}});assert.equal(checkout.status,503);assert.equal(checkout.json().payment_enabled,false);
});

test('demo referral selection preserves its public chain reference without accepting payment claims',async()=>{const {artistPackageLink}=await modulePromise,ref='11111111-1111-4111-8111-111111111111';const next=url(artistPackageLink(url('/start?ref=9&demo=1&demo_ref='+ref+'&paid=true'),'professional'));assert.equal(next.searchParams.get('demo_ref'),ref);assert.equal(next.searchParams.get('demo'),'1');assert.equal(next.searchParams.get('ref'),'9');assert.equal(next.searchParams.get('product'),'professional');assert.equal(next.searchParams.has('paid'),false);});
