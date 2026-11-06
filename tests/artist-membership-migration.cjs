'use strict';
const target=require('./ci-database.cjs').ciDatabase(),{Pool}=require('pg'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),test=require('node:test');
test('membership migration preserves old purchased quotas, pending order terms and original records',async()=>{
 const control=new Pool({connectionString:target.href}),schema='membership_upgrade_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});
 try{
  await require('./legacy-bootstrap.cjs').bootstrap(pool);
  await pool.query('CREATE TABLE platform_migrations(version TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  for(const version of fs.readdirSync(path.join(__dirname,'../migrations')).filter(n=>/^\d+.*\.sql$/.test(n)&&n<'028-').sort()){
   const sql=fs.readFileSync(path.join(__dirname,'../migrations',version),'utf8');await pool.query(sql);await pool.query('INSERT INTO platform_migrations(version,checksum) VALUES($1,$2)',[version,crypto.createHash('sha256').update(sql).digest('hex')]);
  }
  const id=(await pool.query("INSERT INTO creators(display_name,email,password_salt,password_hash) VALUES('Preserved Artist','preserved@membership.invalid','salt','hash') RETURNING id")).rows[0].id;
  const sub=(await pool.query("INSERT INTO artist_subscriptions(artist_id,plan,amount_cents,payment_reference,status,starts_at,expires_at) VALUES($1,'starter',600,'legacy-membership-fixture','paid',NOW()-INTERVAL '1 day',NOW()+INTERVAL '10 days') RETURNING *",[id])).rows[0];
  const order=crypto.randomUUID();await pool.query("INSERT INTO commerce_orders(id,artist_id,kind,plan,currency,amount_minor,royalty_percent,direct_referral_percent,expires_at) VALUES($1,$2,'artist_subscription','professional','USD',2000,60,25,NOW()+INTERVAL '1 day')",[order,id]);
  const legacyExtra=crypto.randomUUID();
  await require('../lib/transactions').transaction(pool,async db=>{
   await db.query("INSERT INTO commerce_orders(id,artist_id,kind,plan,currency,amount_minor,royalty_percent,direct_referral_percent,expires_at) VALUES($1,$2,'studio_generation','starter','USD',300,50,0,NOW()+INTERVAL '1 day')",[legacyExtra,id]);
   await db.query('INSERT INTO studio_purchased_credits(order_id,artist_id) VALUES($1,$2)',[legacyExtra,id]);
   await db.query("INSERT INTO commerce_receipts(order_id,provider,merchant_id,payment_id,reference,currency,amount_minor) VALUES($1,'legacy_fixture','fixture',$1::uuid::text,$2,'USD',300)",[legacyExtra,'legacy-extra:'+legacyExtra]);
   await db.query("UPDATE commerce_orders SET status='paid',paid_at=NOW() WHERE id=$1",[legacyExtra]);
  });
  const before=(await pool.query('SELECT * FROM commerce_orders WHERE id=$1',[order])).rows[0];
  const migrate=require('../lib/migrations').migrate;assert.deepEqual(await migrate(pool),['028-annual-artist-memberships.sql','029-manual-bank-payments.sql','030-affiliate-participation-revenue.sql','031-guest-bank-checkout.sql','032-simple-bank-receipts.sql']);assert.deepEqual(await migrate(pool),[]);
  const after=(await pool.query('SELECT * FROM artist_subscriptions WHERE id=$1',[sub.id])).rows[0];assert.deepEqual([after.included_generations,after.publish_track_limit],[2,7]);for(const [k,v]of Object.entries(sub))assert.deepEqual(after[k],v,k);
  assert.deepEqual((await pool.query('SELECT * FROM commerce_orders WHERE id=$1',[order])).rows[0],before);
  const terms=(await pool.query('SELECT * FROM membership_order_terms WHERE order_id=$1',[order])).rows[0];assert.deepEqual([terms.included_generations,terms.publish_track_limit,terms.revision],[6,12,'legacy-preserved']);
  await pool.query('INSERT INTO artist_studio_usage(subscription_id,artist_id,generation_reference,purchase_order_id) VALUES($1,$2,$3,$4)',[sub.id,id,'legacy_extra_used_after_upgrade',legacyExtra]);
  const view=await require('../lib/subscription-view').subscriptionView(pool,id,'starter',{});assert.equal(view.upload_limit,9,'A legacy purchased generation still adds two track slots when used');
  await assert.rejects(pool.query('UPDATE membership_order_terms SET included_generations=999 WHERE order_id=$1',[order]),/append-only/);
 }finally{await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
