'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fingerprint}=require('../lib/neon-recovery-rehearsal');
const cols=[{table_name:'creators',column_name:'id'},{table_name:'platform_migrations',column_name:'version'},{table_name:'platform_migrations',column_name:'checksum'},{table_name:'platform_migrations',column_name:'applied_at'}];
test('migration rehearsal verifies every original history row while permitting approved append-only versions',async()=>{
 const seen=[];let released=false;
 const db={query:async(sql,args)=>{seen.push({sql,args});if(sql.includes('pg_total_relation_size'))return{rows:[{bytes:'1'}]};if(sql.includes('AS checksum'))return{rows:[{rows:sql.includes('"platform_migrations"')?21:3,checksum:'preserved'}]};return{rows:[]};},release(){released=true;}};
 const original=['001-first.sql','021-existing.sql'];
 await fingerprint({connect:async()=>db},cols,original);
 const history=seen.find(x=>x.sql.includes('AS checksum')&&x.sql.includes('"platform_migrations"'));
 assert(history.sql.includes('WHERE version=ANY($1::text[])'));assert.deepEqual(history.args,[original]);
 const users=seen.find(x=>x.sql.includes('AS checksum')&&x.sql.includes('"creators"'));
 assert(!users.sql.includes('WHERE'));assert.deepEqual(users.args,[]);assert(released);assert(seen.some(x=>x.sql==='COMMIT'));
});
test('ordinary backup fingerprint retains complete history without filtering',async()=>{
 const seen=[];const db={query:async(sql,args)=>{seen.push({sql,args});if(sql.includes('pg_total_relation_size'))return{rows:[{bytes:'1'}]};if(sql.includes('AS checksum'))return{rows:[{rows:22,checksum:'all'}]};return{rows:[]};},release(){}};
 await fingerprint({connect:async()=>db},cols);
 assert(!seen.some(x=>x.sql.includes('WHERE version=ANY')));
});
test('invalid preserved history cannot weaken recovery verification',async()=>{
 await assert.rejects(fingerprint({connect(){throw Error('must not connect');}},cols,['invalid']),/Invalid preserved migration inventory/);
});
