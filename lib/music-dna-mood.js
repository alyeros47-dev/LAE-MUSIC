'use strict';
const {fail}=require('./transactions');
const MOODS=Object.freeze([
  {id:'calm',name:'Calm & Relaxing',energy:'Gentle',description:'Gentle delivery, softer percussion, relaxed rhythmic movement.',range:[0,0.3],marker:/gentle|softer? percussion|relaxed|restrained/i},
  {id:'smooth',name:'Smooth & Groovy',energy:'Balanced',description:'Balanced energy, flowing rhythm, moderate instrumental intensity.',range:[0.25,0.6],marker:/balanced|flowing|moderate|groov/i},
  {id:'energetic',name:'Energetic & Danceable',energy:'Lively',description:'Stronger drums, lively percussion, upbeat rhythmic movement.',range:[0.55,0.85],marker:/stronger? drums|lively|upbeat|energetic/i},
  {id:'celebration',name:'High-Energy Celebration',energy:'Maximum appropriate',description:'Maximum appropriate excitement, driving rhythm, powerful percussion and festive atmosphere.',range:[0.75,1],marker:/excitement|driving|powerful percussion|festive|celebrat/i}
]);
function choose(value,profile,byte){
  if(value===undefined||value==='')return null;
  const mood=MOODS.find(x=>x.id===value);
  if(!mood)throw fail(400,'Choose one of the four supported Mood & Energy options.');
  const span=profile.tempo.max-profile.tempo.min;
  const min=profile.tempo.min+Math.floor(span*mood.range[0]);
  const max=profile.tempo.min+Math.floor(span*mood.range[1]);
  return {id:mood.id,name:mood.name,energy:mood.energy,direction:mood.description,
    tempo_bpm:min+(byte%(max-min+1)),tempo_bounds:{min,max},
    constraints:'Keep the selected instrumental identity, characteristic rhythm, vocal tradition and all production exclusions. Apply excitement only as appropriate to this style; never turn a prayer, intimate performance or restrained tradition into a party arrangement. Mood changes intensity, dynamics, rhythmic movement and arrangement within these bounds, not genre or religious intent.'};
}
function validateProduction(style,control){
  if(!control)return;
  const mood=MOODS.find(x=>x.id===control.id);
  if(!mood||!mood.marker.test(style)||!new RegExp('\\b'+control.tempo_bpm+'\\s*(?:bpm|beats per minute)\\b','i').test(style))
    throw fail(400,'The production instructions omitted the selected mood or bounded tempo.');
}
module.exports={MOODS,choose,validateProduction};
