'use strict';
// Empty queues share a quarter-hour fallback. Real queued work wakes its worker
// immediately and keeps the original short retry interval while work remains.
const IDLE_MS=15*60*1000;
function createBackgroundJob({run,activeMs,idleMs=IDLE_MS,onError=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now}){
 let started=false,timer=null,running=false,woken=false,failures=0;
 function schedule(ms){if(!started)return;if(timer!==null)clearTimer(timer);timer=setTimer(()=>{timer=null;void tick();},ms);timer?.unref?.();}
 async function tick(){
  if(!started)return;
  if(running){woken=true;return;}
  running=true;woken=false;let delay;
  try{const active=await run();failures=0;delay=active?activeMs:idleMs-((now()%idleMs+idleMs)%idleMs);}
  catch(error){failures++;delay=Math.min(idleMs,Math.max(activeMs,60000)*2**Math.min(failures-1,4));try{onError(error);}catch{}}
  finally{running=false;if(started)schedule(woken?0:delay);}
 }
 return {start(){if(started)return;started=true;schedule(0);},wake(){if(!started)return;if(running)woken=true;else schedule(0);},stop(){started=false;woken=false;if(timer!==null)clearTimer(timer);timer=null;}};
}
module.exports={createBackgroundJob,IDLE_MS};
