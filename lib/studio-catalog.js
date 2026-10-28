'use strict';
// Read selection metadata from the existing studio, not a second preset registry.
// Detailed musical instructions remain in the original lyrics handler.
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','music-prompt-studio.html'),'utf8');
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const match=html.match(/const gospel=(\[.*?\]),secular=(\[.*?\]),by=/);
if(!match)throw Error('Existing studio style metadata is unavailable');
const profiles=raw=>JSON.parse(raw).map(({id,country,name})=>({id,country,name:decode(name)}));
function options(id){
 const select=html.match(new RegExp('<select id="'+id+'">([\\s\\S]*?)</select>'));
 if(!select)throw Error('Existing studio options missing: '+id);
 return [...select[1].matchAll(/<option(?: value="([^"]*)")?[^>]*>([^<]*)<\/option>/g)].map(m=>({value:decode(m[1]??m[2]),label:decode(m[2])}));
}
const catalog={gospel:profiles(match[1]),secular:profiles(match[2]),beat:options('beat'),mood:options('mood'),voice:options('voice'),duration:options('duration'),genre:options('genre'),language:options('language')};
module.exports={catalog};
