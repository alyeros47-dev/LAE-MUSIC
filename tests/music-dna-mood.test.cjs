'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const dna=require('../lib/music-dna'),registry=require('../config/music-dna.json');
const {MOODS}=require('../lib/music-dna-mood');
const {handler}=require('./lyrics-handler-fixture.cjs');
const {fixture,sonicFlow}=require('./music-dna-audit-support.cjs');
const actor={artistId:7,requestKey:'qa-studio-mood-request-00001'};
const brief=(id,mood)=>({musicDnaStyle:id,musicDnaMood:mood,musicDnaLanguages:['en','pcm'],voice:'female',model:'gpt-6.1-sol',idea:'An original story about finding hope through friendship',duration:'3 minutes'});
function output(c){const o=fixture(c);return {...o,dna_mood:c.mood_control.name,dna_energy:c.mood_control.energy,style:`${c.tempo} BPM. ${c.mood_control.direction} Keep the characteristic groove, resolved ending and clean mix. `+(c.profile.production_terms||[]).map(terms=>terms[0]).join('; ')};}
test('all 215 unchanged profiles support each bounded customer mood independently of voice and languages',()=>{
 assert.equal(registry.styles.length,215);
 assert.deepEqual(dna.catalogue().moods.map(x=>x.name),['Calm & Relaxing','Smooth & Groovy','Energetic & Danceable','High-Energy Celebration']);
 for(const style of registry.styles){
  const baseline=dna.prepare(brief(style.id,undefined),actor);
  for(const mood of MOODS){
   const b=brief(style.id,mood.id),c=dna.prepare(b,actor),other=dna.prepare({...b,voice:'duet',musicDnaLanguages:['fr','ig']},actor);
   assert.deepEqual(c.profile,baseline.profile);assert.deepEqual(other.profile,c.profile);assert.equal(other.tempo,c.tempo);assert.equal(other.variation_id,c.variation_id);
   assert(c.tempo>=style.tempo.min&&c.tempo<=style.tempo.max);assert(c.tempo>=c.mood_control.tempo_bounds.min&&c.tempo<=c.mood_control.tempo_bounds.max);
   assert.equal(c.mood_control.id,mood.id);assert.deepEqual(dna.prepare(b,actor),c);
   const prompt=dna.instructions(c);assert(prompt.includes(mood.description));assert(prompt.includes(c.profile.rhythm));assert(prompt.includes(c.profile.instruments.guitar));
   assert.equal(dna.promptContext(c).profile.mood,mood.name);assert.equal(c.profile.mood,baseline.profile.mood);
   for(const term of c.profile.production_exclusions||[])assert(prompt.includes(term));
  }
  assert(dna.prepare(brief(style.id,'calm'),actor).tempo<=dna.prepare(brief(style.id,'celebration'),actor).tempo);
 }
});
test('unknown mood IDs fail closed and legacy omitted moods retain the original profile-driven contract',()=>{
 for(const value of ['party',{},[],true,null])assert.throws(()=>dna.prepare(brief('G2-04',value),actor),e=>e.status===400);
 const old=dna.prepare(brief('G2-04',undefined),actor);assert(!old.mood_control);assert.deepEqual(dna.promptContext(old),old);
 const custom=dna.prepare(brief('G2-04','celebration'),actor);assert.deepEqual(custom.profile.production_exclusions,old.profile.production_exclusions);assert(dna.instructions(custom).includes('never turn a prayer'));assert(custom.tempo<=old.profile.tempo.max);
});
test('each department/mood reaches the actual lyrics and music request handlers with one reservation and no paid calls',async()=>{
 for(const id of ['G2-04','S6-01','R7-05','W8-05'])for(const mood of MOODS){
  const b={...brief(id,mood.id),title:'My original title'},c=dna.prepare(b,actor),o=output(c);
  dna.validateOutput(o,c);
  const x=await handler({payload:b,engine:dna,actor,response:o});
  assert.equal(x.result.status,200,JSON.stringify(x.result.data));assert.equal(x.counts.post,1);assert.equal(x.counts.reserve,1);assert.equal(x.counts.complete,1);assert.equal(x.counts.refund,0);
  assert.equal(x.reserved.musicDnaMood,mood.id);assert.equal(x.reserved.title,b.title);assert.equal(x.result.data.title,b.title);
  const sent=JSON.parse(x.request.input[1].content);assert.equal(sent.musicDna.profile.mood,mood.name);assert.equal(sent.musicDna.mood_control.tempo_bpm,c.tempo);
  const music=await sonicFlow({title:b.title,lyrics:o.lyrics,style:o.style});assert.equal(music.status,200);assert.equal(music.sent.tags,o.style);
 }
});
test('mood label alone, wrong tempo or unchanged default metadata is rejected and refunds once',async()=>{
 const b=brief('S6-01','calm'),c=dna.prepare(b,actor),o=output(c);
 for(const bad of [{...o,style:o.style.replace(c.mood_control.direction,'Calm & Relaxing.')},{...o,style:o.style.replace(c.tempo+' BPM','999 BPM')},{...o,dna_mood:c.profile.mood}]){
  assert.throws(()=>dna.validateOutput(bad,c),e=>e.status===400);
  const x=await handler({payload:b,engine:dna,actor,response:bad});assert.equal(x.result.status,502);assert.equal(x.counts.refund,1);assert.equal(x.counts.complete,0);
 }
});
test('frontend forwards only selected mood/title and preserves generated style for the existing music engine',async()=>{
 const {lyricsRequest,musicRequest}=await import('data:text/javascript;base64,'+fs.readFileSync('web/studio-engine.js').toString('base64'));
 const b=lyricsRequest({...brief('W7-01','energetic'),lyricsModel:'gpt-6-astra',title:'  Optional title  ',mood:'stale legacy mood'});
 assert.equal(b.musicDnaMood,'energetic');assert.equal(b.title,'Optional title');assert(!Object.hasOwn(b,'mood'));
 const c=dna.prepare(b,actor),o=output(c);assert.equal(musicRequest({...o,duration:'3 minutes'},{}).style,o.style);
});

test('optional title is validated before reservation, and an empty title uses the generated title',async()=>{
 const b=brief('S6-01','smooth'),c=dna.prepare(b,actor),o=output(c);
 for(const title of [{invalid:'title'},'a','x'.repeat(81)]){
  const x=await handler({payload:{...b,title},engine:dna,actor,response:o});
  assert.equal(x.result.status,400);assert.equal(x.counts.reserve,0);assert.equal(x.counts.post,0);
 }
 const x=await handler({payload:{...b,title:''},engine:dna,actor,response:o});assert.equal(x.result.status,200);assert.equal(x.result.data.title,o.title);
});

test('invalid selected moods are rejected by the actual route before provider or reservation',async()=>{
 const valid=brief('S6-01','calm'),response=output(dna.prepare(valid,actor));
 for(const musicDnaMood of ['invalid',{},null]){
  const x=await handler({payload:{...valid,musicDnaMood},engine:dna,actor,response});
  assert.equal(x.result.status,400);assert.equal(x.counts.reserve,0);assert.equal(x.counts.post,0);
 }
});
