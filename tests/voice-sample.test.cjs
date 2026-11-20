'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{validAudio,verifyReadURL}=require('../lib/voice-sample');
function wav(seconds=15){const b=Buffer.alloc(44+8000*2*seconds);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;}
test('PCM WAV bounds reject truncation, false rates, ten seconds and oversized duration',()=>{
 assert(validAudio(wav(),'audio/wav'));assert(validAudio(wav(240),'audio/wav'));assert(!validAudio(wav(10),'audio/wav'));assert(!validAudio(wav(241),'audio/wav'));assert(!validAudio(wav().subarray(0,80),'audio/wav'));
 const rate=wav();rate.writeUInt32LE(1,28);assert(!validAudio(rate,'audio/wav'));
 const size=wav();size.writeUInt32LE(99999999,40);assert(!validAudio(size,'audio/wav'));assert(!validAudio(Buffer.alloc(12000001),'audio/wav'));
 const mp3=Buffer.alloc(10000);mp3.write('ID3');assert(validAudio(mp3,'audio/mpeg'));assert(!validAudio(wav(),'audio/mpeg'));
});
test('signed MP3/WAV URLs retain extension and work with GET without cookies or authorization',async()=>{
 const bytes=wav();let calls=0;
 const result=await verifyReadURL('https://storage.fixture/private/sample.wav?X-Amz-Signature=fixture-only',{expectedBytes:bytes.length,fetchImpl:async(url,o)=>{calls++;assert(url.includes('.wav?'));assert.equal(o.method,'GET');assert.equal(o.credentials,'omit');assert.equal(o.redirect,'error');assert.equal(o.headers.Range,'bytes=0-63');assert.deepEqual(Object.keys(o.headers),['Range']);return new Response(bytes.subarray(0,64),{status:206,headers:{'content-range':'bytes 0-63/'+bytes.length}});}});
 assert.equal(result.reachable,true);assert.equal(calls,1);assert(!JSON.stringify(result).includes('Signature'));
});
test('provider submission must wait when sample URL needs login, redirects, has wrong bytes or wrong suffix',async()=>{
 for(const status of [302,401,403,404])await assert.rejects(verifyReadURL('https://storage.fixture/sample.wav',{fetchImpl:async()=>new Response(null,{status})}),/cannot be read/);
 for(const value of ['https://storage.fixture/voice','https://user:password@storage.fixture/sample.wav','http://storage.fixture/sample.wav'])await assert.rejects(verifyReadURL(value),/must be an HTTPS/);
 await assert.rejects(verifyReadURL('https://storage.fixture/sample.wav',{expectedBytes:240044,fetchImpl:async()=>new Response('<html>login page</html>',{headers:{'content-length':'240044'}})}),/incomplete/);
 const bytes=wav();await assert.rejects(verifyReadURL('https://storage.fixture/sample.wav',{expectedBytes:240045,fetchImpl:async()=>new Response(bytes.subarray(0,64),{status:206,headers:{'content-range':'bytes 0-63/'+bytes.length}})}),/incomplete/);
});
