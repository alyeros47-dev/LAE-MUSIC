'use strict';
const fs=require('node:fs');
const REPO='alyeros47-dev/LAE-MUSIC',SHA=/^[a-f0-9]{40}$/;
async function resolve({repository,ref,event,commit,token,fetcher=fetch}={}){
 if(repository!==REPO||ref!=='refs/heads/main'||event!=='push'||!SHA.test(commit||'')||!token)throw Error('Unexpected owner-approved continuous-playback release identity');
 async function get(path){const r=await fetcher('https://api.github.com/repos/'+REPO+path,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Release metadata HTTP '+r.status);return r.json();}
 const pr=await get('/pulls/39');
 if(!pr.merged||pr.merge_commit_sha!==commit||!SHA.test(pr.head?.sha||'')||pr.head.ref!=='codex/continuous-native-playback'||pr.head.repo?.full_name!==REPO)throw Error('Approved continuous-playback pull request is not this production merge');
 const runs=(await get('/actions/workflows/platform-tests.yml/runs?event=pull_request&head_sha='+pr.head.sha+'&per_page=100')).workflow_runs;
 const run=Array.isArray(runs)&&runs.find(r=>r.workflow_id===395852891&&r.head_sha===pr.head.sha&&r.event==='pull_request'&&r.status==='completed'&&r.conclusion==='success'&&/^\d{6,20}$/.test(String(r.id)));
 if(!run)throw Error('Exact continuous-playback candidate checks have not passed');
 return {candidate:pr.head.sha,commit,ci_run:String(run.id)};
}
if(require.main===module)resolve({repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,commit:process.env.GITHUB_SHA,token:process.env.GITHUB_TOKEN}).then(r=>{
 if(!process.env.GITHUB_OUTPUT)throw Error('Workflow outputs are unavailable');
 fs.appendFileSync(process.env.GITHUB_OUTPUT,Object.entries(r).map(([k,v])=>k+'='+v+'\n').join(''));
 console.log(JSON.stringify({release_pr:39,...r}));
}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={resolve};
