'use strict';
// Owner-requested trace of one reset recipient. Read-only queries only; never
// select or print recipient addresses, credentials, password hashes or reset links.
const {inventory}=require('./audit-existing-service.cjs');
const SERVICE='srv-db84s7m89jmc73c7l9rg';
async function trace({key,target,fetcher=fetch,dbFactory=options=>new(require('pg').Pool)(options)}={}){
 if(!key||!/^[a-f0-9]{64}$/.test(target||''))throw Error('An explicit recipient digest is required');
 async function get(suffix){const r=await fetcher('https://api.render.com/v1/services/'+SERVICE+suffix,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Render read unavailable');return r.json();}
 const service=await get('');if(service.id!==SERVICE||service.repo?.replace(/\.git$/,'')!=='https://github.com/alyeros47-dev/LAE-MUSIC'||service.serviceDetails?.url!=='https://lae-music.onrender.com')throw Error('Unexpected service');
 const rows=[];let cursor='';for(let i=0;i<10;i++){const page=await get('/env-vars?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));rows.push(...page);if(page.length<100)break;cursor=page.at(-1)?.cursor;if(!cursor)throw Error('Incomplete settings');}
 const env=inventory(rows),options=require('../lib/database').databaseOptions(env);if(!options)throw Error('Database unavailable');
 const pool=dbFactory({...options,max:1}),db=await pool.connect(),report={read_only:true,production_writes:0,matched_accounts:0,roles:{}};
 try{
  await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='10s'");
  for(const [role,table,owner]of [['artist','creators','creator_id'],['listener','listeners','listener_id']]){
   const found=await db.query("SELECT id FROM "+table+" WHERE encode(sha256(convert_to(lower(btrim(email)),'UTF8')),'hex')=$1",[target]);report.roles[role]={matches:found.rowCount,reset_requests:[]};report.matched_accounts+=found.rowCount;
   for(const account of found.rows){
    const requests=await db.query("SELECT t.created_at AS requested_at,t.expires_at,t.consumed_at IS NOT NULL AS used,t.delivery_state,o.status AS email_status,o.claimed_at,o.finished_at FROM account_action_tokens t LEFT JOIN account_email_outbox o ON o.token_hash=t.token_hash WHERE t."+owner+"=$1 AND t.purpose='reset_password' ORDER BY t.created_at DESC LIMIT 5",[account.id]);report.roles[role].reset_requests.push(...requests.rows);
    const limits=await db.query("SELECT attempts,expires_at FROM account_security_rates WHERE expires_at>NOW() AND bucket IN (SELECT encode(sha256(convert_to('email-request:'||kind||':reset_password:'||lower(btrim(email)),'UTF8')),'hex') FROM "+table+" CROSS JOIN (VALUES ('account'),('artist'),('listener')) AS scopes(kind) WHERE id=$1)",[account.id]);report.roles[role].active_request_limits=limits.rows;
   }
  }
  await db.query('ROLLBACK');return report;
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();await pool.end();}
}
if(require.main===module)trace({key:process.env.RENDER_API_KEY,target:process.env.LAE_RESET_TARGET_SHA256}).then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{console.error('The read-only reset trace could not complete. No private values are shown.');process.exitCode=1;});
module.exports={trace};
