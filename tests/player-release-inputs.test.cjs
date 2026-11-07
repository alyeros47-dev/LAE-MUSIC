'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resolve}=require('../scripts/player-release-inputs.cjs');
const head='a'.repeat(40),commit='b'.repeat(40),repo='alyeros47-dev/LAE-MUSIC';
function fixture({badPR=false,pending=false,badHead=false,unmerged=false,wrongWorkflow=false}={}){
 const calls=[];
 return {calls,run:extra=>resolve({repository:repo,ref:'refs/heads/main',event:'push',commit,token:'synthetic-fixture-only',fetcher:async(url,opt)=>{
  calls.push({url,opt});assert.equal(opt.redirect,'error');
  const body=url.endsWith('/pulls/34')?{merged:!unmerged,merge_commit_sha:badPR?'c'.repeat(40):commit,head:{sha:head,ref:'codex/continuous-playback',repo:{full_name:repo}}}:{workflow_runs:[{id:123456789,workflow_id:wrongWorkflow?400603251:395852891,head_sha:badHead?'c'.repeat(40):head,event:'pull_request',status:pending?'in_progress':'completed',conclusion:pending?null:'success'}]};
  return new Response(JSON.stringify(body),{status:200});
 },...extra})};
}
test('approved player merge resolves exact successful candidate without production API calls',async()=>{
 const f=fixture(),r=await f.run();assert.deepEqual(r,{candidate:head,commit,ci_run:'123456789'});assert.equal(f.calls.length,2);assert(f.calls.every(x=>x.url.startsWith('https://api.github.com/repos/'+repo+'/')));assert(!JSON.stringify(r).includes('synthetic'));
});
test('wrong event, repository, ref or commit stops before external calls',async()=>{
 for(const extra of [{repository:'other/repo'},{ref:'refs/heads/dev'},{event:'pull_request'},{commit:'invalid'}]){const f=fixture();await assert.rejects(f.run(extra));assert.equal(f.calls.length,0);}
});
test('unmerged or unrelated production commits cannot deploy',async()=>{
 for(const option of [{unmerged:true},{badPR:true}])await assert.rejects(fixture(option).run(),/not this production merge/);
});
test('pending, wrong-head or unrelated workflow success cannot replace required candidate CI',async()=>{
 for(const option of [{pending:true},{badHead:true},{wrongWorkflow:true}])await assert.rejects(fixture(option).run(),/checks have not passed/);
});
