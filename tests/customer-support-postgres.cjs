'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),{Pool}=require('pg');
const target=require('./ci-database.cjs').ciDatabase();
const {createSupport}=require('../lib/customer-support');
(async()=>{
 const control=new Pool({connectionString:target.href}),schema='support_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});
 try{
 await pool.query(fs.readFileSync('migrations/039-customer-support.sql','utf8'));
 await pool.query('CREATE TABLE platform_audit(actor_type TEXT,actor_id TEXT,action TEXT,resource TEXT,details JSONB)');
 let submissions=0;const env={OPENAI_API_KEY:'synthetic-key',NODE_ENV:'test'},service=createSupport({pool,env,fetchImpl:async(url)=>{if(url.includes('/models/'))return Response.json({id:'gpt-6.1-sol'});submissions++;await new Promise(r=>setTimeout(r,50));return Response.json({model:'gpt-6.1-sol',status:'completed',usage:{input_tokens:100,output_tokens:30},output:[{content:[{type:'output_text',text:JSON.stringify({answer:'Open Offline library on the same device and browser. Catalogue saves remain inside LAE-MUSIC.',article_ids:['offline'],topic:'offline',escalate:false})}]}]});}});
 await service.updateSettings({enabled:true,whatsapp_number:'+2347040728318',daily_request_limit:3,daily_token_limit:600000},'fixture-owner');
 let cookie='';function req(id){return {headers:{cookie,'idempotency-key':id},socket:{remoteAddress:'127.0.0.1'}};}function res(){const h={};return {setHeader(k,v){h[k]=v;if(k==='Set-Cookie')cookie=v[0].split(';')[0];},getHeader(k){return h[k];}};}
 const id=crypto.randomUUID();const first=await service.chat(req(id),res(),{message:'How do I save offline?'});assert(first.ai);assert.equal(submissions,1);
 const retry=await service.chat(req(id),res(),{message:'How do I save offline?'});assert.deepEqual(retry,first);assert.equal(submissions,1);
 await assert.rejects(service.chat(req(id),res(),{message:'Different body'}),e=>e.status===409);
 // Concurrent requests race the shared daily ceiling. Exactly two remaining slots.
 const result=await Promise.all(Array.from({length:9},()=>service.chat(req(crypto.randomUUID()),res(),{message:'How do I save offline?'})));
 assert.equal(result.filter(x=>x.ai).length,2);assert.equal(submissions,3);
 assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM customer_support_requests')).rows[0].n),3);
 const data=(await pool.query('SELECT * FROM customer_support_requests')).rows;assert(data.every(r=>r.state==='completed'&&r.used_tokens===130&&r.input_tokens===100&&r.output_tokens===30));assert(!JSON.stringify(data).includes('same device'));
 const admin=await service.adminSettings();assert.equal(admin.usage.requests,3);assert.equal(admin.whatsapp_number,'2347040728318');
 await pool.query("UPDATE customer_support_requests SET expires_at=NOW()-INTERVAL '1 minute'");await service.chat(req(crypto.randomUUID()),res(),{message:'How do I save offline?'});assert((await pool.query('SELECT reply_cipher FROM customer_support_requests')).rows.every(r=>r.reply_cipher===null));
 console.log('PASS disposable PostgreSQL: additive migration, owner settings/audit, real SQL, idempotency, concurrent daily cap, token accounting, encrypted expiring cache; no customer tables modified.');
 }finally{await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
