'use strict';
// Disposable local database and in-memory mailbox only. No live email/payment.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const {runtime}=require('./runtime.cjs'),{createAccountSecurity}=require('../lib/account-security');
test('an idle email worker wakes after the committed reset request and preserves reset/login semantics',{timeout:30000},async()=>{
 const target=require('./ci-database.cjs').ciDatabase(),control=new Pool({connectionString:target.href});
 const schema='idle_jobs_'+crypto.randomBytes(5).toString('hex');await control.query('CREATE SCHEMA '+schema);
 const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});let accounts,emptyReads=0;const delivered=[];
 const monitored={query:pool.query.bind(pool),async connect(){const client=await pool.connect();return {release:()=>client.release(),async query(sql,args){const result=await client.query(sql,args);if(sql.startsWith('SELECT o.id,o.token_hash,o.sealed_payload')&&!result.rowCount)emptyReads++;return result;}};}};
 const waitFor=async predicate=>{const until=Date.now()+5000;while(!predicate()){assert(Date.now()<until,'worker did not wake promptly');await new Promise(r=>setTimeout(r,10));}};
 try{
  accounts=createAccountSecurity({pool:monitored,emailKey:'ab'.repeat(32),publicOrigin:'https://lae.test',mailer:{enabled:()=>true,send:async message=>{
   // A reader on another connection can see the committed request before send.
   const token=new URLSearchParams(new URL(message.url).hash.slice(1)).get('token');
   const q=await pool.query("SELECT 1 FROM account_email_outbox WHERE token_hash=$1 AND status='sending'",[crypto.createHash('sha256').update(token).digest('hex')]);assert.equal(q.rowCount,1);delivered.push(message);
  }}});
  await runtime({pool,accountService:accounts,env:{NODE_ENV:'test',STUDIO_RELEASE_WORKER_ENABLED:'false'}});
  const password=await require('../lib/passwords').hashPassword('OriginalPassword123');
  const artist=(await pool.query("INSERT INTO creators(display_name,email,password_salt,password_hash,plan,country) VALUES('Idle fixture','idle@worker.invalid',$1,$2,'starter','Nigeria') RETURNING id",[password.salt,password.hash])).rows[0];
  await waitFor(()=>emptyReads>0);assert.equal(delivered.length,0);
  await accounts.issue('artist','reset_password','idle@worker.invalid','fixture');
  await waitFor(()=>delivered.length===1);
  const fragment=new URLSearchParams(new URL(delivered[0].url).hash.slice(1)),token=fragment.get('token');
  await accounts.consume('artist','reset_password',token,'UpdatedPassword123','fixture');
  assert.equal(String((await accounts.login('artist','idle@worker.invalid','UpdatedPassword123','fixture','fixture')).user.id),String(artist.id));
  await assert.rejects(accounts.login('artist','idle@worker.invalid','OriginalPassword123','fixture','fixture'),e=>e.status===401);
  await assert.rejects(accounts.consume('artist','reset_password',token,'AnotherPassword123','fixture'),e=>e.status===400);
  const mail=await pool.query('SELECT status,COUNT(*)::int AS n FROM account_email_outbox GROUP BY status');assert.deepEqual(mail.rows,[{status:'sent',n:1}]);
 }finally{accounts?.stop();await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
