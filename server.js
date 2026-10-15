'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {Pool}=require('pg');
const PORT=process.env.PORT||3000;
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('localhost')?false:{rejectUnauthorized:false}}):null;
const PLANS={starter:{usd:2,royalty:40},growth:{usd:5,royalty:50},professional:{usd:10,royalty:60}};
let exchangeCache={updated:0,rates:null,asOf:null};
async function exchangeRates(){
 if(exchangeCache.rates && Date.now()-exchangeCache.updated<12*60*60*1000)return exchangeCache;
 try {const response=await fetch('https://open.er-api.com/v6/latest/USD',{signal:AbortSignal.timeout(7000)});
 if(!response.ok)throw Error('Rate service unavailable');const data=await response.json();
 if(data.result!=='success'||!data.rates||data.rates.USD!==1)throw Error('Invalid rates');
 exchangeCache={updated:Date.now(),rates:data.rates,asOf:data.time_last_update_utc||null};return exchangeCache;
 }catch(error){console.warn('Exchange rate refresh failed:',error.message);return exchangeCache;}
}

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
const staticFiles={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/tracks.json':'tracks.json'};
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const hashPassword=(password,salt)=>crypto.scryptSync(password,salt,64).toString('hex');
const tokenHash=token=>crypto.createHash('sha256').update(token).digest('hex');
function readBody(req){return new Promise((resolve,reject)=>{let s='';req.on('data',chunk=>{s+=chunk;if(s.length>16000){reject(Error('Request too large'));req.destroy();}});req.on('end',()=>{try{resolve(JSON.parse(s||'{}'));}catch{reject(Error('Invalid JSON'));}});req.on('error',reject);});}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2));}
function setSession(res,token){res.setHeader('Set-Cookie',`lae_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`);}
function clearSession(res){res.setHeader('Set-Cookie','lae_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');}
async function currentUser(req){const token=cookies(req).lae_session;if(!pool||!token||!(/^[a-f0-9]{64}$/).test(token))return null;const r=await pool.query(`SELECT u.id,u.display_name,u.email,u.plan,u.membership_status,u.created_at FROM sessions s JOIN creators u ON u.id=s.creator_id WHERE s.token_hash=$1 AND s.expires_at>NOW()`,[tokenHash(token)]);return r.rows[0]||null;}
async function init(){if(!pool){console.log('DATABASE_URL missing: public demo works, creator registration disabled');return;}await pool.query(`CREATE TABLE IF NOT EXISTS creators (id BIGSERIAL PRIMARY KEY,display_name VARCHAR(100) NOT NULL,email VARCHAR(254) NOT NULL UNIQUE,password_salt VARCHAR(64) NOT NULL,password_hash VARCHAR(128) NOT NULL,plan VARCHAR(24) NOT NULL DEFAULT 'starter',membership_status VARCHAR(24) NOT NULL DEFAULT 'pending_payment',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE TABLE IF NOT EXISTS sessions (token_hash VARCHAR(64) PRIMARY KEY,creator_id BIGINT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL); CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);`);console.log('Creator database initialized');}
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost');const pathname=u.pathname;
 if(pathname==='/health')return json(res,200,{ok:true,stage:4,database:!!pool});
 if(pathname==='/api/plans'&&req.method==='GET')return json(res,200,{baseCurrency:'USD',billing:'annual',plans:PLANS,paymentEnabled:false,exchangeRatesEnabled:true});
 if(pathname==='/api/exchange-rates'&&req.method==='GET'){const rates=await exchangeRates();return json(res,rates.rates?200:503,{base:'USD',rates:rates.rates,asOf:rates.asOf,stale:!!rates.rates&&Date.now()-rates.updated>12*60*60*1000,disclaimer:'Indicative rates only. Checkout currency, provider fees and final amount may differ. No payments enabled.'});}
 if(pathname==='/api/status'&&req.method==='GET')return json(res,200,{databaseConfigured:!!pool,registrationEnabled:!!pool,paymentEnabled:false});
 if(pathname.startsWith('/api/')){
   if(!pool)return json(res,503,{error:'Creator accounts are not yet available. Configure DATABASE_URL on Render.'});
   if(req.method==='POST'){
     const origin=req.headers.origin;const host=req.headers.host;
     if(origin&&new URL(origin).host!==host)return json(res,403,{error:'Invalid request origin'});
     if(!['application/json'].some(t=>(req.headers['content-type']||'').startsWith(t)))return json(res,415,{error:'JSON required'});
   }
   if(pathname==='/api/register'&&req.method==='POST'){
     const b=await readBody(req),name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||''),plan=String(b.plan||'starter');
     if(name.length<2||name.length>100||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||password.length<10||password.length>128||!PLANS[plan])return json(res,400,{error:'Enter a valid name, email, plan, and password of at least 10 characters.'});
     const salt=crypto.randomBytes(16).toString('hex'),hash=hashPassword(password,salt);
     try{const r=await pool.query('INSERT INTO creators(display_name,email,password_salt,password_hash,plan) VALUES($1,$2,$3,$4,$5) RETURNING id,display_name,email,plan,membership_status,created_at',[name,email,salt,hash,plan]);const token=crypto.randomBytes(32).toString('hex');await pool.query("INSERT INTO sessions(token_hash,creator_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')",[tokenHash(token),r.rows[0].id]);setSession(res,token);return json(res,201,{user:r.rows[0],notice:'Account created. Membership is pending payment; uploads and royalties are not active.'});}
     catch(e){if(e.code==='23505')return json(res,409,{error:'This email is already registered.'});throw e;}
   }
   if(pathname==='/api/login'&&req.method==='POST'){
     const b=await readBody(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');
     const r=await pool.query('SELECT * FROM creators WHERE email=$1',[email]);const user=r.rows[0];const salt=user?.password_salt||'00000000000000000000000000000000';const expected=Buffer.from(user?.password_hash||'0'.repeat(128),'hex');const actual=Buffer.from(hashPassword(password,salt),'hex');if(!user||!crypto.timingSafeEqual(expected,actual))return json(res,401,{error:'Incorrect email or password.'});
     const token=crypto.randomBytes(32).toString('hex');await pool.query("INSERT INTO sessions(token_hash,creator_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')",[tokenHash(token),user.id]);setSession(res,token);return json(res,200,{user:{id:user.id,display_name:user.display_name,email:user.email,plan:user.plan,membership_status:user.membership_status}});
   }
   if(pathname==='/api/me'&&req.method==='GET'){const user=await currentUser(req);return user?json(res,200,{user}):json(res,401,{error:'Not signed in.'});}
   if(pathname==='/api/logout'&&req.method==='POST'){const token=cookies(req).lae_session;if(token)await pool.query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(token)]);clearSession(res);return json(res,200,{ok:true});}
   return json(res,404,{error:'Unknown endpoint'});
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
 const file=staticFiles[pathname];if(!file){res.writeHead(404);return res.end('Not found');}
 fs.readFile(path.join(__dirname,'public',file),(err,data)=>{if(err){res.writeHead(500);return res.end('Server error');}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);});
 }catch(e){console.error('Request error:',e.message);if(!res.headersSent)json(res,500,{error:'Something went wrong. Please try again.'});}});
init().then(()=>server.listen(PORT,'0.0.0.0',()=>console.log('LAE Music Stage 3 on '+PORT))).catch(e=>{console.error('Database initialization failed:',e.message);process.exit(1)});
