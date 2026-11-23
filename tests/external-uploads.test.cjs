'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('external purchases preserve all Studio prices and grant upload slots only',()=>{
 const commerce=require('../lib/commerce'),external=require('../lib/external-upload-memberships');
 assert.deepEqual(['starter','growth','professional'].map(p=>[commerce.quote(external.KIND,p).amount_minor,commerce.quote(external.KIND,p).intended_tracks]),[[500,10],[1000,30],[2000,100]]);
 assert.deepEqual(['starter','growth','professional'].map(p=>commerce.quote('artist_subscription',p).amount_minor),[600,1000,2000]);
 assert.deepEqual(Object.values(require('../lib/plans')).map(p=>[p.studioGenerations,p.uploads]),[[3,6],[6,12],[15,30]]);
 assert.equal(require('../lib/artist-launch-access').LIMIT,200);
 for(const plan of ['constructor','__proto__','unknown'])assert.throws(()=>external.quote(plan),e=>e.status===400);
});
test('rights documents are encrypted in object storage and tampering cannot be approved as readable proof',async()=>{
 const {createStorage}=require('../lib/external-rights');let saved;
 const store=createStorage({env:{ADMIN_KEY:'external-rights-local-fixture-secret'},storage:()=>({}),presign:(_s,key,action)=>'https://fixture.invalid/'+action+'/'+key,fetcher:async(url,options={})=>{if(options.method==='PUT'){saved=Buffer.from(options.body);return new Response(null);}return new Response(saved);}});
 const file=Buffer.from('%PDF-1.7\nPrivate original rights evidence fixture'),id='12345678-1234-4234-8234-123456789012';
 const key=await store.put(id,file);assert(!saved.includes(file));assert((await store.read(key)).equals(file));saved[saved.length-1]^=1;await assert.rejects(store.read(key),e=>e.status===502);
});
test('a paid external upload plan alone never enables Studio production',async()=>{
 const external=require('../lib/external-upload-memberships');assert(external.CODE.test('EX-'+'A'.repeat(36)));assert(!external.CODE.test('A'.repeat(36)));
 const noStudio={query:async sql=>sql.startsWith('SELECT EXISTS')?{rows:[{owner_unlimited:false,promotion:false,promotion_used:false}]}:{rows:[],rowCount:0}};
 assert.equal((await require('../lib/artist-access').status(noStudio,42,{NODE_ENV:'test'})).active,false);
});
