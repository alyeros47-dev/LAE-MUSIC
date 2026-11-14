'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createPlatform}=require('../lib/platform');
const env={NODE_ENV:'test',MONNIFY_API_KEY:'MK_PROD_customer_fixture',MONNIFY_SECRET_KEY:'customer_visibility_fixture_secret',MONNIFY_CONTRACT_CODE:'1000000001',MONNIFY_BASE_URL:'https://api.monnify.com',MANUAL_BANK_PAYMENTS_JSON:JSON.stringify({enabled:true,invoice_hours:24,account:{bank_name:'Fixture Bank',account_name:'Fixture Company',account_number:'0000000000',currency:'NGN',country:'NG'}})};
function fixture({admin=false,customerPaymentPolicy}={}){
 const queries=[],pool={async query(sql){queries.push(sql);return {rowCount:0,rows:[]};}};
 const app=createPlatform({pool,env,customerPaymentPolicy,me:async()=>({id:1}),listenerMe:async()=>({id:2}),authAdmin:()=>admin,validOrigin:()=>true,body:async req=>req.data||{},json(res,status,value){res.status=status;res.value=value;}});
 return {queries,async request(url,method='GET'){
  const req={url,method,headers:{},data:{},socket:{remoteAddress:'fixture'},adminPrincipal:admin?{role:'owner',id:'fixture',source:'shared_key'}:null},res={status:0,value:null,setHeader(){},writeHead(n){this.status=n;},end(){}};
  try{await app.handler(req,res,new URL(url,'https://lae.test'));}catch(e){res.status=e.status;res.value={error:e.message};}return res;
 }};
}
test('customer capabilities hide manual transfer even when official bank settings remain enabled',async()=>{
 const f=fixture();for(const path of ['/api/platform/premium/plans','/api/platform/payments/capabilities','/api/platform/manual-payments/capabilities']){const r=await f.request(path);assert.equal(r.status,200);const bank=r.value.manual_bank||r.value;assert.equal(bank.enabled,false);assert.equal(bank.customer_visible,false);assert(!JSON.stringify(r.value).includes('0000000000'));if(r.value.providers)assert.deepEqual(r.value.providers.map(p=>p.id),['monnify']);}
});
test('customer cannot open a new manual invoice or guest transfer while it is hidden',async()=>{
 const f=fixture();for(const path of ['/api/platform/manual-payments?role=listener','/api/platform/guest-payments']){const r=await f.request(path,'POST');assert.equal(r.status,409);assert.match(r.value.error,/Monnify/);}assert(!f.queries.some(sql=>/INSERT INTO (manual_bank_payments|guest_purchase_orders)/.test(sql)));
});
test('administrators retain the manual payment queue and its enabled configuration',async()=>{
 const f=fixture({admin:true}),r=await f.request('/api/platform/admin/manual-payments');assert.equal(r.status,200);assert.equal(r.value.configuration.enabled,true);assert.deepEqual(r.value.payments,[]);assert(f.queries.some(sql=>sql.includes('manual_bank_payments')));
});
test('retained manual UI can be verified explicitly in isolated fixtures without enabling it for customers',async()=>{
 const f=fixture({customerPaymentPolicy:{manual_bank_visible:true}}),r=await f.request('/api/platform/manual-payments/capabilities');assert.equal(r.status,200);assert.equal(r.value.enabled,true);assert.equal(r.value.customer_visible,true);
});
