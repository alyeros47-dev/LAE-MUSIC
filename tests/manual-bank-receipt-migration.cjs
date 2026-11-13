'use strict';
const target=require('./ci-database.cjs').ciDatabase(),{Pool}=require('pg'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),test=require('node:test');
test('receipt simplification upgrades existing bank history without rewriting or unlocking it',async()=>{
 const control=new Pool({connectionString:target.href}),schema='bank_upgrade_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});
 try{
  await require('./legacy-bootstrap.cjs').bootstrap(pool);
  await pool.query('CREATE TABLE platform_migrations(version TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  for(const version of fs.readdirSync(path.join(__dirname,'../migrations')).filter(n=>/^\d+.*\.sql$/.test(n)&&n<'032-').sort()){
   const sql=fs.readFileSync(path.join(__dirname,'../migrations',version),'utf8');await pool.query(sql);await pool.query('INSERT INTO platform_migrations(version,checksum) VALUES($1,$2)',[version,crypto.createHash('sha256').update(sql).digest('hex')]);
  }
  const owner=(await pool.query("INSERT INTO creators(display_name,email,password_salt,password_hash) VALUES('Preserved payer','preserved@bank-upgrade.invalid','salt','hash') RETURNING id")).rows[0].id;
  const commerce=require('../lib/commerce').createCommerce({pool}),bank=require('../lib/manual-bank-payments').createManualBankPayments({pool,env:{NODE_ENV:'test'},config:{enabled:true,invoice_hours:24,account:{bank_name:'Fixture - NOT REAL',account_name:'Fixture - NOT REAL',account_number:'0000000000',currency:'USD',country:'NG'}}});
  const order=await commerce.create(owner,crypto.randomUUID(),{kind:'artist_subscription',plan:'starter'}),invoice=await bank.start('artist',owner,crypto.randomUUID(),{order_id:order.id});
  await pool.query("INSERT INTO manual_bank_submissions(payment_id,payer_name,transfer_reference,transferred_at,note) VALUES($1,'Historical sender','BANK-OLD-ENTRY',NOW(),'Original note')",[invoice.id]);
  await pool.query("UPDATE manual_bank_payments SET status='submitted' WHERE id=$1",[invoice.id]);
  await pool.query("INSERT INTO manual_bank_reviews(payment_id,decision,administrator_id,note,merchant_id,mode,bank_reference,bank_reference_hash,received_at,received_minor,currency) VALUES($1,'approved','old-fixture-owner','Original independent bank verification.',$2,'test','BANK-OLD-ENTRY',$3,NOW(),600,'USD')",[invoice.id,invoice.merchant_id,require('../lib/transactions').digest('BANK-OLD-ENTRY')]);
  await pool.query("UPDATE manual_bank_payments SET status='approved' WHERE id=$1",[invoice.id]);
  const submission=(await pool.query('SELECT * FROM manual_bank_submissions')).rows[0],review=(await pool.query('SELECT * FROM manual_bank_reviews')).rows[0],payment=(await pool.query('SELECT * FROM manual_bank_payments')).rows[0];
  const migrate=require('../lib/migrations').migrate;assert.deepEqual(await migrate(pool),['032-simple-bank-receipts.sql','033-approved-premium-referrals.sql','034-owner-access-artist-launch.sql','035-monnify-checkout.sql']);assert.deepEqual(await migrate(pool),[]);
  assert.deepEqual((await pool.query('SELECT * FROM manual_bank_submissions')).rows[0],submission);assert.deepEqual((await pool.query('SELECT * FROM manual_bank_payments')).rows[0],payment);
  const current=(await pool.query('SELECT * FROM manual_bank_reviews')).rows[0];for(const [key,value]of Object.entries(review))assert.deepEqual(current[key],value,key);assert.equal(current.verification_method,'bank_details');assert.equal(current.receipt_hash,null);
  await assert.rejects(pool.query("UPDATE manual_bank_submissions SET payer_name='tampered'"),/history|mutat/i);await assert.rejects(pool.query("DELETE FROM manual_bank_reviews"),/history|mutat/i);
 }finally{await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
