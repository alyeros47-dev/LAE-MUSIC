'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('musicapi-sonic.js','utf8');
async function run({method='GET',path='/api/music/sonic/status',url=path+'?id=valid_task_123',user={id:7},origin=true,key='test',queries=[],requestBody='',fetchImpl}={}){
 const calls=[];let network=0;
 const pool={query:async(sql,args)=>{calls.push({sql,args});if(!queries.length)throw Error('Unexpected SQL: '+sql);const item=queries.shift();if(item.match&&!String(sql).includes(item.match))throw Error('Expected SQL '+item.match+' got '+sql);return item.result||{rowCount:0,rows:[]}},connect:async()=>{throw Error('Unexpected transaction')}};
 const response={status:0,body:null,writeHead(status){this.status=status},end(payload){this.body=JSON.parse(payload)}};
 const sandbox={module:{exports:null},console,process:{env:{MUSICAPI_API_KEY:key}},URL,AbortController,setTimeout,clearTimeout,fetch:async(...args)=>{network++;if(!fetchImpl)throw Error('Unexpected provider request');return fetchImpl(...args)},require};
 vm.runInNewContext(source,sandbox,{filename:'musicapi-sonic.js'});
 const req={method,url,async *[Symbol.asyncIterator](){yield requestBody}};
 await sandbox.module.exports(req,response,path,{me:async()=>user,pool,validOrigin:()=>origin});
 return {status:response.status,body:response.body,calls,network};
}
(async()=>{
 let x=await run({user:null});assert.equal(x.status,401);assert.equal(x.network,0);
 x=await run({origin:false,method:'POST',path:'/api/music/sonic/create'});assert.equal(x.status,403);
 x=await run({key:''});assert.equal(x.status,503);
 x=await run({url:'/api/music/sonic/status?id=bad!'});assert.equal(x.status,400);
 x=await run({queries:[{match:'SELECT task_id,status',result:{rowCount:0,rows:[]}}]});assert.equal(x.status,404);
 x=await run({queries:[{match:'SELECT task_id,status',result:{rowCount:1,rows:[{status:'failed'}]}}]});assert.equal(x.status,200);assert.equal(x.body.status,'failed');assert.equal(x.network,0);
 x=await run({method:'POST',path:'/api/music/sonic/create',requestBody:'{bad'});assert.equal(x.status,400);assert.match(x.body.error,/JSON/);
 x=await run({method:'POST',path:'/api/music/sonic/create',requestBody:'"hello"'});assert.equal(x.status,400);
 x=await run({method:'POST',path:'/api/music/sonic/create',requestBody:JSON.stringify({title:'A',lyrics:'too short',style:'pop'})});assert.equal(x.status,400);
 x=await run({method:'POST',path:'/api/music/sonic/create',requestBody:'x'.repeat(16001)});assert.equal(x.status,413);
 x=await run({method:'POST',path:'/api/music/sonic/premium-wav',requestBody:'{bad'});assert.equal(x.status,400);
 x=await run({method:'POST',path:'/api/music/sonic/premium-wav',requestBody:'[]'});assert.equal(x.status,400);
 x=await run({method:'POST',path:'/api/music/sonic/premium-wav',requestBody:JSON.stringify({task_id:'invalid!',clip_id:'invalid!'})});assert.equal(x.status,400);
 x=await run({method:'POST',path:'/api/music/sonic/premium-wav',requestBody:JSON.stringify({task_id:'valid_task_123',clip_id:'valid_clip_123'}),queries:[{match:'SELECT task_id FROM sonic_test_tasks',result:{rowCount:0,rows:[]}}]});assert.equal(x.status,403);assert.equal(x.network,0);
 console.log('PASS: 14 mocked Sonic HTTP/authorization/validation tests (no live database or provider).');
})().catch(e=>{console.error(e);process.exitCode=1});
