'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{relay}=require('../lib/public-audio');
const bytes=Buffer.from('original-recording-bytes'),track={audio_bytes:bytes.length,audio_mime:'audio/mpeg'};
function io({method='GET',range,backpressure=false}={}){
 const req=new EventEmitter(),res=new EventEmitter(),chunks=[];Object.assign(req,{method,headers:range?{range}:{}});
 Object.assign(res,{writeHead(status,headers){this.status=status;this.headers=headers;},write(b){chunks.push(Buffer.from(b));if(backpressure)setImmediate(()=>res.emit('drain'));return !backpressure;},end(){this.ended=true;this.bytes=Buffer.concat(chunks);},destroy(error){this.failure=error;}});return {req,res};
}
test('published audio is relayed without encoding or buffering the whole server response; native ranges and HEAD work',async()=>{
 for(const options of [{},{backpressure:true},{method:'HEAD'},{range:'bytes=2-6'}]){
  const {req,res}=io(options),partial=!!options.range,data=partial?bytes.subarray(2,7):bytes;
  await relay(req,res,{url:'https://storage.fixture/original',track,fetcher:async(url,init)=>{assert.equal(url,'https://storage.fixture/original');assert.equal(init.headers['Accept-Encoding'],'identity');assert.equal(init.method,req.method);assert.equal(init.headers.Range,options.range);return new Response(options.method==='HEAD'?null:data,{status:partial?206:200,headers:{'Content-Type':'audio/mpeg','Content-Length':String(data.length),...(partial?{'Content-Range':`bytes 2-6/${bytes.length}`}:{})}});}});
  assert.equal(res.status,partial?206:200);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.failure,undefined);assert.deepEqual(res.bytes,options.method==='HEAD'?Buffer.alloc(0):data);assert.equal(req.listenerCount('aborted'),0);assert.equal(res.listenerCount('close'),0);
 }
});
test('bad formats, oversized declarations, changed lengths and invalid range metadata fail closed',async()=>{
 for(const fault of ['mime','size','length','range']){
  const {req,res}=io({range:fault==='range'?'bytes=2-6':undefined});
  await assert.rejects(relay(req,res,{url:'https://storage.fixture/original',track:fault==='size'?{...track,audio_bytes:31*1024*1024}:track,fetcher:async()=>new Response(bytes,{status:fault==='range'?206:200,headers:{'Content-Type':fault==='mime'?'text/html':'audio/mpeg','Content-Length':String(fault==='length'?bytes.length+1:bytes.length),...(fault==='range'?{'Content-Range':'bytes 2-6/999'}:{})}})}));assert.equal(res.ended,undefined);
 }
 const {req,res}=io({range:'bytes=0-2,5-8'});await assert.rejects(relay(req,res,{track,url:'https://storage.fixture',fetcher:async()=>{throw Error('Must not fetch');}}),e=>e.status===416);
});
test('a truncated upstream recording destroys its response instead of claiming completion',async()=>{
 const {req,res}=io();await relay(req,res,{track,url:'https://storage.fixture',fetcher:async()=>new Response(bytes.subarray(0,3),{headers:{'Content-Type':'audio/mpeg','Content-Length':String(bytes.length)}})});assert(res.failure);assert.equal(res.ended,undefined);
});
