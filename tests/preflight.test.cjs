'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {configurationReport,inspectDatabase,compareMigrations,migrationInventory}=require('../lib/release-preflight');
test('release preflight never prints configured secrets or converts credential presence into integration verification',()=>{
 const secret='DO-NOT-PRINT-THIS-PRIVATE-VALUE',env={DATABASE_URL:'postgres://private-user:'+secret+'@db.example.invalid/music',ADMIN_KEY:secret,ADMIN_MFA_KEY:'ab'.repeat(32),ACCOUNT_EMAIL_KEY:'cd'.repeat(32),R2_ACCOUNT_ID:secret,R2_ACCESS_KEY_ID:secret,R2_SECRET_ACCESS_KEY:secret,R2_BUCKET:secret,MUSICAPI_API_KEY:secret,OPENAI_API_KEY:secret,SMTP_USER:secret,SMTP_PASSWORD:secret,GENERATED_MEDIA_ALLOWED_HOSTS:secret,LAE_LIVE_PAYMENTS_APPROVED:'true'};
 const report=configurationReport(env),encoded=JSON.stringify(report);assert(!encoded.includes(secret));assert(!encoded.includes(env.ADMIN_MFA_KEY));assert(!encoded.includes(env.ACCOUNT_EMAIL_KEY));assert(!encoded.includes('private-user'));assert.equal(report.release_status,'blocked');assert.equal(report.configuration.r2_credentials_present,true);assert.equal(report.configuration.database_transport,'verified_tls');assert.match(report.notice,/not integration verification/);
 assert.equal(configurationReport({DATABASE_URL:'postgres://name:secret@db.example/music?sslmode=no-verify'}).configuration.database_transport,'invalid');
});
test('preflight detects missing, changed and unknown migration history without applying any migration',()=>{
 const expected=migrationInventory();assert(expected.length>=12);assert.deepEqual(compareMigrations(expected),{missing:[],changed:[],unknown:[]});const rows=expected.slice(1).map(x=>({...x}));rows[0].checksum='drifted';rows.push({version:'999-unknown.sql',checksum:'unknown'});const diff=compareMigrations(rows);assert.deepEqual(diff.missing,[expected[0].version]);assert.deepEqual(diff.changed,[expected[1].version]);assert.deepEqual(diff.unknown,['999-unknown.sql']);
});
test('database preflight is read-only, stops on missing schema and releases failed snapshot transactions',async()=>{
 const calls=[];let released=0;const make=broken=>({connect:async()=>({release(){released++;},query:async(sql)=>{calls.push(sql);if(sql.startsWith('SELECT name,')){if(broken)throw Error('fixture unavailable');return {rows:[{name:'platform_migrations',present:false}]};}return {rows:[]};}})});
 const report=await inspectDatabase(make(false));assert.equal(report.status,'blocked');assert.deepEqual(report.missing_tables,['platform_migrations']);assert.equal(report.checks_complete,false);assert.match(calls[0],/READ ONLY$/);assert.equal(calls.at(-1),'COMMIT');assert(!calls.some(sql=>/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(sql)));
 await assert.rejects(inspectDatabase(make(true)),/fixture unavailable/);assert.equal(calls.at(-1),'ROLLBACK');assert.equal(released,2);
});
