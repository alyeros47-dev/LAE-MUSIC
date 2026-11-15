'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=()=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('web/referral-context.js')).toString('base64'));
function memory(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};}
for(const product of ['starter','growth','professional'])test(product+' survives navigation and sign-in',async()=>{
 const {rememberReferral,checkoutDestination}=await load(),s=memory();rememberReferral(new URL('https://lae.test/start?ref=42&product='+product),s,1000);
 const join=new URL('https://lae.test/join?mode=signin');rememberReferral(join,s,2000);assert.equal(join.searchParams.get('ref'),'42');assert.equal(join.searchParams.get('product'),product);const target=new URL(checkoutDestination(join,{artist:{id:9}}),'https://lae.test');assert.equal(target.pathname,'/workspace');assert.equal(target.searchParams.get('product'),product);assert.equal(target.searchParams.get('checkout_start'),'1');
});
for(const plan of ['daily','weekly','monthly','two_month','quarterly','annual'])test(plan+' stays selected through listener authentication',async()=>{
 const {rememberReferral,checkoutDestination}=await load(),s=memory();rememberReferral(new URL('https://lae.test/premium?ref=42&plan='+plan),s,1000);const join=new URL('https://lae.test/join');rememberReferral(join,s,2000);const target=new URL(checkoutDestination(join,{listener:{id:9}}),'https://lae.test');assert.equal(target.pathname,'/premium');assert.equal(target.searchParams.get('plan'),plan);assert.equal(target.searchParams.get('ref'),'42');assert.equal(target.searchParams.get('checkout_start'),'1');
});
test('invalid, expired and payment-return links cannot restore stale checkout context',async()=>{
 const {rememberReferral}=await load(),s=memory();rememberReferral(new URL('https://lae.test/start?ref=42&product=growth'),s,1000);
 const invalid=new URL('https://lae.test/join?ref=oops');rememberReferral(invalid,s,2000);assert.equal(invalid.searchParams.get('ref'),'oops');assert.equal(invalid.searchParams.has('product'),false);
 const payment=new URL('https://lae.test/premium?payment=receipt');rememberReferral(payment,s,2000);assert.equal(payment.searchParams.has('ref'),false);
 const expired=new URL('https://lae.test/join');rememberReferral(expired,s,86402000);assert.equal(expired.searchParams.has('ref'),false);
});

test('free partner registration and explicit promotion entry do not become paid checkout',async()=>{
 const {rememberReferral,checkoutDestination}=await load();for(const link of ['https://lae.test/start?product=growth&ref=42','https://lae.test/premium?plan=quarterly&ref=42']){const s=memory();rememberReferral(new URL(link),s,1000);const partner=new URL('https://lae.test/join?role=partner&mode=register');rememberReferral(partner,s,2000);assert.equal(partner.searchParams.get('role'),'partner');assert.equal(partner.searchParams.has('return'),false);assert.equal(checkoutDestination(partner,{}),null);}
 const s=memory();rememberReferral(new URL('https://lae.test/start?product=growth&ref=42'),s,1000);const promo=new URL('https://lae.test/join?role=artist&return=artist-promotion');rememberReferral(promo,s,2000);assert.equal(checkoutDestination(promo,{}),null);
});
