'use strict';
// Incident-only, read-only diagnostic. Never imports server.js or changes provider settings.
const {inventory,serviceValid}=require('./audit-existing-service.cjs');
const {normalizedHost}=require('../lib/neon-recovery-inspection');
const SERVICE='srv-db84s7m89jmc73c7l9rg',WORKSPACE='tea-das55rjbc2fs739ccegg';
const PROJECT='restless-brook-43273058',BRANCH='br-flat-darkness-b42js8ma';
async function diagnose({renderKey,neonKey,includeHistory=false,fetcher=fetch,dbFactory=options=>new(require('pg').Pool)(options)}={}){
 if(!renderKey)throw Error('render_access_missing');
 async function get(origin,path,key){
  const r=await fetcher(origin+path,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+key.trim(),Accept:'application/json'},signal:AbortSignal.timeout(20000)});
  if(!r.ok){const e=Error('management_read_failed');e.safeStatus=r.status;throw e;}return r.json();
 }
 const render=(p)=>get('https://api.render.com/v1',p,renderKey);
 const service=await render('/services/'+SERVICE);
 if(!serviceValid(service)||service.ownerId!==WORKSPACE||service.branch!=='main')throw Error('production_identity_not_matched');
 const env=inventory(await render('/services/'+SERVICE+'/env-vars'));
 let db;try{db=new URL(env.DATABASE_URL);}catch{throw Error('database_identity_not_matched');}
 if(!['postgres:','postgresql:'].includes(db.protocol)||!db.hostname.endsWith('.neon.tech'))throw Error('database_identity_not_matched');
 const key=neonKey||env.NEON_API_KEY;
 const report={read_only:true,production_writes:0,billing_changes:0,service_id:SERVICE,database_provider:'Neon',database_connection:{verified:false}};
 let pool;try{pool=dbFactory({...require('../lib/database').databaseOptions(env),max:1,connectionTimeoutMillis:5000,query_timeout:5000});await pool.query('SELECT 1');report.database_connection={verified:true};}
 catch(e){report.database_connection={verified:false,sqlstate:typeof e.code==='string'?e.code:null,quota_rejection:/quota/i.test(String(e.message))};}
 finally{await pool?.end();}
 if(!key){report.management_access='missing';return report;}
 const neon=(p)=>get('https://console.neon.tech/api/v2','/projects/'+PROJECT+p,key);
 const endpoints=(await neon('/endpoints')).endpoints;
 const bound=endpoints?.filter(e=>e.project_id===PROJECT&&e.branch_id===BRANCH&&normalizedHost(e.host)===normalizedHost(db.hostname));
 if(bound?.length!==1)throw Error('database_identity_not_matched');
 const project=(await neon('')).project,branch=(await neon('/branches/'+BRANCH)).branch;
 if(project.id!==PROJECT||branch.id!==BRANCH||branch.project_id!==PROJECT)throw Error('database_identity_not_matched');
 report.database_binding_verified=true;report.project={id:PROJECT,name:project.name,plan:project.owner?.subscription_type||null,period_start:project.consumption_period_start,period_end:project.consumption_period_end,compute_last_active_at:project.compute_last_active_at,branch_logical_size_bytes:branch.logical_size??null};
 const metrics=['active_time_seconds','compute_time_seconds','written_data_bytes','data_transfer_bytes','logical_size_bytes'];
 report.quota=Object.fromEntries(metrics.map(k=>{const used=k==='logical_size_bytes'?branch.logical_size:project[k],limit=project.settings?.quota?.[k];return[k,{operational_usage:Number.isFinite(used)?used:null,explicit_project_limit:Number.isFinite(limit)?limit:null,explicit_limit_reached:Number.isFinite(limit)&&limit>0&&Number.isFinite(used)?used>=limit:null}];}));
 report.endpoint={current_state:bound[0].current_state,pending_state:bound[0].pending_state||null,disabled:bound[0].disabled,suspended_at:bound[0].suspended_at,autoscaling_min_cu:bound[0].autoscaling_limit_min_cu,autoscaling_max_cu:bound[0].autoscaling_limit_max_cu,suspend_timeout_seconds:bound[0].suspend_timeout_seconds};
 if(includeHistory){
  // Render native Node services supply NODE_ENV=production at runtime unless overridden.
  const runtimeEnv={...env,NODE_ENV:env.NODE_ENV===undefined?'production':env.NODE_ENV};
  // Pure capability calculation only: this injected transport cannot send email.
  const mailer=require('../lib/account-email').emailRuntime({env:runtimeEnv,createTransport:()=>({sendMail:async()=>{throw Error('diagnostic_transport_disabled');}})});
  const emailEnabled=require('../lib/account-security').createAccountSecurity({pool:null,mailer,publicOrigin:mailer.origin||require('../config/account-email.json').public_origin,emailKey:env.ACCOUNT_EMAIL_KEY||''}).capabilities().email_delivery_enabled;
  report.runtime={node_env:['production','staging','test','development'].includes(runtimeEnv.NODE_ENV)?runtimeEnv.NODE_ENV:'other',node_env_source:env.NODE_ENV===undefined?'render_native_node_runtime_default':'explicit_service_variable',database_pool_max:Number(env.DATABASE_POOL_MAX||10),database_pool_idle_timeout_ms:30000,pooled_database_hostname:db.hostname.includes('-pooler.'),studio_release_worker_enabled:env.STUDIO_RELEASE_WORKER_ENABLED!=='false',account_email_worker_enabled:emailEnabled,artist_notification_worker_enabled:env.ARTIST_NOTIFICATION_WORKER_ENABLED!=='false'&&['production','staging'].includes(runtimeEnv.NODE_ENV),partner_bonus_worker_enabled:runtimeEnv.NODE_ENV==='production'&&env.PARTNER_BONUS_WORKER_ENABLED!=='false',affiliate_payout_reconciliation_worker_enabled:true,account_cleanup_worker_enabled:true};
  report.project_endpoints=endpoints.filter(e=>e.project_id===PROJECT).map(e=>({production_branch:e.branch_id===BRANCH,type:e.type,state:e.current_state,min_cu:e.autoscaling_limit_min_cu,max_cu:e.autoscaling_limit_max_cu,suspend_timeout_seconds:e.suspend_timeout_seconds}));
  const query=new URLSearchParams({project_ids:PROJECT,from:project.consumption_period_start,to:new Date().toISOString(),granularity:'daily',limit:'1',metrics:project.org_id?'compute_unit_seconds':'compute_time_seconds,active_time_seconds'});
  if(project.org_id)query.set('org_id',project.org_id);
  const historyPath=project.org_id?'/consumption_history/v2/projects':'/consumption_history/projects';
  try{const history=await get('https://console.neon.tech/api/v2',historyPath+'?'+query,key);const entry=history.projects?.find(p=>(p.project_id||p.id)===PROJECT);report.daily_consumption_history={available:!!entry,periods:entry?.periods||[]};}
  catch(e){report.daily_consumption_history={available:false,http_status:e.safeStatus||null,reason:e.safeStatus===403?'current_plan_does_not_allow_history_api':'management_read_unavailable'};}
  try{const result=await neon('/operations?limit=1000');const ops=result.operations||[];const counts={};for(const op of ops){const name=String(op.action||'unspecified');counts[name]=(counts[name]||0)+1;}report.operation_history={count:ops.length,counts,earliest:ops.map(o=>o.created_at).sort()[0]||null,latest:ops.map(o=>o.created_at).sort().at(-1)||null,recent:ops.slice(0,12).map(o=>({action:o.action,status:o.status,created_at:o.created_at,updated_at:o.updated_at})),production_compute_transitions:bound[0].id?ops.filter(o=>o.endpoint_id===bound[0].id&&['start_compute','suspend_compute'].includes(o.action)&&o.status==='finished'&&o.created_at>=project.consumption_period_start).map(o=>({action:o.action,created_at:o.created_at,updated_at:o.updated_at})):[],more_pages:!!result.pagination?.cursor};}
  catch(e){report.operation_history={available:false,http_status:e.safeStatus||null};}
 }
 report.usage_notice='Operational project counters may lag. No invoice or spending authorization is inferred. No quota, plan, compute, branch, records or credentials were changed.';
 return report;
}
module.exports={diagnose};
if(require.main===module)diagnose({renderKey:process.env.RENDER_API_KEY,neonKey:process.env.NEON_API_KEY,includeHistory:process.argv.includes('--history')}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(JSON.stringify({status:'diagnostic_failed',error_name:e.name,http_status:e.safeStatus||null,credentials_omitted:true}));process.exitCode=1;});
