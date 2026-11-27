'use strict';
const fail=message=>Object.assign(Error(message),{status:400});
function validAudio(bytes,mime){
 if(!Buffer.isBuffer(bytes)||bytes.length<10000||bytes.length>12000000)return false;
 if(mime==='audio/mpeg')return require('./file-signatures').matches(bytes,mime);
 if(mime!=='audio/wav'||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'||bytes.readUInt32LE(4)+8!==bytes.length)return false;
 let format=null,audioBytes=null;
 for(let offset=12;offset+8<=bytes.length;){
  const kind=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8;
  if(start+size>bytes.length)return false;
  if(kind==='fmt '){if(size<16)return false;format={pcm:bytes.readUInt16LE(start),channels:bytes.readUInt16LE(start+2),rate:bytes.readUInt32LE(start+4),byteRate:bytes.readUInt32LE(start+8),align:bytes.readUInt16LE(start+12),bits:bytes.readUInt16LE(start+14)};}
  if(kind==='data'){if(audioBytes!==null)return false;audioBytes=size;}
  offset=start+size+(size%2);
 }
 if(!format||audioBytes===null)return false;
 const {pcm,channels,rate,byteRate,align,bits}=format;
 return pcm===1&&[1,2].includes(channels)&&rate>=8000&&rate<=192000&&bits===16&&align===channels*2&&byteRate===rate*align&&audioBytes%align===0&&audioBytes/byteRate>10&&audioBytes/byteRate<=240;
}
async function verifyReadURL(value,{expectedBytes,fetchImpl=fetch}={}){
 let url;try{url=new URL(value);}catch{throw fail('Voice sample link is invalid. Training was not started.');}
 if(url.protocol!=='https:'||url.username||url.password||!/\.(mp3|wav)$/i.test(url.pathname))throw fail('Voice sample link must be an HTTPS MP3 or WAV link. Training was not started.');
 let response;
 try{response=await fetchImpl(url.href,{method:'GET',headers:{Range:'bytes=0-63'},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw fail('The voice sample cannot be reached by the music provider. Please save it again. Training was not started.');}
 if(![200,206].includes(response.status)||!response.body){await response.body?.cancel().catch(()=>{});throw fail('The voice sample cannot be read without signing in. Please save it again. Training was not started.');}
 const range=response.headers.get('content-range');
 const total=response.status===206?Number(range?.match(/^bytes 0-\d+\/(\d+)$/)?.[1]):Number(response.headers.get('content-length'));
 const reader=response.body.getReader();let prefix=Buffer.alloc(0);
 try{while(prefix.length<12){const part=await reader.read();if(part.done)break;prefix=Buffer.concat([prefix,Buffer.from(part.value).subarray(0,64)]);}}finally{await reader.cancel().catch(()=>{});}
 const mime=/\.wav$/i.test(url.pathname)?'audio/wav':'audio/mpeg';
 const formatOK=mime==='audio/wav'?prefix.toString('ascii',0,4)==='RIFF'&&prefix.toString('ascii',8,12)==='WAVE':require('./file-signatures').matches(prefix,mime);
 if(!formatOK||!Number.isSafeInteger(total)||total<10000||total>12000000||(expectedBytes!==undefined&&total!==expectedBytes))throw fail('The saved voice file is incomplete or is not a valid MP3/WAV. Please save it again. Training was not started.');
 return {reachable:true,format:mime,bytes:total};
}
module.exports={validAudio,verifyReadURL};
