'use strict';
// Launch projection only. The complete approved 215-profile library stays intact.
const dna=require('./music-dna');
const {fail}=require('./transactions');
function catalogue(){
 const full=dna.catalogue(),styles=full.styles.filter(s=>s.department_id==='gospel'),categories=full.categories.filter(c=>c.department_id==='gospel');
 return {...full,departments:full.departments.filter(d=>d.id==='gospel'),categories,styles,coverage:{expected_research_groups:14,supplied_research_groups:categories.map(c=>c.group_id),published_styles:styles.length},launch:'gospel-phase-one'};
}
function assertStyle(id){if(id&&!catalogue().styles.some(s=>s.id===id))throw fail(400,'Choose an available Gospel Music DNA style. Other departments are not open in this launch.');}
function legacyCatalogue(){const c=require('./studio-catalog').catalog;return {...c,secular:[],genre:c.genre.filter(x=>['Gospel & Worship','Nigerian Praise'].includes(x.value))};}
function ownLyricsStyle(body,artistId,key){
 assertStyle(body.musicDnaStyle);
 if(body.rightsConfirmed!==true)throw fail(400,'Confirm that you own or have permission to use these lyrics.');
 if(!body.musicDnaStyle){
  const mood=dna.catalogue().moods.find(m=>m.id===body.musicDnaMood);
  if(!mood)throw fail(400,'Choose one of the four Mood & Energy options.');
  if(!dna.VOICES.some(v=>v.id===(body.voice||'neutral')))throw fail(400,'Choose a supported voice.');
  const languages=body.musicDnaLanguages||[];
  if(!Array.isArray(languages)||languages.length>4||new Set(languages).size!==languages.length||languages.some(id=>!dna.LANGUAGES.some(l=>l.id===id)))throw fail(400,'Choose up to four supported languages.');
  const style=String(body.style||'').trim();if(style.length<3)throw fail(400,'Describe your rhythm, instruments, tempo and vocal delivery.');
  return [style,mood.name+': '+mood.description,'Voice: '+(body.voice||'neutral'),languages.length?'Lyrics languages: '+languages.map(id=>dna.LANGUAGES.find(l=>l.id===id).name).join(', '):'', 'Original Christian/Gospel music; preserve supplied lyrics and complete the ending.'].filter(Boolean).join('; ');
 }
 const context=dna.prepare(body,{artistId,requestKey:key}),p=context.profile;
 // This deterministic adapter uses approved instructions, with no extra lyrics API call or charge.
 const clip=(value,n)=>String(value||'').slice(0,n).trim();
 const core=(p.production_terms||[]).map(terms=>terms[0]).join(', ');
 const languages=context.languages.map(id=>dna.LANGUAGES.find(l=>l.id===id)?.name).filter(Boolean).join(', ');
 const parts=[p.name,context.tempo+' BPM',clip(p.rhythm,100),'Feature '+(core||clip(Object.values(p.instruments).join('; '),110)),clip(p.drums_percussion,90),clip(p.bass,65),clip(p.instruments.keys,65),clip(p.instruments.guitar,65),clip(p.instruments.other,70),context.mood_control?context.mood_control.name+': '+clip(context.mood_control.direction,110):clip(p.mood,80),'Voice: '+context.voice,languages?'Lyrics languages: '+languages:'Preserve the supplied lyric languages','Original Christian/Gospel arrangement. Preserve every supplied word. Complete ending; no imitation.'];
 const result=parts.filter(Boolean).join('; ');
 if(result.length>1000)throw fail(400,'The selected style instructions exceed the music provider limit. Choose a shorter language combination.');
 return result;
}
module.exports={catalogue,legacyCatalogue,assertStyle,ownLyricsStyle};
