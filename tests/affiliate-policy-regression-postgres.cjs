'use strict';
// Existing verified-payment contracts rehearsed alongside the new additive policy.
const target=require('./ci-database.cjs').ciDatabase();
const test=require('node:test'),crypto=require('node:crypto'),{Pool}=require('pg');
test('historical artist and Premium gateway contracts survive affiliate policy upgrade',async t=>{
 const control=new Pool({connectionString:target.href,ssl:false}),schema='affiliate_regression_'+crypto.randomBytes(6).toString('hex');
 await control.query('CREATE SCHEMA '+schema);
 const pool=new Pool({connectionString:target.href,ssl:false,options:'-c search_path='+schema});
 try{
  await require('./runtime.cjs').runtime({pool,env:{NODE_ENV:'test',STUDIO_RELEASE_WORKER_ENABLED:'false'}});
  await require('./premium-postgres.cjs')(t,{pool});
  await require('./premium-international-postgres.cjs')(t,{pool});
  await require('./checkout-postgres.cjs')(t,{pool});
  const app=await require('./runtime.cjs').runtime({pool,env:{NODE_ENV:'test',STUDIO_RELEASE_WORKER_ENABLED:'false'}});
  const api=async(path,{method='GET',body,cookie,key}={})=>{const r=await app.request(path,{method,body,headers:{...(cookie?{cookie}:{}),...(key?{'idempotency-key':key}:{})}});return {status:r.status,data:r.json(),cookie:[r.headers['set-cookie']||[]].flat().map(c=>c.split(';')[0]).join('; ')};};
  await require('./partner-practice-postgres.cjs')(t,{pool,api});
 }finally{await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
