'use strict';
// Requires the explicit disposable local CI database. Never uses a Neon URL.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {ciDatabase}=require('./ci-database.cjs'),{createStore}=require('../lib/studio-lab-store');
(async()=>{const url=ciDatabase(),pool=new(require('pg').Pool)({connectionString:url.href});try{
 const store=createStore({pool,cap:.10});await store.init();await pool.query('TRUNCATE studio_lab_calls,studio_lab_runs,studio_lab_fingerprints,studio_lab_research');
 const run=await store.begin('owner-hash','idempotency-hash');await assert.rejects(store.begin('owner-hash','idempotency-hash'),e=>e.status===409);
 const races=await Promise.allSettled([store.reserve(run,'one',.06),store.reserve(run,'two',.06)]);assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.filter(r=>r.status==='rejected'&&r.reason.status===402).length,1);
 const held=races.find(r=>r.status==='fulfilled').value;await store.uncertain(held.id);assert(Math.abs((await createStore({pool,cap:.10}).status()).remaining_estimate_usd-.04)<1e-10);
 await assert.rejects(store.reserve(run,'three',.05),e=>e.status===402);const other=await store.reserve(run,'four',.03);await store.record(other.id,{id:'resp-fixture',model:'gpt-6.1-sol',service_tier:'default',usage:{input_tokens:1,output_tokens:1}},.01);
 const snapshot=await store.status();assert(Math.abs(snapshot.committed_estimate_usd-.07)<1e-10);assert.equal(snapshot.calls.length,2);assert.equal(snapshot.calls.find(c=>c.state==='recorded').model,'gpt-6.1-sol');
 await store.research(run,[{tool:'musicbrainz.org',fee_usd:0,status:200,url:'https://musicbrainz.org/ws/2/artist/?query=Sinach'}]);assert.equal((await store.status()).research.length,1);
 const hashes=Array.from({length:12},()=>crypto.randomBytes(32).toString('hex'));const freshness=await Promise.all([store.checkFresh(hashes),store.checkFresh(hashes)]);assert.equal(freshness.filter(Boolean).length,1);
 const columns=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name IN ('studio_lab_calls','studio_lab_runs','studio_lab_fingerprints','studio_lab_research')")).rows.map(r=>r.column_name);for(const forbidden of ['lyrics','brief','password','email','credit_balance'])assert(!columns.includes(forbidden));
 console.log('PASS: durable concurrent spending cap, restart-held reservations, idempotency, exact model usage, free research ledger and private fingerprints (disposable PostgreSQL only).');
}finally{await pool.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
