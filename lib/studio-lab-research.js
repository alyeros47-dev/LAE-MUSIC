'use strict';
// Real, bounded, free public research tools. No private song brief is queried.
const {fail}=require('./studio-lab-prompts');
const UA='LAE-MUSIC-Studio-Lab/1.0 (https://lae-music.com)';
function createResearch({fetchImpl=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now}={}){
 let nextMusicBrainz=0;
 async function json(url,logs){
  const host=new URL(url).hostname;if(!['musicbrainz.org','en.wikipedia.org'].includes(host))throw fail('Research destination refused.',500);
  const started=now(),entry={tool:host,url,fee_usd:0,status:null,bytes:0};logs.push(entry);
  try{const r=await fetchImpl(url,{headers:{'User-Agent':UA,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});entry.status=r.status;if(!r.ok)throw Error('Research HTTP '+r.status);const reader=r.body.getReader(),chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;entry.bytes+=value.length;if(entry.bytes>180000){await reader.cancel();throw Error('Research response too large.');}chunks.push(Buffer.from(value));}return JSON.parse(Buffer.concat(chunks).toString());}finally{entry.latency_ms=now()-started;}
 }
 async function artist(ref,index=0){
  const logs=[],sources=[],candidates=[];
  try{
   const delay=Math.max(0,nextMusicBrainz-now());nextMusicBrainz=Math.max(nextMusicBrainz,now())+1100;if(delay)await wait(delay);
   const query=new URLSearchParams({query:'artist:"'+ref.search_name.replace(/["\\]/g,'')+'"',fmt:'json',limit:'3'}),url='https://musicbrainz.org/ws/2/artist/?'+query;
   const mb=await json(url,logs);
   for(const a of (mb.artists||[]).slice(0,3)){if(!a.id||!a.name)continue;candidates.push({id:a.id,name:a.name,country:a.country||null,disambiguation:a.disambiguation||'',score:a.score});sources.push({id:`a${index}-mb-${sources.length}`,title:a.name,url:'https://musicbrainz.org/artist/'+a.id,text:JSON.stringify({name:a.name,type:a.type,country:a.country,area:a.area?.name,disambiguation:a.disambiguation,tags:a.tags,aliases:a.aliases})});}
   const searchUrl='https://en.wikipedia.org/w/api.php?'+new URLSearchParams({action:'query',list:'search',srsearch:ref.search_name+' musician',format:'json',utf8:'1',srlimit:'2'}),search=await json(searchUrl,logs);
   const ids=(search.query?.search||[]).map(p=>p.pageid).filter(Number.isInteger).slice(0,2);
   if(ids.length){const pages=await json('https://en.wikipedia.org/w/api.php?'+new URLSearchParams({action:'query',prop:'extracts',pageids:ids.join('|'),explaintext:'1',exintro:'1',exchars:'1800',format:'json'}),logs);for(const page of Object.values(pages.query?.pages||{})){if(!page.extract||!page.title)continue;sources.push({id:`a${index}-wp-${page.pageid}`,title:page.title,url:'https://en.wikipedia.org/?curid='+page.pageid,text:page.extract.slice(0,1800)});}}
  }catch{ return {as_written:ref.as_written,search_name:ref.search_name,status:'incomplete',candidates,sources,requests:logs,message:'Research could not be completed. Do not treat a guessed identity as verified.'}; }
  return {as_written:ref.as_written,search_name:ref.search_name,status:sources.length?'retrieved':'unresolved',candidates,sources,requests:logs};
 }
 return {artist};
}
module.exports={createResearch};
