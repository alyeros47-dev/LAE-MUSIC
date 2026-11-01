'use strict';
const crypto=require('node:crypto');
const {fail,similar}=require('./studio-lab-prompts');
// Independent lab database only. Never run application migrations or connect to
// production/review account, storage, financial, or customer-lyrics tables.
function databaseUrl(env=process.env){
 let u;try{u=new URL(env.STUDIO_LAB_DATABASE_URL);}catch{throw fail('A separate lab usage database is required.',503);}
 const local=['127.0.0.1','localhost'].includes(u.hostname);
 if(!['postgres:','postgresql:'].includes(u.protocol)||u.hash||
   (local?env.LAE_DB_TESTS!=='true'||u.pathname!=='/lae_music_ci'||u.search:
    env.NODE_ENV==='production'||u.pathname!=='/lae_studio_lab'||u.username!=='lae_studio_lab_owner'||!u.hostname.endsWith('.neon.tech')||u.hostname!==env.STUDIO_LAB_DATABASE_HOST||u.searchParams.get('sslmode')!=='require'))throw fail('Lab database isolation check failed.',503);
 return u;
}
function createStore({pool,cap=0}={}){
 if(!Number.isFinite(cap)||cap<0||cap>3)throw fail('The internal text-test spending cap must be explicitly configured between $0 and $3.',503);
 const lock=3811046;
 async function tx(fn){const db=await pool.connect();try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock($1)',[lock]);const value=await fn(db);await db.query('COMMIT');return value;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
 async function init(){await pool.query(`CREATE TABLE IF NOT EXISTS studio_lab_calls (
 id uuid PRIMARY KEY, run_id uuid NOT NULL, phase text NOT NULL, request_key text NOT NULL UNIQUE,
 state text NOT NULL CHECK(state IN ('reserved','recorded','uncertain')), reserved_usd numeric NOT NULL,
 estimated_usd numeric, model text, service_tier text, request_id text, usage jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(run_id,phase));
 CREATE TABLE IF NOT EXISTS studio_lab_runs (id uuid PRIMARY KEY, owner_hash text NOT NULL, key_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS studio_lab_fingerprints (id uuid PRIMARY KEY, hashes jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS studio_lab_research (id uuid PRIMARY KEY, run_id uuid NOT NULL, requests jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());`);}
 const totalSql="SELECT COALESCE(SUM(CASE WHEN state='recorded' THEN estimated_usd ELSE reserved_usd END),0)::float8 AS spent FROM studio_lab_calls";
 async function status(){const total=(await pool.query(totalSql)).rows[0].spent,calls=(await pool.query('SELECT phase,state,reserved_usd,estimated_usd,model,service_tier,request_id,usage,created_at FROM studio_lab_calls ORDER BY created_at DESC LIMIT 100')).rows,research=(await pool.query('SELECT requests,created_at FROM studio_lab_research ORDER BY created_at DESC LIMIT 100')).rows;return {cap_usd:cap,durable_metering_ready:true,committed_estimate_usd:Number(total),remaining_estimate_usd:Math.max(0,cap-Number(total)),calls,research,pricing:'USD estimates, not an invoice. Standard input $2/M tokens; output $10/M; cached input $0.10/M. Rates must be reviewed before any cap increase. Public research API fees are $0; hosting/compute is separate.',historical_usage:{usd:1.74,requests:27,average_usd:1.74/27,note:'Historical usage, not a fixed request or song price.'}};}
 async function begin(owner,key){return tx(async db=>{const id=crypto.randomUUID(),r=await db.query('INSERT INTO studio_lab_runs(id,owner_hash,key_hash) VALUES($1,$2,$3) ON CONFLICT(key_hash) DO NOTHING RETURNING id',[id,owner,key]);if(!r.rowCount)throw fail('This request was already submitted. Reopen its existing result rather than paying again.',409);return id;});}
 async function reserve(run,phase,maxCost){return tx(async db=>{const total=Number((await db.query(totalSql)).rows[0].spent);if(cap===0||total+maxCost>cap)throw fail('Real text generation is paused: the approved USD test budget is zero or insufficient. No provider call or customer charge was made.',402);const id=crypto.randomUUID(),key=crypto.createHash('sha256').update(run+':'+phase).digest('hex');await db.query("INSERT INTO studio_lab_calls(id,run_id,phase,request_key,state,reserved_usd) VALUES($1,$2,$3,$4,'reserved',$5)",[id,run,phase,key,maxCost]);return {id,key};});}
 async function record(id,result,cost){await pool.query("UPDATE studio_lab_calls SET state='recorded',estimated_usd=$2,model=$3,service_tier=$4,request_id=$5,usage=$6 WHERE id=$1 AND state='reserved'",[id,cost,result.model,result.service_tier,result.id,JSON.stringify(result.usage)]);}
 async function uncertain(id){await pool.query("UPDATE studio_lab_calls SET state='uncertain' WHERE id=$1 AND state='reserved'",[id]);}
 async function research(run,requests){await pool.query('INSERT INTO studio_lab_research(id,run_id,requests) VALUES($1,$2,$3)',[crypto.randomUUID(),run,JSON.stringify(requests)]);}
 async function checkFresh(hashes){return tx(async db=>{const rows=(await db.query("SELECT hashes FROM studio_lab_fingerprints ORDER BY created_at DESC LIMIT 64")).rows;if(rows.some(r=>similar(hashes,r.hashes)))return false;await db.query('INSERT INTO studio_lab_fingerprints(id,hashes) VALUES($1,$2)',[crypto.randomUUID(),JSON.stringify(hashes)]);await db.query("DELETE FROM studio_lab_fingerprints WHERE created_at < now()-interval '7 days'");return true;});}
 return {init,status,begin,reserve,record,uncertain,research,checkFresh};
}
// A stateless inspection can safely operate without a database ONLY at $0.
// Every generation reservation is refused; this cannot become paid metering.
function zeroBudgetStore(){return {init:async()=>{},status:async()=>({cap_usd:0,committed_estimate_usd:0,remaining_estimate_usd:0,durable_metering_ready:false,calls:[],research:[],note:'Read-only $0 inspection. A separate durable lab database and explicit USD authorization are required before any real text generation.'}),begin:async()=>crypto.randomUUID(),reserve:async()=>{throw fail('Real text generation is paused at a $0 budget. No paid call or customer charge was made.',402);},record:async()=>{throw fail('Durable text metering is unavailable.',503);},uncertain:async()=>{},research:async()=>{},checkFresh:async()=>{throw fail('Durable originality checks are unavailable.',503);}};}
module.exports={databaseUrl,createStore,zeroBudgetStore};
