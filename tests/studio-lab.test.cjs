'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const p=require('../lib/studio-lab-prompts'),{createLab,cost,ceiling}=require('../lib/studio-lab'),{createResearch}=require('../lib/studio-lab-research'),{databaseUrl}=require('../lib/studio-lab-store'),{configuration,createServer}=require('../scripts/studio-lab-server.cjs');
const {understanding,output,clone,memoryStore}=require('./studio-lab-fixtures.cjs');
test('full detailed brief and clarification survive both prompt phases, with no legacy preset transformation',()=>{
 const brief='Oluwatóbilọ́ba, no wahala. Ugene drums; no keyboard. '+ 'specific story detail '.repeat(300),r=p.request({brief,answer:'The Nigerian Gospel singer, not the footballer.'});
 assert.equal(r.brief,brief);assert(r.brief.length>1200);assert.equal(JSON.parse(p.interpretation(r).input).brief,brief);assert.equal(JSON.parse(p.composition(r,understanding,[]).input).customer.brief,brief);assert.equal(p.MODEL,'gpt-6.1-sol');assert.notEqual(p.request({brief}).variation,r.variation);
 assert.throws(()=>p.request({brief:'a'.repeat(12001)}),/Nothing was shortened/);assert.throws(()=>p.request({brief:'hello'}));assert.throws(()=>p.request({brief:'enough text here',answer:'a'.repeat(2001)}));
 const instructions=p.composition(r,understanding,[]).instructions;for(const term of ['ENTIRE','Pidgin','pseudo-local','No celebrity names','rhythm','original','NOT heard recordings'])assert(instructions.includes(term));assert(!instructions.includes('Altar Encounter'));
});
test('short provider prompt and full production brief are separate; edited lyrics arrive intact in the exact existing engine payload',()=>{
 const o=clone(output);o.detailed_style+=' Additional details.'.repeat(100);assert(p.validateOutput(o,understanding,[]));
 const payload=p.handoff(o);assert.deepEqual(payload,{task_type:'create_music',custom_mode:true,mv:'sonic-v6',title:o.title,prompt:o.lyrics,tags:o.provider_style,duration:180,make_instrumental:false});assert.equal(o.detailed_style.length>1000,true);
 assert.throws(()=>p.handoff({...o,provider_style:'x'.repeat(1001)}),/Nothing was shortened/);assert.throws(()=>p.handoff({...o,lyrics:'word '.repeat(600),duration_seconds:60}),/too long/);assert.throws(()=>p.validateOutput({...o,lyrics:o.lyrics.replace('[End]','')},understanding,[]),/Outro\/End/);
});
test('misspelled or unclear artist hypotheses require real evidence; invented research claims fail closed',()=>{
 const u=clone(understanding);u.artists=[{as_written:'Sinnach',search_name:'Sinach'}];
 const research=[{as_written:'Sinnach',candidates:[{name:'Sinach'}],sources:[{id:'s1',text:'Sinach is a Nigerian gospel singer and songwriter.'}]}];
 const o=clone(output);o.artist_research=[{as_written:'Sinnach',resolved_name:'Sinach',facts:[{source_id:'s1',evidence_quote:'Nigerian gospel singer',characteristic:'Gospel singer from Nigeria'}],original_translation:'An original expansive melodic chorus with responsive percussion.'}];assert(p.validateOutput(o,u,research));
 assert.throws(()=>p.validateOutput(o,u,[]),/not verified/);assert.throws(()=>p.validateOutput({...o,provider_style:'Sing exactly like Sinach'},u,research),/reference artist/);
 o.artist_research[0].facts[0].evidence_quote='plays intricate 7/8 drums';assert.throws(()=>p.validateOutput(o,u,research),/fetched evidence/);
 const clarification=p.validateInterpretation({status:'clarify',question:'Do you mean the Gospel singer or the footballer?'});assert.equal(clarification.status,'clarify');
});
test('keyed cross-request narrative detection allows repeated refrains and deliberate quoted phrases',()=>{
 const key='private-test-key',a=p.fingerprints(output.lyrics,key);assert(p.similar(a,a));assert(!p.similar(a,p.fingerprints(output.lyrics,'different-key')));
 const chorusOnly='[Chorus]\n'+('Receive my thanks today let every note be true\n'.repeat(8));assert.equal(p.fingerprints(chorusOnly,key).length,0);
 const phrase='an explicitly requested line with enough words for matching';assert.equal(p.fingerprints('[Verse]\n'+phrase,key,[phrase]).length,0);
 assert(!p.similar(a,p.fingerprints('[Verse]\nThe painter fills her canvas with orange light and the sculptor shapes an arc from patient stone while distant bells draw circles through the evening air.',key)));
});
test('free real research adapters query only artist names, include evidence/source URLs and report failures honestly',async()=>{
 const urls=[],responses=[{artists:[{id:'artist-id',name:'Sinach',country:'NG',score:100}]},{query:{search:[{pageid:42}]}},{query:{pages:{42:{pageid:42,title:'Sinach',extract:'Sinach is a Nigerian gospel singer and songwriter.'}}}}];
 const tool=createResearch({fetchImpl:async url=>{urls.push(url);return new Response(JSON.stringify(responses.shift()));},wait:async()=>{}}),result=await tool.artist({as_written:'Sinnach',search_name:'Sinach'});
 assert.equal(result.status,'retrieved');assert.equal(result.sources.length,2);assert.equal(result.requests.length,3);assert(result.requests.every(r=>r.fee_usd===0&&r.status===200));assert(urls.every(url=>!url.includes('private song story')));
 const failed=await createResearch({fetchImpl:async()=>new Response('no',{status:503})}).artist({as_written:'Unknown',search_name:'Unknown'});assert.equal(failed.status,'incomplete');assert.equal(failed.sources.length,0);
 const tooLarge=await createResearch({fetchImpl:async()=>new Response('x'.repeat(190000))}).artist({as_written:'A',search_name:'A'});assert.equal(tooLarge.status,'incomplete');
});
test('two-stage model workflow records exact model/tier/tokens and refuses a silent model switch',async()=>{
 const store=memoryStore(),requests=[],results=[understanding,output];
 const fetchImpl=async(url,options={})=>{requests.push({url,options});if(url.includes('/models/'))return Response.json({id:p.MODEL});const value=results.shift();return Response.json({id:'resp-'+requests.length,model:p.MODEL,service_tier:'default',status:'completed',usage:{input_tokens:100,output_tokens:200,input_tokens_details:{cached_tokens:10}},output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});};
 const lab=createLab({store,key:'fixture-only',privacyKey:'private',fetchImpl}),result=await lab.run(p.request({brief:'Original thanksgiving with talking drum and guitar.'}),crypto.randomUUID());
 assert.equal(result.status,'ready');assert.equal(result.usage.length,2);assert(result.audio_ready);assert.equal(requests.filter(r=>r.options.method==='POST').length,2);assert(requests.every(r=>r.url.startsWith('https://api.openai.com/')));
 for(const r of requests.filter(r=>r.options.body)){const body=JSON.parse(r.options.body);assert.equal(body.model,p.MODEL);assert.equal(body.store,false);assert.equal(body.service_tier,'default');assert(!body.tools);}
 assert.equal(store.calls.filter(c=>c.state==='recorded').length,2);assert(Math.abs(cost({input_tokens:1000,output_tokens:1000})-.012)<1e-12);assert(ceiling(p.interpretation(p.request({brief:'an original Gospel thanksgiving song'})))>.024);
 const wrong=createLab({store:memoryStore(),key:'fixture',privacyKey:'private',fetchImpl:async()=>Response.json({id:'other-model'})});await assert.rejects(wrong.verifyModel(),/No fallback/);
});
test('zero budget, provider failures and ambiguous research do not trigger paid retries or customer-credit operations',async()=>{
 let posts=0;const zero=memoryStore(0),f=async(url)=>{if(url.includes('/models/'))return Response.json({id:p.MODEL});posts++;return new Response('bad',{status:500});};
 await assert.rejects(createLab({store:zero,key:'f',privacyKey:'p',fetchImpl:f}).run(p.request({brief:'A Gospel song with no paid test authorization'}),crypto.randomUUID()),/budget is zero/);assert.equal(posts,0);
 const store=memoryStore();await assert.rejects(createLab({store,key:'f',privacyKey:'p',fetchImpl:f}).run(p.request({brief:'A Gospel song with a failed provider response'}),crypto.randomUUID()),/not retried/);assert.equal(posts,1);assert.equal(store.calls[0].state,'uncertain');
 const u=clone(understanding);u.artists=[{as_written:'Chris',search_name:'Chris'}];let n=0;
 const ambiguous=createLab({store:memoryStore(),key:'f',privacyKey:'p',research:{artist:async()=>({as_written:'Chris',status:'unresolved',requests:[]})},fetchImpl:async url=>url.includes('/models/')?Response.json({id:p.MODEL}):(n++,Response.json({id:'resp',model:p.MODEL,service_tier:'default',status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify(u)}]}]}))});
 const result=await ambiguous.run(p.request({brief:'A song with Chris and a Gospel message'}),crypto.randomUUID());assert.equal(result.status,'clarify');assert.equal(n,1);assert(!result.lyrics);
});
test('lab refuses production settings, model substitutions and production database addresses',()=>{
 const env={STUDIO_LAB_ENVIRONMENT:'description-lab-v1',NODE_ENV:'staging',ADMIN_KEY:'fixture-admin-key-123456789'};assert(configuration(env));assert.throws(()=>configuration({...env,NODE_ENV:'production'}));assert.throws(()=>configuration({...env,OPENAI_LYRICS_MODEL:'gpt-6-astra'}));
 assert.throws(()=>databaseUrl({STUDIO_LAB_DATABASE_URL:'postgresql://neondb_owner:x@live.neon.tech/neondb'}));
 assert(databaseUrl({STUDIO_LAB_DATABASE_URL:'postgres://x:y@127.0.0.1/lae_music_ci',LAE_DB_TESTS:'true'}));
 assert.throws(()=>databaseUrl({STUDIO_LAB_DATABASE_URL:'postgres://x:y@127.0.0.1/lae_music_ci?options=unsafe',LAE_DB_TESTS:'true'}));
});
test('owner-only HTTP boundary, origin/CSRF checks, public routes absent and idempotent job recovery',async()=>{
 const env={STUDIO_LAB_ENVIRONMENT:'description-lab-v1',NODE_ENV:'staging',ADMIN_KEY:'fixture-admin-key-123456789'},store=memoryStore();let runs=0;
 const lab={hash:s=>crypto.createHash('sha256').update(s).digest('hex'),run:async()=>{runs++;return {...clone(output),audio_ready:true};}};
 const auth={resolve:async req=>req.headers.cookie==='owner'?{id:'owner',role:'owner',session_hash:'session'}:req.headers.cookie==='artist'?{id:'artist',role:'content',session_hash:'session'}:null};
 const server=await createServer({env,store,lab,auth});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{assert.equal((await fetch(origin+'/api/lab/usage')).status,401);assert.equal((await fetch(origin+'/api/lab/usage',{headers:{Cookie:'artist'}})).status,401);assert.equal((await fetch(origin+'/api/music/sonic/create')).status,404);assert((await (await fetch(origin+'/')).text()).includes('Studio test access'));
 const headers={Cookie:'owner',Origin:origin,'Content-Type':'application/json','X-CSRF-Token':lab.hash('csrf:session')},input={brief:'Original thanksgiving with a patient guitar groove',request_key:crypto.randomUUID()};
 assert.equal((await fetch(origin+'/api/lab/generate',{method:'POST',headers:{...headers,Origin:'https://outside.invalid'},body:JSON.stringify(input)})).status,403);
 const first=await(await fetch(origin+'/api/lab/generate',{method:'POST',headers,body:JSON.stringify(input)})).json(),second=await(await fetch(origin+'/api/lab/generate',{method:'POST',headers,body:JSON.stringify(input)})).json();assert.equal(first.id,second.id);assert.equal(runs,1);
 const result=await(await fetch(origin+'/api/lab/jobs/'+first.id,{headers:{Cookie:'owner'}})).json();assert.equal(result.status,'complete');
 const handoff=await(await fetch(origin+'/api/lab/handoff',{method:'POST',headers,body:JSON.stringify({...output,run_id:first.id})})).json();assert.equal(handoff.audio_requested,false);assert.equal(handoff.customer_credits_used,0);assert.equal(handoff.provider_payload.prompt,output.lyrics);
 }finally{await new Promise(r=>server.close(r));}
});
test('preview provisioning can mutate only a new free $0 lab; live/review and databases are unchanged',async()=>{
 const {provision}=require('../scripts/provision-studio-lab.cjs'),writes=[],candidate='a'.repeat(40),live='srv-db84s7m89jmc73c7l9rg',review='srv-dbfmk5ss728c73ded300';let service=null;
 const mk=(id,name)=>({id,name,ownerId:'tea-fixture',repo:'https://github.com/alyeros47-dev/LAE-MUSIC',branch:id===live?'main':'codex/premium-platform-release',serviceDetails:{url:'https://fixture.onrender.com'}}),deployment={deploy:{status:'live',commit:{id:candidate}}};
 const fetchImpl=async(url,options={})=>{
  const u=new URL(url),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;if(method!=='GET')writes.push({url,body,method});
  if(u.hostname==='fixture-studio-lab.onrender.com')return Response.json({studio_lab:true,model:'gpt-6.1-sol',source_commit:candidate,customer_credit_operations:false,audio_generation_enabled:false});
  assert.equal(u.hostname,'api.render.com');
  if(u.pathname.endsWith('/services/'+live))return Response.json(mk(live,'LAE-MUSIC'));
  if(u.pathname.endsWith('/services/'+review))return Response.json(mk(review,'lae-music-review-sandbox'));
  if(u.pathname.endsWith('/services/'+review+'/env-vars'))return Response.json([{envVar:{key:'ADMIN_KEY',value:'fixture-admin-key-long-enough'}},{envVar:{key:'OPENAI_API_KEY',value:'fixture-provider-key'}}]);
  if(u.pathname.endsWith('/services')&&method==='GET')return Response.json([]);
  if(u.pathname.endsWith('/services')&&method==='POST'){service={...mk('srv-lab-only',body.name),branch:body.branch,serviceDetails:{...body.serviceDetails,url:'https://fixture-studio-lab.onrender.com'}};return Response.json({service});}
  if(u.pathname.endsWith('/services/srv-lab-only'))return Response.json(service);
  if(u.pathname.endsWith('/deploys'))return Response.json([deployment]);
  throw Error('Unexpected Render API path');
 };
 const result=await provision({env:{RENDER_API_KEY:'fixture',NEON_API_KEY:'fixture',LAB_COMMIT:candidate},fetchImpl,wait:async()=>{},log:()=>{}});assert.equal(result.url,'https://fixture-studio-lab.onrender.com/studio-lab');assert.equal(result.production_writes,0);
 assert(!writes.some(w=>w.url.includes(live)||w.url.includes(review)));assert(!writes.some(w=>w.url.includes('neon.tech')));const payload=writes.find(w=>w.url.endsWith('/services')).body;assert.equal(payload.serviceDetails.plan,'free');assert.equal(payload.autoDeployTrigger,'off');assert(!payload.envVars.some(v=>/R2|MUSICAPI|DATABASE_URL/.test(v.key)&&v.key!=='STUDIO_LAB_DATABASE_URL'));assert.equal(payload.envVars.find(v=>v.key==='STUDIO_LAB_BUDGET_USD').value,'0');
});

