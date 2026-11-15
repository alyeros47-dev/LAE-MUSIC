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
function create({pool,verify,enabled=()=>false,setTimer=setInterval,clearTimer=clearInterval,onError=()=>{}}={}){
 let timer=null,running=false;
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
 function start(){if(timer||!pool||!enabled())return;timer=setTimer(()=>{void runOnce().catch(onError);},60000);timer.unref?.();}
 function stop(){if(timer)clearTimer(timer);timer=null;}
 return {runOnce,start,stop};
}
module.exports={create,CANDIDATES};
