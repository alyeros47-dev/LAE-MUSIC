'use strict';
const target=require('./ci-database.cjs').ciDatabase(),{Pool}=require('pg'),crypto=require('node:crypto'),assert=require('node:assert/strict'),test=require('node:test');
const {approve}=require('../scripts/approve-confirmed-premium.cjs'),{runtime}=require('./runtime.cjs'),{receiptProof}=require('./bank-receipt-fixture.cjs');
test('owner-confirmed maintenance review uses normal admin authentication and verifies one active live Premium term',async()=>{
 const control=new Pool({connectionString:target.href}),schema='confirmed_premium_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});
 try{
  const adminKey='ConfirmedFixtureAdminOnly12345678',env={NODE_ENV:'production',ADMIN_KEY:adminKey,STUDIO_RELEASE_WORKER_ENABLED:'false',MANUAL_BANK_PAYMENTS_JSON:JSON.stringify({enabled:true,invoice_hours:24,account:{bank_name:'Fixture - NOT REAL',account_name:'Fixture - NOT REAL',account_number:'0000000000',currency:'NGN',country:'NG'}})},app=await runtime({pool,env});
  await pool.query("INSERT INTO currency_rate_snapshots(id,source,as_of,next_update,rates) VALUES($1,'exchangerate-api',NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 day',$2)",[crypto.randomUUID(),JSON.stringify({USD:'1',NGN:'1500'})]);
  const registered=await app.request('/api/listener/register',{method:'POST',body:{name:'Synthetic Premium Customer',email:'confirmed@fixture.invalid',country:'Nigeria',password:'FixtureCustomerPassword123',confirmPassword:'FixtureCustomerPassword123'}});assert.equal(registered.status,201,registered.text);const cookie=[registered.headers['set-cookie']].flat().map(x=>x.split(';')[0]).join('; ');
  const request=async(path,body)=>{const r=await app.request(path,{method:'POST',body,headers:{cookie,'idempotency-key':crypto.randomUUID()}});assert(r.status<300,r.text);return r.json();};
  const order=await request('/api/platform/premium/orders',{plan:'quarterly'}),invoice=(await request('/api/platform/manual-payments?role=listener',{order_id:order.id})).payment;
  await request('/api/platform/manual-payments/'+invoice.id+'/submit?role=listener',{payer_name:'Synthetic sender',proof:receiptProof('confirmed-premium')});
  let reviewWrites=0;const fetcher=async(url,opt)=>{
   const u=new URL(url);if(u.hostname==='api.render.com')return Response.json(u.pathname.endsWith('/env-vars')?Object.entries({...env,DATABASE_URL:target.href}).map(([key,value])=>({key,value})):{id:'srv-db84s7m89jmc73c7l9rg',name:'LAE-MUSIC',type:'web_service',repo:'https://github.com/alyeros47-dev/LAE-MUSIC',serviceDetails:{url:'https://lae-music.onrender.com'}});
   assert.equal(u.origin,'https://lae-music.com');if(u.pathname.endsWith('/review'))reviewWrites++;
   const r=await app.request(u.pathname+u.search,{method:opt.method,headers:{...Object.fromEntries(Object.entries(opt.headers).map(([k,v])=>[k.toLowerCase(),v])),host:'lae-music.com'},...(opt.body?{body:opt.body}:{})}),headers=new Headers();for(const [k,v]of Object.entries(r.headers))for(const item of [v].flat())headers.append(k,item);return new Response(r.body,{status:r.status,headers});
  };
  const options={confirmed:true,reference:invoice.reference,amountMinor:270000,key:'not-a-real-render-key',fetcher,dbFactory:()=>({connect:pool.connect.bind(pool),end:async()=>{}})};
  await assert.rejects(approve({...options,confirmed:false}),/owner/);assert.equal(reviewWrites,0);
  await assert.rejects(approve({...options,amountMinor:269999}),/does not match/);assert.equal(reviewWrites,0);
  const result=await approve(options);assert.equal(result.status,'approved');assert.equal(result.premium_active,true);assert.equal(result.verified_receipts,1);assert.equal(reviewWrites,1);assert(!JSON.stringify(result).includes(adminKey));
  await approve(options);assert.equal(reviewWrites,1,'A retry does not approve or credit again');
  await pool.query('UPDATE admin_auth_settings SET named_enabled=TRUE WHERE id=1');await assert.rejects(approve(options),/sign-in was refused/);assert.equal(reviewWrites,1,'Do not bypass named administrator/MFA protection');
 }finally{await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
