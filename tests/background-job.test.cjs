'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createBackgroundJob,IDLE_MS}=require('../lib/background-job');
function clock(){
 let time=0,id=0;const tasks=new Map();
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 return {now:()=>time,setTimer(fn,ms){const token={id:++id,unref(){}};tasks.set(token,{at:time+ms,fn});return token;},clearTimer(token){tasks.delete(token);},
  async advance(ms){const end=time+ms;let passes=0;for(;;){const next=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;assert(++passes<10000,'unexpected busy loop');time=next[1].at;tasks.delete(next[0]);next[1].fn();await flush();}time=end;await flush();},
  next:()=>Math.min(...[...tasks.values()].map(t=>t.at))-time,size:()=>tasks.size,flush};
}
test('an empty queue checks only five times in an hour rather than every second',async()=>{
 const c=clock();let calls=0;const worker=createBackgroundJob({...c,activeMs:1000,run:async()=>{calls++;return false;}});
 worker.start();worker.start();await c.advance(60*60*1000);assert.equal(calls,5);assert.equal(c.size(),1);worker.stop();assert.equal(c.size(),0);
});
test('a newly queued item wakes immediately and a backlog keeps its original drain interval',async()=>{
 const c=clock(),queue=[];let calls=0;const sent=[];
 const worker=createBackgroundJob({...c,activeMs:1000,run:async()=>{calls++;if(!queue.length)return false;sent.push(queue.shift());return true;}});
 worker.start();await c.advance(0);assert.equal(c.next(),IDLE_MS);
 await c.advance(1234);queue.push('first','second');worker.wake();await c.advance(0);assert.deepEqual(sent,['first']);assert.equal(c.next(),1000);
 await c.advance(1000);assert.deepEqual(sent,['first','second']);await c.advance(1000);assert(c.next()>5*60*1000);assert.equal(calls,4);worker.stop();
});
test('wake during an in-flight claim is retained without overlapping jobs; stopping cancels retries',async()=>{
 const c=clock();let release,calls=0,active=0,maximum=0;
 const worker=createBackgroundJob({...c,activeMs:4000,run:async()=>{calls++;active++;maximum=Math.max(maximum,active);if(calls===1)await new Promise(r=>release=r);active--;return false;}});
 worker.start();await c.advance(0);worker.wake();worker.wake();await c.advance(10);assert.equal(calls,1);release();await c.flush();await c.advance(0);assert.equal(calls,2);assert.equal(maximum,1);
 worker.stop();await c.advance(IDLE_MS*2);assert.equal(calls,2);worker.wake();assert.equal(c.size(),0);
});
test('transient failures back off and a recovered empty queue returns to idle cadence',async()=>{
 const c=clock();let calls=0,errors=0;const worker=createBackgroundJob({...c,activeMs:1000,run:async()=>{if(++calls<=2)throw Error('temporary');return false;},onError:()=>errors++});
 worker.start();await c.advance(0);assert.equal(c.next(),60000);await c.advance(60000);assert.equal(c.next(),120000);await c.advance(120000);assert.equal(c.next(),IDLE_MS-180000);assert.equal(errors,2);worker.stop();
});
test('pending payment verification keeps minute retries and never initiates a payment',async()=>{
 const c=clock();let candidate=false,queries=0,verifications=0;
 const worker=require('../lib/payments/monnify-reconciliation').create({pool:{query:async()=>{queries++;return {rows:candidate?[{id:'attempt',listener_id:7}]:[]};}},enabled:()=>true,
  verify:async(id,attempt)=>{assert.equal(id,7);assert.equal(attempt,'attempt');verifications++;throw Object.assign(Error('pending'),{status:409});},setTimer:c.setTimer,clearTimer:c.clearTimer,now:c.now});
 worker.start();await c.advance(0);assert.equal(queries,1);assert(c.next()>60000);
 candidate=true;worker.wake();await c.advance(0);assert.equal(verifications,1);assert.equal(c.next(),60000);await c.advance(60000);assert.equal(verifications,2);worker.stop();
});
