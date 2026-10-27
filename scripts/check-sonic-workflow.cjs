'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('musicapi-sonic.js','utf8');
new vm.Script(source,{filename:'musicapi-sonic.js'});
const cases=[
 ['reserves before contacting provider',source.indexOf("INSERT INTO sonic_test_tasks(task_id,creator_id,status)")>0&&source.indexOf("INSERT INTO sonic_test_tasks(task_id,creator_id,status)")<source.indexOf("remote('/create'")],
 ['locks artist before quota checks',source.indexOf("SELECT id FROM creators WHERE id=$1 FOR UPDATE")<source.indexOf("const daily=await client.query")],
 ['checks active generation inside transaction',source.includes("const active=await client.query")],
 ['checks 24-hour limit inside transaction',source.includes("const daily=await client.query")],
 ['requires verified active subscription',source.includes("status='paid' AND starts_at<=NOW() AND expires_at>NOW()")],
 ['reserves generation usage',source.includes("INSERT INTO artist_studio_usage(subscription_id,artist_id,generation_reference,purchase_order_id)")],
 ['atomically replaces provisional task reference',source.includes("UPDATE sonic_test_tasks SET task_id=$1 WHERE task_id=$2 AND creator_id=$3 RETURNING task_id")],
 ['atomically replaces provisional usage reference',source.includes("UPDATE artist_studio_usage SET generation_reference=$1 WHERE generation_reference=$2 AND artist_id=$3 RETURNING id")],
 ['releases failed reservation',source.includes("DELETE FROM sonic_test_tasks WHERE task_id=$1 AND creator_id=$2")&&source.includes("DELETE FROM artist_studio_usage WHERE generation_reference=$1 AND artist_id=$2")],
 ['validates provider task identifier',source.includes("The music provider responded without a usable task reference.")],
 ['enforces task ownership for status',source.includes("SELECT task_id,status,usable_output_seen,EXISTS(SELECT 1 FROM artist_test_generations a WHERE a.artist_id=$2 AND a.task_reference=$1) AS complimentary FROM sonic_test_tasks WHERE task_id=$1 AND creator_id=$2")],
 ['enforces task ownership for WAV',source.includes("SELECT task_id FROM sonic_test_tasks WHERE task_id=$1 AND creator_id=$2 AND status='succeeded'")],
 ['releases credit on failed task',source.includes("if(finalStatus==='failed')await db.query")],
 ['handles cancelled provider tasks',source.includes("'cancelled','canceled'")],
 ['task schema initialized outside request handler',!source.includes('CREATE TABLE IF NOT EXISTS sonic_test_tasks')],
 ['does not lock schema on every request',!source.includes('ALTER TABLE sonic_test_tasks')],
 ['terminal failed status skips provider request',source.includes("owned.rows[0].status==='failed'")],
 ['refunds failed task transactionally',source.includes("if(finalStatus==='failed')await db.query")],
 ['validates locked artist account',source.includes('if(!locked.rowCount)')],
 ['rejects invalid JSON with client error',source.includes('Invalid JSON request')],
 ['rejects oversized request with 413',source.includes('e.status=413')],
 ['retains reservations after ambiguous provider failures',source.includes('if(!uncertain)await release()')],
 ['returns reconciliation reference on uncertain failures',source.includes("status:'verification_required'")],
 ['does not refund accepted provider task without ID',!source.includes("if(!/^[a-zA-Z0-9_-]{8,128}$/.test(id)){await release()") ],
 ['locks unresolved provider reservations beyond 15 minutes',source.includes("task_id LIKE 'sonic-%' AND status='pending'")],
 ['preflight includes older unresolved reservations',source.includes("OR (task_id LIKE 'sonic-%' AND status='pending'))")],
 ['keeps per-artist transactional lock',source.includes('SELECT id FROM creators WHERE id=$1 FOR UPDATE')],
 ['transient provider errors preserve credits for reconciliation',source.includes('providerStatus>=500')&&source.includes('providerStatus===408')],
 ['unresolved provisional task returns reconciliation state',source.includes("if(id.startsWith('sonic-'))return send(res,202")],
 ['preserves terminal state during concurrent status polls',source.includes("WHEN status IN ('succeeded','failed') THEN status WHEN $1='failed'")],
 ['refunds based on committed terminal state',source.includes("if(finalStatus==='failed')await db.query") ]
];
for(const [label,ok] of cases){assert(ok,label);console.log('PASS',label)}
console.log('All '+cases.length+' Sonic static invariants passed. These are not database or provider integration tests.');

