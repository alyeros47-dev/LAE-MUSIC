'use strict';
const crypto = require('node:crypto');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
function requestKey(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(value)) throw fail(400, 'A valid Idempotency-Key is required. Retry with the same key.');
  return value;
}
async function transaction(pool, callback) {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const context=require('./request-context').get();if(context?.adminFence)await context.adminFence(db); const result = await callback(db); await db.query('COMMIT'); return result; }
  catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
async function audit(db, actor, action, resource, details = {}) {
  await db.query('INSERT INTO platform_audit(actor_type,actor_id,action,resource,details) VALUES($1,$2,$3,$4,$5)', [actor.type, String(actor.type==='admin'&&actor.id==='session'?(require('./request-context').get()?.adminId||actor.id):actor.id), action, resource, JSON.stringify(details)]);
}
// Use inside the SAME transaction as the mutation. Concurrent retries wait for this key.
async function idempotent(db, scope, key, payload, callback) {
  requestKey(key);
  const hash = digest(payload);
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [scope + ':' + key]);
  const old = await db.query('SELECT payload_hash,result FROM platform_requests WHERE scope=$1 AND request_key=$2', [scope, key]);
  if (old.rowCount) {
    if (old.rows[0].payload_hash !== hash) throw fail(409, 'This request key was already used for different details.');
    return old.rows[0].result;
  }
  const result = await callback();
  await db.query('INSERT INTO platform_requests(scope,request_key,payload_hash,result) VALUES($1,$2,$3,$4)', [scope, key, hash, JSON.stringify(result)]);
  return result;
}
module.exports = { digest, fail, requestKey, transaction, audit, idempotent };
