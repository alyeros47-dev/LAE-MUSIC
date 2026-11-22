'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCampaigns,invitation,attribution}=require('../lib/community-campaigns');
const {routePermission}=require('../lib/admin-auth');
test('only genuine HTTPS WhatsApp group invite URLs are configurable',()=>{
 assert.equal(invitation(''), '');
 assert.equal(invitation('https://chat.whatsapp.com/AbCdEfGh12345678901234?mode=ac_t'),'https://chat.whatsapp.com/AbCdEfGh12345678901234');
 for(const value of ['http://chat.whatsapp.com/AbCdEfGh12345678901234','https://wa.me/2340000000000','https://chat.whatsapp.com.evil.invalid/AbCdEfGh12345678901234','https://user@chat.whatsapp.com/AbCdEfGh12345678901234','https://chat.whatsapp.com/short',null])assert.throws(()=>invitation(value));
});
test('attribution retains only bounded campaign labels, without arbitrary identifiers',()=>{
 assert.deepEqual(attribution(new URLSearchParams('utm_source=facebook&utm_campaign=Gospel%20Nov&utm_content=card-1&fbclid=private&email=private&utm_term=person%40example.com&utm_medium='+('x'.repeat(81)))),{utm_source:'facebook',utm_campaign:'Gospel Nov',utm_content:'card-1'});
});
test('campaign configuration remains owner-only using existing role permissions',()=>{
 for(const role of ['content','support','finance'])for(const method of ['GET','POST'])assert.equal(routePermission(role,new URL('https://lae.test/api/platform/admin/campaigns'),method).allowed,false);
 assert.equal(routePermission('owner',new URL('https://lae.test/api/platform/admin/campaigns'),'POST').allowed,true);
});
test('without configuration both pages stay safe, separate and free of registration',async()=>{
 const app=require('./runtime.cjs');const service=await app.runtime();
 for(const [slug,title] of [['creator-network','Creator Support Network'],['gospel-creators','LAE-MUSIC Official']]){
  const r=await service.request('/join/'+slug);assert.equal(r.status,200);assert(r.text.includes(title));assert(r.text.includes('Invitations are not open yet'));assert(!r.text.includes('<form'));assert(!r.text.includes('/web/app.js'));assert(!r.text.includes('data-pixel='));assert(!r.text.includes('chat.whatsapp.com/'));assert.equal(r.headers['cache-control'],'no-store');
  const head=await service.request('/join/'+slug,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.body.length,0);
 }
 assert.equal((await service.request('/api/platform/admin/campaigns')).status,401);
 assert.equal((await service.request('/join/creator-network',{method:'POST'})).status,405);
 for(const p of ['/','/about','/premium','/studio','/account'])assert.equal((await service.request(p)).status,200);
});
test('temporary database failure shows an honest unavailable response',async()=>{
 const s=createCampaigns({pool:{query:async()=>{throw Error('unavailable');}}});let status;
 await s.handle({method:'GET',headers:{}},{setHeader(){}},new URL('https://lae.test/join/gospel-creators'),{json:(_res,code)=>{status=code;}});
 assert.equal(status,503);
});
