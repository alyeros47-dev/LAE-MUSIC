'use strict';
// Callback/webhook delivery can be interrupted. Reuse normal server-side
// verification for outstanding Premium attempts; never initiate a payment.
const CANDIDATES=`SELECT a.id,o.listener_id FROM premium_attempts a
 JOIN premium_orders o ON o.id=a.order_id
 LEFT JOIN LATERAL (SELECT MAX(created_at) AS checked_at FROM platform_requests
   WHERE scope='premium-lookup:'||a.id::text) lookup ON TRUE
 WHERE a.provider='monnify' AND a.mode='live' AND a.status='ready' AND NOT a.benefit_hold
 AND a.created_at>NOW()-INTERVAL '48 hours'
 AND (lookup.checked_at IS NULL OR lookup.checked_at<NOW()-INTERVAL '60 seconds')
 AND NOT EXISTS(SELECT 1 FROM premium_receipts r WHERE r.order_id=o.id)
 ORDER BY lookup.checked_at NULLS FIRST,a.created_at DESC LIMIT 5`;
// A pending attempt in its lookup cooldown is still real work. In particular,
// waking after a customer's manual check must not postpone the next minute retry.
const PENDING=`SELECT EXISTS(SELECT 1 FROM premium_attempts a
 JOIN premium_orders o ON o.id=a.order_id
 WHERE a.provider='monnify' AND a.mode='live' AND a.status='ready' AND NOT a.benefit_hold
 AND a.created_at>NOW()-INTERVAL '48 hours'
 AND NOT EXISTS(SELECT 1 FROM premium_receipts r WHERE r.order_id=o.id)) AS pending`;
function create({pool,verify,enabled=()=>false,setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now,onError=()=>{}}={}){
 let running=false;
 async function runOnce(){
  if(running||!pool||!enabled())return {checked:0,confirmed:0};
  running=true;const result={checked:0,confirmed:0};
  try{
   const rows=(await pool.query(CANDIDATES)).rows;
   for(const attempt of rows){
    result.checked++;
    try{await verify(attempt.listener_id,attempt.id);result.confirmed++;}
    catch(error){if(![400,409,429].includes(error.status))onError();}
   }
   return result;
  }finally{running=false;}
 }
 const worker=require('../background-job').createBackgroundJob({run:async()=>{const r=await runOnce();if(r.checked>0)return true;if(!pool||!enabled())return false;return (await pool.query(PENDING)).rows[0]?.pending===true;},activeMs:60000,setTimer,clearTimer,now,onError});
 function start(){if(pool&&enabled())worker.start();}
 return {runOnce,start,stop:worker.stop,wake:worker.wake};
}
module.exports={create,CANDIDATES,PENDING};