test('stateless preview can never spend; enabling a paid budget requires separate durable storage',async()=>{
 const {zeroBudgetStore}=require('../lib/studio-lab-store'),zero=zeroBudgetStore();assert.equal((await zero.status()).cap_usd,0);await assert.rejects(zero.reserve(),e=>e.status===402);
 await assert.rejects(createServer({env:{STUDIO_LAB_ENVIRONMENT:'description-lab-v1',NODE_ENV:'staging',ADMIN_KEY:'fixture-admin-key-123456789',STUDIO_LAB_BUDGET_USD:'1'}}),/separate lab usage database/);
 const u=clone(understanding);u.artists=[{as_written:'Invented artist',search_name:'Invented artist'}];assert.throws(()=>p.validateInterpretation(u,{brief:'No musician reference here',answer:''}),/No external research query/);
});

test('deployment comparison permits Render metadata refresh but rejects a real release/state change',()=>{
 const {deploymentIdentity}=require('../scripts/provision-studio-lab.cjs'),d={id:'dep-live',commit:{id:'tested-live-sha'},status:'live',updatedAt:'before'};assert.equal(deploymentIdentity([{deploy:d}]),deploymentIdentity([{deploy:{...d,updatedAt:'after'}}]));assert.notEqual(deploymentIdentity([{deploy:d}]),deploymentIdentity([{deploy:{...d,id:'dep-new',commit:{id:'new-sha'}}}]));assert.notEqual(deploymentIdentity([{deploy:d}]),deploymentIdentity([{deploy:{...d,status:'deactivated'}}]));
});
