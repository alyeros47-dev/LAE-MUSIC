'use strict';
// Incident-only, read-only diagnostic. Never imports server.js or changes provider settings.
const {inventory,serviceValid}=require('./audit-existing-service');
const {normalizedHost}=require('../lib/neon-recovery-inspection');
const SERVICE='srv-db84s7m89jmc73c7l9rg',WORKSPACE='tea-das55rjbc2fs739ccegg';
const PROJECT='restless-brook-43273058',BRANCH='br-flat-darkness-b42js8ma';
async function diagnose({renderKey,neonKey,fetcher=fetch,dbFactory=options=>new(require('pg').Pool)(options)}={}){
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
 report.usage_notice='Operational project counters may lag. No invoice or spending authorization is inferred. No quota, plan, compute, branch, records or credentials were changed.';
 return report;
}
module.exports={diagnose};
if(require.main===module)diagnose({renderKey:process.env.RENDER_API_KEY,neonKey:process.env.NEON_API_KEY}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(JSON.stringify({status:'diagnostic_failed',error_name:e.name,http_status:e.safeStatus||null,credentials_omitted:true}));process.exitCode=1;});
