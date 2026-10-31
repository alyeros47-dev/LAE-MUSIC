/* Shared browser/server discovery taxonomy. Uses published genre metadata, never inferred lyrics. */
(function(root){
'use strict';
const families=[
 {id:'gospel',name:'Gospel',pattern:'gospel|worship|praise|christian'},
 {id:'afrobeats',name:'Afrobeats & Afropop',pattern:'afrobeat|afropop|afro.pop|afro.fusion|street.pop'},
 {id:'reggae',name:'Reggae & Caribbean',pattern:'reggae|dancehall|soca|calypso'},
 {id:'soul',name:'Soul & R&B',pattern:'soul|r&b|rnb|rhythm.*blues'},
 {id:'highlife',name:'Highlife, Fuji & Juju',pattern:'highlife|fuji|juju'},
 {id:'dance',name:'Amapiano & Dance',pattern:'amapiano|dance|disco|house|electronic'},
 {id:'pop',name:'Pop, Rock & Acoustic',pattern:'pop|rock|acoustic|country'},
 {id:'hiphop',name:'Hip-Hop & Rap',pattern:'hip.hop|rap'},
 {id:'jazz',name:'Jazz, Blues & Classical',pattern:'jazz|blues|classical'},
 {id:'traditional',name:'Traditional & Folk',pattern:'traditional|folk|indigenous'},
 {id:'other',name:'Other sounds',pattern:'.*'}
];
const gospelPattern=families[0].pattern;
function belongs(genre,id){const f=families.find(x=>x.id===id);return !!f&&(id!=='other'||!families.some(x=>x.id!=='other'&&new RegExp(x.pattern,'i').test(genre)))&&new RegExp(f.pattern,'i').test(genre)&&(id==='gospel'||!new RegExp(gospelPattern,'i').test(genre));}
function normalize(value){
 if(!value||value.version!==1||!Array.isArray(value.selections)||value.selections.length>families.length)throw Error('Choose valid listening preferences.');
 const seen=new Set();const selections=value.selections.map(s=>{
  if(!s||!families.some(f=>f.id===s.family)||seen.has(s.family)||!Array.isArray(s.genres)||s.genres.length>100)throw Error('Choose valid music categories.');
  seen.add(s.family);
  const genres=[...new Set(s.genres.map(g=>{if(typeof g!=='string'||!g.trim()||g.length>60||g.includes('\0'))throw Error('Choose valid music categories.');return g;}))].sort();
  if(s.family==='gospel'){if(genres.some(g=>!['worship','praise'].includes(g)))throw Error('Choose Worship, Praise or All Gospel.');}
  else if(genres.some(g=>!belongs(g,s.family)))throw Error('The selected genre does not belong to that music family.');
  return {family:s.family,genres};
 }).sort((a,b)=>a.family.localeCompare(b.family));
 return {version:1,selections};
}
function matches(genre,value){const p=normalize(value);if(!p.selections.length)return true;if(typeof genre!=='string')return false;return p.selections.some(s=>belongs(genre,s.family)&&(!s.genres.length||(s.family==='gospel'?s.genres.some(g=>new RegExp(g,'i').test(genre)&&!/^gospel\s*&\s*worship$/i.test(genre.trim())):s.genres.includes(genre))));}
const api={families,normalize,belongs,matches};
if(typeof module==='object'&&module.exports)module.exports=api;else root.LAEListeningPreferences=api;
})(globalThis);
