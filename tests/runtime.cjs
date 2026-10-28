'use strict';
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {Readable}=require('node:stream');const {createRequire}=require('node:module');
// Executes the actual server request callback without opening a network socket.
async function runtime({pool=null,env={},paymentService,accountService,adminService,premiumService,offlineService,offlineMedia}={}){
 const root=path.join(__dirname,'..'),load=createRequire(path.join(root,'server.js'));let handler,ready;
 const started=new Promise(resolve=>{ready=resolve;});
 const sandbox={require(name){if(name==='./lib/platform'&&(paymentService||accountService||adminService||premiumService||offlineService||offlineMedia))return {createPlatform:options=>load(name).createPlatform({...options,...(paymentService?{paymentService}:{}),...(accountService?{accountService}:{}),...(adminService?{adminService}:{}),...(premiumService?{premiumService}:{}),...(offlineService?{offlineService}:{}),...(offlineMedia?{offlineMedia}:{})})};if(name==='pg')return {Pool:class{constructor(){return pool;}}};if(name==='web-push')return {generateVAPIDKeys:()=>({publicKey:'test-public',privateKey:'test-private'}),setVapidDetails(){}};if(name==='node:http')return {createServer(fn){handler=fn;return {listen(_port,_host,callback){callback();ready();}};}};return load(name);},process:{env:{...env,...(pool?{DATABASE_URL:'postgres://127.0.0.1/test'}:{})},exit(code){throw Error('Startup failed: '+code);}},__dirname:root,console,Buffer,URL,URLSearchParams,fetch,AbortSignal,setTimeout,clearTimeout,setInterval,clearInterval};
 vm.runInNewContext(fs.readFileSync(path.join(root,'server.js'),'utf8'),sandbox,{filename:'server.js'});await started;
 return {async request(url,{method='GET',body,headers={},remoteAddress='test-address'}={}){
  const raw=body===undefined?'':typeof body==='string'?body:JSON.stringify(body),req=Readable.from([Buffer.from(raw)]);req.url=url;req.method=method;req.headers={host:'lae.test',...headers};req.socket={remoteAddress};
  const res={status:0,headers:{},headersSent:false,body:Buffer.alloc(0),setHeader(k,v){this.headers[k.toLowerCase()]=v;},getHeader(k){return this.headers[k.toLowerCase()];},writeHead(n,h={}){this.status=n;this.headersSent=true;for(const [k,v]of Object.entries(h))this.setHeader(k,v);},end(payload){this.body=Buffer.from(payload||'');}};
  await handler(req,res);return {...res,text:res.body.toString(),json:()=>JSON.parse(res.body.toString())};
 }};
}
class AccountPool{
 constructor(){this.users=[];this.listeners=[];this.sessions=new Map();this.listenerSessions=new Map();this.calls=[];}
 async connect(){return {query:this.query.bind(this),release(){}};}
 async query(sql,args=[]){this.calls.push({sql,args});const row=x=>({rowCount:1,rows:[x]}),none=()=>({rowCount:0,rows:[]});
  if(sql.startsWith('INSERT INTO creators(')||sql.startsWith('INSERT INTO listeners(')){const table=sql.startsWith('INSERT INTO creators')?this.users:this.listeners;if(table.some(u=>u.email===args[1]))throw Object.assign(Error('duplicate'),{code:'23505'});const u={id:table.length+1,display_name:args[0],email:args[1],password_salt:args[2],password_hash:args[3],plan:args[4]||'starter',membership_status:'pending_payment'};table.push(u);const result={...u};delete result.password_salt;delete result.password_hash;return row(result);}
  if(sql.startsWith('INSERT INTO sessions(')){this.sessions.set(args[0],args[1]);return none();}if(sql.startsWith('INSERT INTO listener_sessions(')){this.listenerSessions.set(args[0],args[1]);return none();}
  if(sql.startsWith('SELECT named_enabled FROM admin_auth_settings'))return row({named_enabled:false});
  if(sql.startsWith('INSERT INTO account_security_rates'))return row({attempts:1});
  if(sql.startsWith('SELECT * FROM creators WHERE id='))return this.users.find(u=>String(u.id)===String(args[0]))?row(this.users.find(u=>String(u.id)===String(args[0]))):none();
  if(sql.startsWith('SELECT * FROM listeners WHERE id='))return this.listeners.find(u=>String(u.id)===String(args[0]))?row(this.listeners.find(u=>String(u.id)===String(args[0]))):none();
  if(sql.startsWith('SELECT 1 FROM listener_sessions'))return this.listenerSessions.get(args[1])===args[0]?row({}):none();
  if(sql.startsWith('SELECT 1 FROM sessions'))return this.sessions.get(args[1])===args[0]?row({}):none();
  if(sql.startsWith('SELECT * FROM creators WHERE email='))return this.users.find(u=>u.email===args[0])?row(this.users.find(u=>u.email===args[0])):none();
  if(sql.startsWith('SELECT * FROM listeners WHERE email='))return this.listeners.find(u=>u.email===args[0])?row(this.listeners.find(u=>u.email===args[0])):none();
  if(sql.includes('FROM sessions s JOIN creators')){const u=this.users.find(u=>u.id===this.sessions.get(args[0]));return u?row({id:u.id,display_name:u.display_name,email:u.email,plan:u.plan,membership_status:u.membership_status}):none();}
  if(sql.includes('FROM listener_sessions s JOIN listeners')){const u=this.listeners.find(u=>u.id===this.listenerSessions.get(args[0]));return u?row({id:u.id,display_name:u.display_name,email:u.email,plan:u.plan,membership_status:u.membership_status}):none();}
  if(sql.startsWith('SELECT password_salt,password_hash FROM listeners')){const u=this.listeners.find(u=>u.id===args[0]);return u?row({password_salt:u.password_salt,password_hash:u.password_hash}):none();}
  if(sql.startsWith('UPDATE listeners SET password_salt=')){const u=this.listeners.find(u=>u.id===args[2]);u.password_salt=args[0];u.password_hash=args[1];return none();}
  if(sql.startsWith('DELETE FROM listener_sessions WHERE listener_id=')){for(const [key,id]of this.listenerSessions)if(id===args[0])this.listenerSessions.delete(key);return none();}
  if(sql.startsWith('DELETE FROM sessions WHERE token_hash=')){this.sessions.delete(args[0]);return none();}if(sql.startsWith('DELETE FROM listener_sessions WHERE token_hash=')){this.listenerSessions.delete(args[0]);return none();}
  if(sql.startsWith('SELECT public_key,private_key FROM push_config'))return row({public_key:'test-public',private_key:'test-private'});
  // Startup DDL/reference seeds and empty reports are accepted only in this account-flow fixture.
  // This adapter intentionally does not validate PostgreSQL schema or SQL execution semantics.
  return none();
 }
}
module.exports={runtime,AccountPool};
