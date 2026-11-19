'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {diagnose}=require('../scripts/diagnose-database-quota');
const SERVICE='srv-db84s7m89jmc73c7l9rg',PROJECT='restless-brook-43273058',BRANCH='br-flat-darkness-b42js8ma';
function fixture(wrong=false){const calls=[];const privateValue='fixture-private-value';const fetcher=async(url,options)=>{calls.push({url,method:options.method});let data;
 if(url.endsWith('/env-vars'))data=[{envVar:{key:'DATABASE_URL',value:'postgresql://test:'+privateValue+'@ep-fixture-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require'}},{envVar:{key:'NEON_API_KEY',value:privateValue}}];
 else if(url.includes('api.render.com'))data={id:SERVICE,name:wrong?'wrong service':'LAE-MUSIC',type:'web_service',repo:'https://github.com/alyeros47-dev/LAE-MUSIC',ownerId:'tea-das55rjbc2fs739ccegg',branch:'main',serviceDetails:{url:'https://lae-music.onrender.com'}};
 else if(url.endsWith('/endpoints'))data={endpoints:[{host:'ep-fixture.us-east-2.aws.neon.tech',project_id:PROJECT,branch_id:BRANCH,current_state:'idle',disabled:false}]};
 else if(url.includes('/branches/'))data={branch:{id:BRANCH,project_id:PROJECT,logical_size:2000}};
 else data={project:{id:PROJECT,name:'fixture project',owner:{subscription_type:'free',email:'private@example.invalid'},compute_time_seconds:360001,settings:{quota:{compute_time_seconds:360000}}}};
 return{ok:true,json:async()=>data};};return{calls,fetcher,privateValue};}
test('read-only quota probe binds the production identity and emits no credentials or personal fields',async()=>{const f=fixture();const queries=[];const r=await diagnose({renderKey:'fixture-key',fetcher:f.fetcher,dbFactory:()=>({query:async q=>{queries.push(q);throw Object.assign(Error('Your account or project has exceeded the quota'),{code:'53000'});},end:async()=>{}})});assert.deepEqual(queries,['SELECT 1']);assert.ok(f.calls.every(c=>c.method==='GET'));assert.equal(r.quota.compute_time_seconds.explicit_limit_reached,true);assert.equal(r.database_connection.quota_rejection,true);assert.equal(r.billing_changes,0);assert.equal(JSON.stringify(r).includes(f.privateValue),false);assert.equal(JSON.stringify(r).includes('private@example.invalid'),false);});
test('wrong service stops before environment, database or Neon access',async()=>{const f=fixture(true);await assert.rejects(()=>diagnose({renderKey:'fixture-key',fetcher:f.fetcher,dbFactory:()=>{throw Error('must not connect');}}),/production_identity_not_matched/);assert.equal(f.calls.length,1);});
