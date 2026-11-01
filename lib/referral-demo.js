'use strict';
// Deliberately separate from all payment providers, artist identities, credits,
// subscriptions, finance transfers and production commission ledgers.
const crypto=require('node:crypto'),{fail,transaction,requestKey}=require('./transactions');
const {quote}=require('./partner-practice'),{percentage}=require('./premium-policy'),policy=require('./partner-policy');
const PREFIX='/api/platform/referral-demo',COOKIE='lae_referral_demo',UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const disclosure='DEMO ONLY. No money is charged or received. Demo profiles are not real LAE-MUSIC accounts. Demo payments never unlock artist tools, studio credits, Premium benefits, real commissions or withdrawals.';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function input(data,keys){if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!keys.includes(k)))throw fail(400,'Only the displayed demo selections may be submitted.');return data;}
function confirm(data){if(data.confirm_demo!==true)throw fail(400,'Confirm that this is a demo with no real payment or artist access.');}
function sessionHash(req){const token=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);return /^[a-f0-9]{64}$/.test(token||'')?hash(token):null;}
function cookie(token){return COOKIE+'='+token+'; HttpOnly; Secure; SameSite=Lax; Path='+PREFIX+'; Max-Age=2592000';}
function id(value){if(!UUID.test(value||''))throw fail(400,'Choose a valid demo receipt.');return value;}
function allocations(order,parent,date){const result=[],recipient=parent?{flow:parent.id}:order.owner_id?{artist:order.owner_id}:null;
 if(recipient)result.push({kind:'direct',...recipient,percent:order.direct_percent,amount_minor:percentage(Number(order.base_minor),order.direct_percent),period:policy.periodForSale(date)});
 const leader=parent?.parent_id?{flow:parent.parent_id}:parent&&order.owner_id?{artist:order.owner_id}:null;
 if(leader)result.push({kind:'team',...leader,percent:10,amount_minor:percentage(Number(order.base_minor),10),period:policy.periodForSale(date)});
 return result;
}
function publicFlow(row){return {id:row.id,reference:'DEMO-'+row.id,plan:row.plan,base_minor:Number(row.base_minor),currency:'USD',status:row.status,display_name:row.display_name,public_ref:row.profile_at?row.public_ref:null,profile_at:row.profile_at,owner_id:row.owner_id,created_at:row.created_at,expires_at:row.expires_at,demo:true,actual_payment_minor:0,actual_withdrawable_minor:0,artist_access:false};}
function create({pool,now=()=>new Date()}={}){
 async function context(db,data){input(data,['plan','ref','demo_ref']);const q=quote(String(data.plan||''));let owner=null,parent=null;
  if(data.ref!==undefined&&data.ref!==null&&data.ref!==''){if(!/^[1-9][0-9]{0,15}$/.test(String(data.ref))||!Number.isSafeInteger(Number(data.ref)))throw fail(400,'This partner referral is invalid.');owner=(await db.query('SELECT id,display_name FROM creators WHERE id=$1',[String(data.ref)])).rows[0];if(!owner)throw fail(404,'This referring partner was not found.');}
  if(data.demo_ref!==undefined&&data.demo_ref!==null&&data.demo_ref!==''){id(data.demo_ref);parent=(await db.query('SELECT * FROM referral_demo_flows WHERE public_ref=$1 AND profile_at IS NOT NULL AND expires_at>NOW()',[data.demo_ref])).rows[0];if(!parent)throw fail(404,'This demo referral has expired or was not found.');if(data.ref&&String(parent.owner_id)!==String(owner.id))throw fail(409,'This demo link belongs to a different referral chain.');if(parent.owner_id&&!owner)owner=(await db.query('SELECT id,display_name FROM creators WHERE id=$1',[parent.owner_id])).rows[0];if(parent.depth>=10)throw fail(409,'This demo chain has reached its ten-profile testing limit.');}
  return {quote:q,owner,parent,demo:true,disclosure,referrer:parent?.display_name||owner?.display_name||'No referring partner'};
 }
 async function validSession(db,token){if(!token)throw fail(401,'This demo needs its original browser session. Your real LAE-MUSIC login is separate.');const r=await db.query('SELECT token_hash FROM referral_demo_sessions WHERE token_hash=$1 AND expires_at>NOW()',[token]);if(!r.rowCount)throw fail(401,'This demo session expired. Open a referral link to start a new demo.');}
 async function owned(db,token,order,lock=false){await validSession(db,token);const r=await db.query('SELECT * FROM referral_demo_flows WHERE id=$1 AND session_hash=$2 AND expires_at>NOW()'+(lock?' FOR UPDATE':''),[id(order),token]);if(!r.rowCount)throw fail(404,'Your demo receipt was not found.');return r.rows[0];}
 async function start(req,data,key){input(data,['plan','ref','demo_ref','confirm_demo']);confirm(data);requestKey(key);const token=crypto.randomBytes(32).toString('hex'),existing=sessionHash(req);let created=false;
  const row=await transaction(pool,async db=>{const c=await context(db,{plan:data.plan,ref:data.ref,demo_ref:data.demo_ref});let session=existing;
   if(session){const r=await db.query('SELECT token_hash FROM referral_demo_sessions WHERE token_hash=$1 AND expires_at>NOW() FOR UPDATE',[session]);if(!r.rowCount)session=null;}
   if(!session){session=hash(token);await db.query('INSERT INTO referral_demo_sessions(token_hash) VALUES($1)',[session]);created=true;}
   const old=(await db.query('SELECT * FROM referral_demo_flows WHERE session_hash=$1 AND request_key=$2',[session,key])).rows[0];
   if(old){if(old.plan!==c.quote.plan||String(old.owner_id||'')!==String(c.owner?.id||'')||String(old.parent_id||'')!==String(c.parent?.id||''))throw fail(409,'This demo request already belongs to another package or referral.');return old;}
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['referral-demo-limit:'+String(c.owner?.id||'unattributed')]);
   const count=(await db.query("SELECT COUNT(*) FILTER(WHERE session_hash=$1)::int AS own,COUNT(*)::int AS total FROM referral_demo_flows WHERE created_at>NOW()-INTERVAL '24 hours' AND (session_hash=$1 OR owner_id IS NOT DISTINCT FROM $2::bigint)",[session,c.owner?.id||null])).rows[0];
   if(count.own>=20||count.total>=200)throw fail(429,'The demo limit was reached. Keep your existing receipts and try again tomorrow.');
   return (await db.query('INSERT INTO referral_demo_flows(id,session_hash,request_key,owner_id,parent_id,depth,plan,base_minor,direct_percent,public_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[crypto.randomUUID(),session,key,c.owner?.id||null,c.parent?.id||null,(c.parent?.depth||0)+1,c.quote.plan,c.quote.base_minor,c.quote.percent,crypto.randomUUID()])).rows[0];
  });return {flow:publicFlow(row),...(created?{cookie:cookie(token)}:{}),demo:true,disclosure};
 }
 async function pay(req,order,data){input(data,['confirm_demo','outcome']);confirm(data);if(!['success','failed'].includes(data.outcome))throw fail(400,'Choose a demo payment outcome.');return transaction(pool,async db=>{const row=await owned(db,sessionHash(req),order,true),target=data.outcome==='success'?'paid_demo':'failed_demo';if(row.status===target)return publicFlow(row);if(row.status!=='pending_demo')throw fail(409,'This demo receipt is already settled. No duplicate allocation was created.');const date=now();
   const updated=(await db.query('UPDATE referral_demo_flows SET status=$2,paid_at=$3 WHERE id=$1 RETURNING *',[row.id,target,target==='paid_demo'?date:null])).rows[0];
   if(target==='paid_demo'){const parent=row.parent_id?(await db.query('SELECT id,parent_id FROM referral_demo_flows WHERE id=$1',[row.parent_id])).rows[0]:null;for(const a of allocations(row,parent,date))await db.query('INSERT INTO referral_demo_allocations(order_id,kind,recipient_artist_id,recipient_flow_id,percent,amount_minor,period) VALUES($1,$2,$3,$4,$5,$6,$7)',[row.id,a.kind,a.artist||null,a.flow||null,a.percent,a.amount_minor,a.period]);}
   return publicFlow(updated);
  });}
 async function profile(req,order,data){input(data,['confirm_demo','name']);confirm(data);if(typeof data.name!=='string')throw fail(400,'Use a demo name, without email addresses.');const name=data.name.trim();if(name.length<2||name.length>80||/[\x00-\x1f@]/.test(name))throw fail(400,'Use a demo name of 2–80 characters, without email addresses.');return transaction(pool,async db=>{const row=await owned(db,sessionHash(req),order,true);if(row.status!=='paid_demo')throw fail(409,'Complete a successful demo payment before demo profile setup.');if(row.profile_at){if(row.display_name!==name)throw fail(409,'This receipt already has a demo profile.');return publicFlow(row);}return publicFlow((await db.query('UPDATE referral_demo_flows SET display_name=$2,profile_at=NOW() WHERE id=$1 RETURNING *',[row.id,name])).rows[0]);});}
 async function refund(req,order,data){input(data,['confirm_demo']);confirm(data);return transaction(pool,async db=>{const row=await owned(db,sessionHash(req),order,true);if(row.status==='refunded_demo')return publicFlow(row);if(row.status!=='paid_demo')throw fail(409,'Only a successful demo purchase can simulate a refund.');await db.query("UPDATE referral_demo_allocations SET state='reversed' WHERE order_id=$1",[row.id]);return publicFlow((await db.query("UPDATE referral_demo_flows SET status='refunded_demo' WHERE id=$1 RETURNING *",[row.id])).rows[0]);});}
 async function report(db,{owner,flow}){const r=await db.query('SELECT a.kind,a.percent,a.amount_minor,a.period,a.state,f.id AS order_id,f.plan,f.status,f.display_name,f.created_at FROM referral_demo_allocations a JOIN referral_demo_flows f ON f.id=a.order_id WHERE '+(owner?'a.recipient_artist_id=$1':'a.recipient_flow_id=$1')+' ORDER BY a.created_at DESC LIMIT 201',[owner||flow]);if(r.rows.length>200)throw fail(409,'This demo report needs a larger reviewed export. No partial total is shown.');const totals={direct_minor:0,team_minor:0};for(const row of r.rows)if(row.state==='example')totals[row.kind+'_minor']+=Number(row.amount_minor);return {demo:true,disclosure,currency:'USD',totals,rows:r.rows,actual_withdrawable_minor:0};}
 async function state(req,order){const row=await owned(pool,sessionHash(req),order);const received=row.profile_at?await report(pool,{flow:row.id}):null;return {demo:true,disclosure,flow:publicFlow(row),received};}
 async function profiles(req){const token=sessionHash(req);await validSession(pool,token);const r=await pool.query('SELECT * FROM referral_demo_flows WHERE session_hash=$1 AND profile_at IS NOT NULL ORDER BY created_at DESC LIMIT 100',[token]);return {demo:true,disclosure,profiles:r.rows.map(publicFlow)};}
 async function handle(req,res,url,{body,json,me}){if(!url.pathname.startsWith(PREFIX))return false;res.setHeader('Cache-Control','no-store');if(!pool)throw fail(503,'The persistent demo database is unavailable.');const suffix=url.pathname.slice(PREFIX.length);
  if(suffix==='/context'&&req.method==='GET'){const c=await context(pool,{plan:url.searchParams.get('plan'),ref:url.searchParams.get('ref'),demo_ref:url.searchParams.get('demo_ref')});json(res,200,{demo:true,disclosure,quote:c.quote,referrer:c.referrer});return true;}
  if(suffix==='/start'&&req.method==='POST'){const result=await start(req,await body(req,2000),req.headers['idempotency-key']);if(result.cookie)res.setHeader('Set-Cookie',result.cookie);const {cookie:unused,...output}=result;json(res,201,output);return true;}
  if(suffix==='/profiles'&&req.method==='GET'){json(res,200,await profiles(req));return true;}
  if(suffix==='/mine'&&req.method==='GET'){const u=await me(req);if(!u)throw fail(401,'Sign in to your free partner account to view your demo referrals.');json(res,200,await report(pool,{owner:u.id}));return true;}
  const match=suffix.match(/^\/orders\/([a-f0-9-]+)(?:\/(payment|profile|refund))?$/);
  if(match){if(!match[2]&&req.method==='GET')json(res,200,await state(req,match[1]));else if(match[2]&&req.method==='POST'){const data=await body(req,2000),fn={payment:pay,profile,refund}[match[2]];json(res,200,{demo:true,disclosure,flow:await fn(req,match[1],data)});}else json(res,405,{error:'Method not allowed'});return true;}
  json(res,404,{error:'Demo endpoint not found'});return true;
 }
 return {handle,context,start,pay,profile,refund,state,profiles,report};
}
module.exports={create,allocations,publicFlow,sessionHash,PREFIX,disclosure};
