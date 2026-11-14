'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{inspect}=require('../scripts/inspect-account-access.cjs');
test('account diagnosis is read-only and emits aggregates without credentials, hashes or identities',async()=>{
 const sql=[],secret='private-render-fixture',databaseUrl='postgres://fixture:private-database-password@localhost/test',env={NODE_ENV:'production',DATABASE_URL:databaseUrl,SMTP_USER:'private-smtp-user',SMTP_PASSWORD:'private-smtp-password',ACCOUNT_EMAIL_KEY:'ab'.repeat(32)};
 const db={async query(q){sql.push(q);if(q.startsWith('SELECT'))return {rows:[{accounts:7,signins_last_24h:2}]};return {rows:[]};},release(){}};
 const r=await inspect({key:secret,fetcher:async(url,options)=>{assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+secret);return Response.json(url.endsWith('/env-vars')?Object.entries(env).map(([key,value])=>({envVar:{key,value}})):{id:'srv-db84s7m89jmc73c7l9rg',repo:'https://github.com/alyeros47-dev/LAE-MUSIC',serviceDetails:{url:'https://lae-music.onrender.com'}});},dbFactory:()=>({connect:async()=>db,end:async()=>{}})});
 assert.equal(sql[0],'BEGIN READ ONLY');assert.equal(sql.at(-1),'ROLLBACK');assert(sql.every(q=>/^(BEGIN READ ONLY|SET LOCAL|SELECT|ROLLBACK)/.test(q)));assert.equal(r.production_writes,0);assert(r.database.available);const output=JSON.stringify(r);for(const value of [secret,databaseUrl,env.SMTP_USER,env.SMTP_PASSWORD,env.ACCOUNT_EMAIL_KEY,'password_hash','password_salt','token_hash'])assert(!output.includes(value));
 assert.deepEqual(r.email.missing_settings,['SMTP_HOST','SMTP_FROM']);assert.equal(r.email.enabled,false);
});
test('unexpected services are rejected before reading credentials or connecting to the database',async()=>{let calls=0;await assert.rejects(inspect({key:'fixture',fetcher:async()=>{calls++;return Response.json({id:'another-service'});},dbFactory(){throw Error('Must not connect');}}));assert.equal(calls,1);});
