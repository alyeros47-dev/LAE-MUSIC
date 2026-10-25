'use strict';
// Read-only report. It intentionally exits 2 while the release has unresolved launch gates.
const {configurationReport,inspectDatabase}=require('../lib/release-preflight');
const {databaseOptions}=require('../lib/database');
async function main(){
 const args=process.argv.slice(2);if(args.some(value=>value!=='--database'))throw Error('Usage: npm run preflight -- [--database]');
 const report=configurationReport();
 if(args.includes('--database')){
  let pool;try{const options=databaseOptions();if(!options)throw Error('Database unavailable');const {Pool}=require('pg');pool=new Pool({...options,max:1});report.database=await inspectDatabase(pool);}catch{report.database={status:'unavailable',checks_complete:false,message:'Read-only database inspection failed. Verify connectivity, schema and certificate trust through the host logs; credentials and connection details are omitted.'};}finally{if(pool)await pool.end();}
 }else report.database={status:'not_run',checks_complete:false};
 process.stdout.write(JSON.stringify(report,null,2)+'\n');process.exitCode=2;
}
main().catch(()=>{process.stderr.write('Preflight could not run. Use npm run preflight -- [--database]. No configuration values were printed.\n');process.exitCode=1;});
