'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),{Pool}=require('pg');
test('listener referral migration preserves existing identities and rejects unknown sponsors',{skip:process.env.LAE_DB_TESTS!=='true'},async()=>{
 const target=require('./ci-database.cjs').ciDatabase(),control=new Pool({connectionString:target.href}),schema='referral_upgrade_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});
 try{
  await pool.query("CREATE TABLE creators(id BIGINT PRIMARY KEY);INSERT INTO creators VALUES(4);CREATE TABLE listeners(id BIGINT PRIMARY KEY,email TEXT,password_hash TEXT);INSERT INTO listeners VALUES(9,'preserved@fixture.invalid','preserved-fixture-hash')");
  const before=(await pool.query('SELECT * FROM listeners')).rows;await pool.query(fs.readFileSync('migrations/036-listener-registration-referral.sql','utf8'));assert.deepEqual((await pool.query('SELECT id,email,password_hash FROM listeners')).rows,before);assert.equal((await pool.query('SELECT referred_by FROM listeners')).rows[0].referred_by,null);
  await assert.rejects(pool.query('UPDATE listeners SET referred_by=999 WHERE id=9'),e=>e.code==='23503');await pool.query('UPDATE listeners SET referred_by=4 WHERE id=9');assert.equal(String((await pool.query('SELECT referred_by FROM listeners')).rows[0].referred_by),'4');
 }finally{await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
