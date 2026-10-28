'use strict';
const dns = require('node:dns').promises;
const net = require('node:net');
const { fail } = require('./transactions');
const { matches } = require('./file-signatures');
const AUDIO_LIMIT = 30 * 1024 * 1024, ART_LIMIT = 3 * 1024 * 1024;
function isPublicAddress(address) {
  if (net.isIP(address) === 4) {
    const n = address.split('.').reduce((value, part) => (value << 8n) + BigInt(part), 0n);
    const blocked = [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['192.88.99.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]];
    return !blocked.some(([base,bits]) => { const b=base.split('.').reduce((v,p)=>(v<<8n)+BigInt(p),0n);return (n >> BigInt(32-bits)) === (b >> BigInt(32-bits)); });
  }
  if (net.isIP(address) === 6) {
    // Accept global unicast only, excluding documentation, private, mapped IPv4 and link-local ranges.
    const canonical = new URL('https://[' + address + ']').hostname.slice(1,-1).toLowerCase();
    const first = parseInt(canonical.split(':')[0],16);
    const second=parseInt(canonical.split(':')[1]||'0',16);
    return first >= 0x2000 && first <= 0x3fff && first!==0x2002 && !(first===0x2001&&second<0x200) && !canonical.startsWith('2001:db8:');
  }
  return false;
}
function allowedHosts(value) {
  const hosts = new Set();
  for (const raw of String(value || '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)) {
    if (raw.length>253 || !raw.includes('.') || net.isIP(raw) || !raw.split('.').every(part=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) throw fail(503,'Trusted media hosts require exact public hostnames.');
    hosts.add(raw);
  }
  return hosts;
}
function validateUrl(value, hosts) {
  let url; try { url = new URL(value); } catch { throw fail(422,'The provider returned an invalid media address.'); }
  if (url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443') || !hosts.has(url.hostname.toLowerCase()) || net.isIP(url.hostname.replace(/^\[|\]$/g,''))) throw fail(422,'This provider media host has not been approved for import.');
  url.hash=''; return url;
}
async function resolvePublic(hostname, lookup = dns.lookup) {
  let timer;
  try {
    const rows=await Promise.race([lookup(hostname,{all:true,verbatim:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail(502,'Media address lookup timed out.')),5000);})]);
    if(!rows.length||rows.some(row=>!isPublicAddress(row.address)))throw fail(422,'The provider media address is not public.');
  } finally { clearTimeout(timer); }
}
async function readBounded(response, limit) {
  if(!response.body)throw fail(502,'The provider returned an empty media response.');
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limit)) { await response.body.cancel().catch(()=>{});throw fail(413,'The generated file exceeds the supported size.'); }
  const reader=response.body.getReader(),chunks=[];let size=0;
  try { for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw fail(413,'The generated file exceeds the supported size.');chunks.push(Buffer.from(value));} }
  finally { await reader.cancel().catch(()=>{}); }
  if(!size||length!==null&&Number(length)!==size)throw fail(502,'The generated file download was incomplete.');
  return Buffer.concat(chunks,size);
}
function detectFormat(bytes, kind) {
  const types=kind==='audio'?['audio/mpeg','audio/mp4']:['image/jpeg','image/png','image/webp'];
  const mime=types.find(type=>matches(bytes,type));
  if(!mime)throw fail(415,kind==='audio'?'Generated audio must be a valid MP3 or M4A file.':'Artwork must be JPEG, PNG or WebP.');
  return {mime,extension:({'audio/mpeg':'mp3','audio/mp4':'m4a','image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[mime]};
}
function createMediaDownloader({hosts,fetcher=fetch,lookup=dns.lookup}) {
  return async function download(address,kind) {
    let url=validateUrl(address,hosts);
    for(let redirects=0;redirects<=3;redirects++) {
      await resolvePublic(url.hostname,lookup);
      const response=await fetcher(url.href,{method:'GET',headers:{'Accept-Encoding':'identity'},redirect:'manual',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(45000)});
      if([301,302,303,307,308].includes(response.status)) { const location=response.headers.get('location');await response.body?.cancel().catch(()=>{});if(!location||redirects===3)throw fail(502,'The provider media redirect could not be completed.');url=validateUrl(new URL(location,url).href,hosts);continue; }
      if(!response.ok){await response.body?.cancel().catch(()=>{});throw fail(502,'The provider media file is temporarily unavailable.');}
      const bytes=await readBounded(response,kind==='audio'?AUDIO_LIMIT:ART_LIMIT);
      return {bytes,...detectFormat(bytes,kind)};
    }
    throw fail(502,'The provider media file could not be read.');
  };
}
module.exports={allowedHosts,validateUrl,isPublicAddress,resolvePublic,readBounded,detectFormat,createMediaDownloader,AUDIO_LIMIT,ART_LIMIT};
