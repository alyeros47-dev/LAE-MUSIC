'use strict';
// Owner-requested, read-only auth diagnosis. Never return recipients, credentials,
// connection strings, account IDs, reset links, password hashes or session tokens.
const {inventory}=require('./audit-existing-service.cjs');
const SERVICE='srv-db84s7m89jmc73c7l9rg';
async function inspect({key,fetcher=fetch,dbFactory=options=>new(require('pg').Pool)(options)}={}){
 if(!key)throw Error('Render read access is unavailable');
 async function get(suffix){const r=await fetcher('https://api.render.com/v1/services/'+SERVICE+suffix,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Render read failed');return r.json();}
 const service=await get('');if(service.id!==SERVICE||service.repo?.replace(/\.git$/,'')!=='https://github.com/alyeros47-dev/LAE-MUSIC'||service.serviceDetails?.url!=='https://lae-music.onrender.com')throw Error('Unexpected service');
 const env=inventory(await get('/env-vars'));
 const {emailConfiguration,emailRuntime,encryptionKey}=require('../lib/account-email'),c=emailConfiguration(env),required=['SMTP_USER','SMTP_PASSWORD','SMTP_HOST','SMTP_FROM','ACCOUNT_EMAIL_KEY'];
 const report={read_only:true,production_writes:0,email:{enabled:emailRuntime({env}).enabled(),missing_settings:required.filter(k=>!env[k]),explicitly_enabled:env.ACCOUNT_EMAIL_ENABLED==='true',valid_encryption_key:!!encryptionKey(env.ACCOUNT_EMAIL_KEY),secure_origin:!!c.public_origin&&c.public_origin==='https://lae-music.com',smtp_port_supported:['465','587'].includes(String(c.smtp_port))},database:{available:false}};
 const options=require('../lib/database').databaseOptions(env);if(!options)return report;
 const pool=dbFactory({...options,max:1});let db;
 try{
  db=await pool.connect();await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='10s'");
  const row=async(sql)=>(await db.query(sql)).rows[0];
  const artist=await row("SELECT COUNT(*)::int AS accounts,COUNT(*) FILTER(WHERE NOT(password_salt ~ '^[a-f0-9]{32,64}$' AND password_hash ~ '^[a-f0-9]{128}$'))::int AS incompatible_credentials,COUNT(*) FILTER(WHERE email<>lower(btrim(email)))::int AS noncanonical_emails FROM creators");
  const listener=await row("SELECT COUNT(*)::int AS accounts,COUNT(*) FILTER(WHERE NOT(password_salt ~ '^[a-f0-9]{32,64}$' AND password_hash ~ '^[a-f0-9]{128}$'))::int AS incompatible_credentials,COUNT(*) FILTER(WHERE email<>lower(btrim(email)))::int AS noncanonical_emails FROM listeners");
  const links=await row("SELECT COUNT(*)::int AS linked_accounts,COUNT(*) FILTER(WHERE a.email<>l.email OR a.password_salt<>l.password_salt OR a.password_hash<>l.password_hash)::int AS inconsistent_credentials FROM account_role_links r JOIN creators a ON a.id=r.artist_id JOIN listeners l ON l.id=r.listener_id");
  const activity=await row("SELECT COUNT(*) FILTER(WHERE action='account.signin' AND created_at>NOW()-INTERVAL '24 hours')::int AS signins_last_24h,COUNT(*) FILTER(WHERE action='account.password.reset' AND created_at>NOW()-INTERVAL '24 hours')::int AS resets_last_24h FROM platform_audit WHERE action IN ('account.signin','account.password.reset')");
  const recovery=await row("SELECT COUNT(*) FILTER(WHERE status='queued')::int AS queued,COUNT(*) FILTER(WHERE status='sent')::int AS accepted_by_transport,COUNT(*) FILTER(WHERE status='uncertain')::int AS unconfirmed FROM account_email_outbox");
  const limits=await row("SELECT COUNT(*)::int AS active_account_limits FROM account_security_rates WHERE expires_at>NOW() AND attempts>30");
  report.database={available:true,artist,listener,links,activity,recovery,...limits};await db.query('ROLLBACK');
 }catch{if(db)await db.query('ROLLBACK').catch(()=>{});report.database={available:false,check_failed:true};}
 finally{db?.release();await pool.end();}
 return report;
}
if(require.main===module)inspect({key:process.env.RENDER_API_KEY}).then(r=>process.stdout.write(JSON.stringify(r,null,2)+'\n')).catch(()=>{console.error('Account access inspection is unavailable. No production changes were made.');process.exitCode=1;});
module.exports={inspect};
