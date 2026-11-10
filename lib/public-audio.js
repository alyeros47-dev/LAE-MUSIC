'use strict';
const {once}=require('node:events');
const {fail}=require('./transactions');
const MAX_BYTES=30*1024*1024;

// Relay only a server-selected, already-published recording. Bytes are streamed
// unchanged, with backpressure; the caller cannot supply a storage address.
async function relay(req,res,{url,track,fetcher=fetch}){
 const size=Number(track.audio_bytes),mime=track.audio_mime;
 if(!Number.isSafeInteger(size)||size<1||size>MAX_BYTES||!['audio/mpeg','audio/mp4'].includes(mime))throw fail(502,'This recording is unavailable.');
 const range=req.headers.range;
 if(range&&!/^bytes=(?:\d+-\d*|-\d+)$/.test(range))throw fail(416,'Choose a valid audio range.');
 const controller=new AbortController(),abort=()=>controller.abort();
 req.once('aborted',abort);res.once('close',abort);
 try{
  const response=await fetcher(url,{method:req.method,headers:{'Accept-Encoding':'identity',...(range?{Range:range}:{})},redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)])});
  if(response.status===416){await response.body?.cancel();res.writeHead(416,{'Content-Range':'bytes */'+size,'Cache-Control':'no-store'});res.end();return;}
  if(![200,206].includes(response.status)||response.headers.get('content-type')?.split(';')[0]!==mime){await response.body?.cancel();throw fail(502,'Your music could not be loaded. Please retry.');}
  const headers={'Content-Type':mime,'Cache-Control':'no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'};
  let expected=size;
  if(response.status===206){
   const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');
   if(!range||!match||Number(match[3])!==size||Number(match[1])>Number(match[2])||Number(match[2])>=size){await response.body?.cancel();throw fail(502,'The audio range was incomplete.');}
   expected=Number(match[2])-Number(match[1])+1;headers['Content-Range']=response.headers.get('content-range');
  }
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)!==expected)){await response.body?.cancel();throw fail(502,'The recording size could not be verified.');}
  headers['Content-Length']=String(expected);res.writeHead(response.status,headers);
  if(req.method==='HEAD'){await response.body?.cancel();res.end();return;}
  let sent=0;
  try{
   if(!response.body)throw Error('Empty audio body');
   for await(const chunk of response.body){sent+=chunk.byteLength;if(sent>expected)throw Error('Audio exceeds verified size');if(!res.write(chunk))await once(res,'drain',{signal:controller.signal});}
   if(sent!==expected)throw Error('Audio ended before verified size');
   res.end();
  }catch(error){res.destroy(error);}
 }finally{controller.abort();req.removeListener('aborted',abort);res.removeListener('close',abort);}
}
module.exports={relay,MAX_BYTES};
