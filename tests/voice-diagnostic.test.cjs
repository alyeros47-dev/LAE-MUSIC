'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspect,summary}=require('../scripts/inspect-voice-profile.cjs');
test('voice diagnosis reads only the fixed service, exact artist digest and already-existing task',async()=>{
 const calls=[],queries=[],env={DATABASE_URL:'postgres://localhost/fixture',MUSICAPI_API_KEY:'private-music-fixture'};
 let released=false,ended=false;
 const result=await inspect({key:'private-render-fixture',artistHash:'a'.repeat(64),fetcher:async(url,options)=>{
  calls.push([url,options.method]);assert.equal(options.method,'GET');
  if(url.endsWith('/services/srv-db84s7m89jmc73c7l9rg'))return Response.json({id:'srv-db84s7m89jmc73c7l9rg',name:'LAE-MUSIC',type:'web_service',repo:'https://github.com/alyeros47-dev/LAE-MUSIC',serviceDetails:{url:'https://lae-music.onrender.com'}});
  if(url.includes('/env-vars'))return Response.json(Object.entries(env).map(([key,value])=>({key,value})));
  assert(url.endsWith('/sonic/task/existing_voice_task_123'));
  return Response.json({code:200,type:'failed',error:'Could not fetch https://private.invalid/sample.wav?token=private-token',data:{error_message:'private-music-fixture',persona_id:null}});
 },dbFactory:()=>({connect:async()=>({query:async(sql,args)=>{queries.push(sql);if(sql.startsWith('SELECT')){assert.deepEqual(args,['a'.repeat(64)]);return {rows:[{status:'failed',task_id:'existing_voice_task_123',object_key:'private/sample.wav',updated_at:'2026-11-04'}]};}return {rows:[]};},release(){released=true;}}),async end(){ended=true;}})});
 assert.equal(result.production_writes,0);assert.equal(result.paid_provider_requests,0);assert.equal(result.lookup,'matched');assert.equal(calls.length,3);
 assert(queries.every(q=>/^(BEGIN READ ONLY|SET LOCAL|SELECT|COMMIT)/.test(q)));
 const output=JSON.stringify(result);for(const privateValue of ['private-music-fixture','private-render-fixture','private.invalid','private-token','private/sample.wav','existing_voice_task_123'])assert(!output.includes(privateValue));assert(released&&ended);
});
test('provider diagnostics whitelist fields and suppress private URLs, secrets and email',()=>{
 const output=summary({status:'failed',error:'secret123 at owner@example.com https://example.invalid/private?key=secret123',lyrics:'private words',audio_url:'private location',data:{persona_id:'private-id'}},['secret123']);
 const s=JSON.stringify(output);assert(!s.includes('secret123'));assert(!s.includes('owner@example.com'));assert(!s.includes('private words'));assert(!s.includes('private location'));assert(!s.includes('private-id'));assert(output.persona_returned);
});
