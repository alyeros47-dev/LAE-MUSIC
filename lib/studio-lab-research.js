'use strict';
// Bounded public artist research. No private song description is sent to a source.
const {fail}=require('./studio-lab-prompts');
const UA='LAE-MUSIC-Studio/1.0 (https://lae-music.com)';
const normalized=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
function identity(ref,candidates){
 const names=new Set([normalized(ref.search_name),normalized(ref.as_written)]);
 const matches=candidates.filter(c=>[c.name,...(c.aliases||[])].some(n=>names.has(normalized(n))));
 // Multiple MusicBrainz IDs with the same name remain distinct identities.
 const mb=matches.filter(c=>c.origin==='musicbrainz');
 const selected=mb.length===1?mb[0]:!mb.length&&matches.length===1?matches[0]:null;
 return {identity_status:selected?'resolved':matches.length>1?'ambiguous':'unresolved',selected_candidate:selected?{id:selected.id,name:selected.name}:null};
}
function createResearch({fetchImpl=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now}={}){
 let nextMusicBrainz=0;const cache=new Map();
 async function json(url,logs){
  const host=new URL(url).hostname;if(!['musicbrainz.org','en.wikipedia.org'].includes(host))throw fail('Research destination refused.',500);
  const started=now(),entry={tool:host,url,fee_usd:0,status:null,bytes:0};logs.push(entry);
  try{const r=await fetchImpl(url,{headers:{'User-Agent':UA,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});entry.status=r.status;if(!r.ok)throw Error('Research HTTP '+r.status);const reader=r.body.getReader(),chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;entry.bytes+=value.length;if(entry.bytes>180000){await reader.cancel();throw Error('Research response too large.');}chunks.push(Buffer.from(value));}return JSON.parse(Buffer.concat(chunks).toString());}finally{entry.latency_ms=now()-started;}
 }
 async function artist(ref,index=0){
  const key=normalized(ref.search_name),cached=cache.get(key);
  if(cached&&cached.expires>now())return {...structuredClone(cached.value),as_written:ref.as_written,cache_hit:true,requests:[{tool:'public_artist_research_cache',status:'hit',fee_usd:0,retrieved_at:cached.value.retrieved_at}]};
  const logs=[],sources=[],candidates=[];let failed=false;
  try{
   const delay=Math.max(0,nextMusicBrainz-now());nextMusicBrainz=Math.max(nextMusicBrainz,now())+1100;if(delay)await wait(delay);
   const query=new URLSearchParams({query:'artist:"'+ref.search_name.replace(/["\\]/g,'')+'"',fmt:'json',limit:'3'}),mb=await json('https://musicbrainz.org/ws/2/artist/?'+query,logs);
   for(const a of (mb.artists||[]).slice(0,3)){if(!a.id||!a.name)continue;const sourceId=`a${index}-mb-${sources.length}`;candidates.push({id:a.id,name:a.name,country:a.country||null,disambiguation:a.disambiguation||'',score:a.score,aliases:(a.aliases||[]).map(x=>x.name).filter(Boolean),origin:'musicbrainz',source_id:sourceId});sources.push({id:sourceId,title:a.name,url:'https://musicbrainz.org/artist/'+a.id,text:JSON.stringify({name:a.name,type:a.type,country:a.country,area:a.area?.name,disambiguation:a.disambiguation,tags:a.tags,aliases:a.aliases})});}
  }catch{failed=true;}
  // Wikipedia is independent: a MusicBrainz outage must not suppress this lookup.
  try{
   const search=await json('https://en.wikipedia.org/w/api.php?'+new URLSearchParams({action:'query',list:'search',srsearch:ref.search_name+' musician',format:'json',utf8:'1',srlimit:'2'}),logs);
   const ids=(search.query?.search||[]).map(p=>p.pageid).filter(Number.isInteger).slice(0,2);
   if(ids.length){const pages=await json('https://en.wikipedia.org/w/api.php?'+new URLSearchParams({action:'query',prop:'extracts',pageids:ids.join('|'),explaintext:'1',exchars:'6000',format:'json'}),logs);for(const page of Object.values(pages.query?.pages||{})){if(!page.extract||!page.title)continue;const sourceId=`a${index}-wp-${page.pageid}`,name=page.title.replace(/\s*\((?:musician|singer|rapper|songwriter|band|composer|DJ)[^)]*\)$/i,'');sources.push({id:sourceId,title:page.title,url:'https://en.wikipedia.org/?curid='+page.pageid,text:page.extract.slice(0,6000)});if([ref.search_name,ref.as_written].some(n=>normalized(n)===normalized(name))&&/\b(?:singer|musician|rapper|songwriter|composer|band|disc jockey)\b/i.test(page.extract.slice(0,800))&&!candidates.some(c=>normalized(c.name)===normalized(name)))candidates.push({id:'wikipedia:'+page.pageid,name,aliases:[],origin:'wikipedia',source_id:sourceId});}}
  }catch{failed=true;}
  const resolved=identity(ref,candidates),result={as_written:ref.as_written,search_name:ref.search_name,status:sources.length&&candidates.length?'retrieved':failed?'incomplete':'unresolved',...resolved,candidates,sources,requests:logs,retrieved_at:new Date(now()).toISOString(),cache_hit:false};
  if(resolved.identity_status==='resolved'){if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,{expires:now()+6*3600000,value:structuredClone(result)});}
  return result;
 }
 return {artist};
}
module.exports={createResearch,identity};
