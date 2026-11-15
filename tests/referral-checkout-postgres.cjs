'use strict';
// Keep the historical checkout/refund contracts intact while new referral
// attribution is enforced by current-policy purchase snapshots.
const test=require('node:test'),crypto=require('node:crypto'),{Pool}=require('pg');
test('referral repair preserves historical checkout and refund accounting',async t=>{
 const target=require('./ci-database.cjs').ciDatabase(),control=new Pool({connectionString:target.href}),schema='referral_checkout_'+crypto.randomBytes(6).toString('hex');
 await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});
 try{
  await require('./runtime.cjs').runtime({pool,env:{NODE_ENV:'test',STUDIO_RELEASE_WORKER_ENABLED:'false'}});
  await require('./artist-launch-fixture.cjs').filledPromotion(pool);
  await require('./checkout-postgres.cjs')(t,{pool});
 }finally{await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
