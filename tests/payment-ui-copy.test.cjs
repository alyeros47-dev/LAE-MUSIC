'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const data=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const bank=import(data(fs.readFileSync('web/manual-bank-payments.js','utf8')));
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('bank instructions show authoritative amount and all beneficiary/reference fields without repricing or extra notices',async()=>{
 const {bankDetails}=await bank,p={amount:'NGN 1,200.50',charge_minor:120050,reference:'LAE-UNCHANGED',expires_at:'2026-11-06T12:00:00Z',bank_account:{bank_name:'Bank & Co',account_name:'A "Business"',account_number:'0000123456'}};
 const html=bankDetails(p,e);for(const field of ['Amount','Bank name','Account name','Account number','Reference','Pay by'])assert(html.includes('<dt>'+field+'</dt>'));
 for(const text of ['NGN 1,200.50','data-bank-copy="1200.50"','0000123456','LAE-UNCHANGED','Bank &amp; Co','A &quot;Business&quot;'])assert(html.includes(text),text);
 assert.equal((html.match(/data-bank-copy=/g)||[]).length,5);assert(!/refund|USD product price|accept/i.test(html));
});
test('payment status copy stays short and distinguishes pending review, approval, rejection and expiry',async()=>{
 const {paymentMessage}=await bank;for(const status of ['awaiting_transfer','submitted','approved','rejected','cancelled']){const text=paymentMessage({status});assert(text.length>0&&text.length<110);}
 assert.match(paymentMessage({status:'submitted'}),/Waiting for approval/);assert.match(paymentMessage({status:'awaiting_transfer',expired:true}),/deadline passed/);assert.match(paymentMessage({status:'approved',guest_order_id:'fixture',guest_claimed:false}),/Finish setting up/);
});
test('normal policy section retains the complete refund wording through the public information API',async()=>{
 const app=await require('./runtime.cjs').runtime(),policy=require('../lib/financial-policy').disclosure();
 for(const path of ['/publishing-policy','/about','/faq','/how-it-works']){
  const result=await app.request('/api/platform/business?page='+encodeURIComponent(path));assert.equal(result.status,200);const {html}=result.json();
  const initial=await app.request(path);assert(initial.text.includes(html),'initial page and public API agree');
  if(path==='/publishing-policy'){for(const key of ['complaints','royalties','artist','premium','studio','currency'])assert(html.includes(e(policy[key])),key);assert(html.includes('id="refunds"'));}
  else assert(!html.includes('id="refunds"'));
  if(path==='/how-it-works'){assert(html.includes('two separate tracks'));assert(html.includes('50% of the remaining 70%'));}
 }
 assert.deepEqual((await app.request('/api/platform/financial-policy')).json(),policy);

});

test('payment screens contain no refund notice, checkbox or fabricated acceptance payload',()=>{for(const file of ['web/app.js','web/premium.js','web/guest-bank-checkout.js','web/manual-bank-payments.js','web/financial-policy.js']){const s=fs.readFileSync(file,'utf8');if(!file.endsWith('financial-policy.js'))assert(!s.includes('refundConditions('),file);assert(!s.includes('policy_accepted'),file);}});
