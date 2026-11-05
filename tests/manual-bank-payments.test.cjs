'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {configuration}=require('../lib/manual-bank-config'),{proof}=require('../lib/manual-bank-payments'),{routePermission}=require('../lib/admin-auth');
const fixture={enabled:true,invoice_hours:24,account:{bank_name:'Fixture Bank - NOT REAL',account_name:'Fixture business - NOT REAL',account_number:'0000000000',currency:'NGN',country:'NG'}};
test('manual bank collection stays off until official complete account configuration is supplied',()=>{
 assert.equal(configuration({}).enabled,false);for(const c of [{enabled:true}, {...fixture,account:{...fixture.account,account_number:''}},{...fixture,account:{...fixture.account,currency:'EUR'}},{...fixture,invoice_hours:0}])assert.equal(configuration({},c).enabled,false);
 assert.equal(configuration({MANUAL_BANK_PAYMENTS_JSON:'bad'}).enabled,false);assert.equal(configuration({NODE_ENV:'test'},fixture).mode,'test');assert.equal(configuration({NODE_ENV:'production'},fixture).mode,'live');assert.equal(configuration({},fixture).merchant_id,configuration({},structuredClone(fixture)).merchant_id);
});
test('receipt evidence excludes executable documents, invalid encodings and oversized files',()=>{
 assert.deepEqual(proof(null),{bytes:null,mime:null});for(const p of ['data:text/html;base64,PHNjcmlwdD4=','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,QUFBQUFBQUFBQUFB','x'.repeat(1400001)])assert.throws(()=>proof(p));
});
test('manual payment decisions use existing finance and owner authorization with fresh MFA',()=>{
 const u=new URL('https://lae.test/api/platform/admin/manual-payments/12345678-1234-4234-8234-123456789012/review');for(const role of ['support','content'])assert.equal(routePermission(role,u,'POST').allowed,false);for(const role of ['finance','owner'])assert.deepEqual(routePermission(role,u,'POST'),{allowed:true,fresh:true});
});
