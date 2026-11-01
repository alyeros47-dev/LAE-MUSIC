'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {createAdminAuth}=require('../lib/admin-auth');
const prompts=require('../lib/studio-lab-prompts');
const {createLab}=require('../lib/studio-lab');
const {databaseUrl,createStore,zeroBudgetStore}=require('../lib/studio-lab-store');
const {createResearch}=require('../lib/studio-lab-research');
function configuration(env){
 if(env.STUDIO_LAB_ENVIRONMENT!=='description-lab-v1'||env.NODE_ENV==='production'||(env.ADMIN_KEY||'').length<16)throw Error('This entrypoint requires an isolated, administrator-only studio lab.');
 if(env.OPENAI_LYRICS_MODEL&&env.OPENAI_LYRICS_MODEL!==prompts.MODEL)throw Error('The lab requires gpt-6.1-sol; no model substitution is allowed.');
 const cap=Number(env.STUDIO_LAB_BUDGET_USD||0);if(!Number.isFinite(cap)||cap<0||cap>3)throw Error('Invalid approved text-test budget.');
 const current=new URL(env.STUDIO_LAB_CURRENT_STUDIO||'https://lae-music.com/studio');if(current.protocol!=='https:'||!['lae-music.com','lae-music.onrender.com','lae-music-review-sandbox.onrender.com'].includes(current.hostname))throw Error('Invalid existing-studio link.');
 return {cap,current:current.href};
}
async function createServer({env=process.env,store,lab,auth,research,now=Date.now}={}){
 const config=configuration(env);let pool;
 if(!store&&!env.STUDIO_LAB_DATABASE_URL&&config.cap===0)store=zeroBudgetStore();
 if(!store){databaseUrl(env);pool=new(require('pg').Pool)({connectionString:env.STUDIO_LAB_DATABASE_URL,max:3,ssl:env.STUDIO_LAB_DATABASE_HOST?{rejectUnauthorized:true}:undefined});store=createStore({pool,cap:config.cap});await store.init();}
 auth||=createAdminAuth({pool:null,env});lab||=createLab({store,key:env.OPENAI_API_KEY,privacyKey:env.ADMIN_KEY});
 const jobs=new Map(),loginRates=new Map(),researchTool=research||createResearch();let researchCount=0,researchUntil=now()+3600000;
 function json(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra});res.end(JSON.stringify(data));}
 async function body(req){const chunks=[];let n=0;for await(const chunk of req){n+=chunk.length;if(n>70000)throw prompts.fail('The request is too large; nothing was shortened.',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw prompts.fail('Send a valid JSON request.');}}
 const csrf=p=>lab.hash('csrf:'+p.session_hash);
 function sweep(){for(const [id,j]of jobs)if(j.until<now())jobs.delete(id);for(const [ip,rate]of loginRates)if(rate.until<now())loginRates.delete(ip);}
 async function asset(res,file){const allowed={'studio-lab.html':'text/html; charset=utf-8','studio-lab-login.html':'text/html; charset=utf-8','studio-lab.js':'text/javascript; charset=utf-8','studio-lab.css':'text/css; charset=utf-8'};res.writeHead(200,{'Content-Type':allowed[file],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Permissions-Policy':'camera=(), geolocation=()'});res.end(await fs.readFile(path.join(__dirname,'../web',file)));}
 const server=http.createServer(async(req,res)=>{try{
  sweep();const url=new URL(req.url,'http://studio-lab.invalid'),p=url.pathname;
  if(p==='/health'&&req.method==='GET')return json(res,200,{ok:true,studio_lab:true,model:prompts.MODEL,source_commit:env.RENDER_GIT_COMMIT||null,customer_credit_operations:false,audio_generation_enabled:false});
  if(req.method==='POST'){
   const origin=req.headers.origin,host=req.headers.host;if(!origin||!['http:','https:'].includes(new URL(origin).protocol)||new URL(origin).host!==host||req.headers['sec-fetch-site']==='cross-site')throw prompts.fail('Use this lab’s own page to submit requests.',403);
   if(!String(req.headers['content-type']).startsWith('application/json'))throw prompts.fail('Send JSON from the lab interface.',415);
  }
  if(p==='/api/lab/login'&&req.method==='POST'){
   const ip=req.socket.remoteAddress||'unknown',rate=loginRates.get(ip)||{n:0,until:now()+900000};if(loginRates.size>=2000&&!loginRates.has(ip))throw prompts.fail('Please retry sign-in later.',429);rate.n++;loginRates.set(ip,rate);if(rate.n>10)throw prompts.fail('Too many sign-in attempts. Wait 15 minutes.',429);
   const result=await auth.login(await body(req),req.headers['user-agent']);return json(res,200,{ok:true},{'Set-Cookie':result.cookie});
  }
  const principal=await auth.resolve(req),owner=principal?.role==='owner';
  if(p==='/api/lab/session'&&req.method==='GET')return json(res,200,{authenticated:owner,csrf:owner?csrf(principal):null,model:prompts.MODEL,current_studio:config.current,scope:'Gospel',audio_generation_enabled:false});
  if(p==='/studio-lab.css'||p==='/studio-lab.js')return asset(res,p.slice(1));
  if(['/','/studio-lab'].includes(p)&&req.method==='GET')return asset(res,owner?'studio-lab.html':'studio-lab-login.html');
  if(!p.startsWith('/api/lab/'))throw prompts.fail('This isolated test service contains only the studio lab.',404);
  if(!owner)throw prompts.fail('Sign in with the internal lab administrator key. Artist, listener and partner accounts have no access.',401);
  if(req.method==='POST'&&req.headers['x-csrf-token']!==csrf(principal))throw prompts.fail('Refresh the lab page before submitting.',403);
  if(p==='/api/lab/logout'&&req.method==='POST')return json(res,200,{ok:true},{'Set-Cookie':'lae_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
  if(p==='/api/lab/usage'&&req.method==='GET')return json(res,200,await store.status());
  if(p==='/api/lab/research'&&req.method==='POST'){
   if(now()>researchUntil){researchCount=0;researchUntil=now()+3600000;}if(researchCount>=20)throw prompts.fail('The free research check limit is 20 per hour.',429);
   const input=await body(req),name=input.artist;if(typeof name!=='string'||name.trim().length<2||name.length>80||/[\r\n]/.test(name))throw prompts.fail('Enter only an artist name, between 2 and 80 characters.');researchCount++;
   return json(res,200,await researchTool.artist({as_written:name,search_name:name}));
  }
  if(p==='/api/lab/generate'&&req.method==='POST'){
   const input=await body(req),key=input.request_key;if(!/^[a-f0-9-]{36}$/.test(key||''))throw prompts.fail('Refresh the form to create a valid request identifier.');
   const ownerId=lab.hash(principal.id),duplicate=[...jobs.values()].find(j=>j.owner===ownerId&&j.key===key);if(duplicate)return json(res,202,{id:duplicate.id,status:duplicate.status});
   if([...jobs.values()].some(j=>j.owner===ownerId&&j.status==='running'))throw prompts.fail('A text test is already running. Wait for its result.',409);
   if(jobs.size>=32)throw prompts.fail('The internal test queue is full. Please retry later.',429);
   const normalized=prompts.request(input),id=await store.begin(ownerId,lab.hash(ownerId+':'+key)),job={id,key,owner:ownerId,status:'running',until:now()+3600000};jobs.set(id,job);
   Promise.resolve().then(()=>lab.run(normalized,id)).then(result=>{job.status='complete';job.result=result;},e=>{job.status='failed';job.error=e.status?e.message:'The internal test could not finish. No automatic retry was made.';job.error_status=e.status||502;});
   return json(res,202,{id,status:'running'});
  }
  if(p.startsWith('/api/lab/jobs/')&&req.method==='GET'){
   const job=jobs.get(p.split('/').at(-1));if(!job||job.owner!==lab.hash(principal.id))throw prompts.fail('This temporary result is no longer available. Your editable browser draft may still be present. Do not resubmit to recover it.',404);
   return json(res,200,{id:job.id,status:job.status,result:job.result,error:job.error,error_status:job.error_status});
  }
  if(p==='/api/lab/handoff'&&req.method==='POST'){
   const input=await body(req),job=jobs.get(input.run_id);if(!job||job.owner!==lab.hash(principal.id)||job.status!=='complete'||job.result?.status!=='ready'||!job.result.audio_ready)throw prompts.fail('A completed, reviewed lab result without excessive similarity is required.',409);
   return json(res,200,{validation_only:true,audio_requested:false,customer_credits_used:0,provider_payload:prompts.handoff(input)});
  }
  throw prompts.fail('Unknown lab endpoint.',404);
 }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'The internal lab is unavailable. No automatic provider retry was made.'});else res.end();}});
 server.on('close',()=>pool?.end());return server;
}
module.exports={createServer,configuration};
if(require.main===module)createServer().then(server=>server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Isolated Gospel studio lab listening; production routes and audio execution are absent.'))).catch(()=>{console.error('Studio lab startup failed. Check isolated configuration and database availability; secret values are not logged.');process.exitCode=1;});
