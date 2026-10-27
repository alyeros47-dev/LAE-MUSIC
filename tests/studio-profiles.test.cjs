'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {catalog}=require('../lib/studio-catalog');
const {runtime}=require('./runtime.cjs');
const source=fs.readFileSync('server.js','utf8');
const adapter=import('data:text/javascript;base64,'+fs.readFileSync('web/studio-engine.js').toString('base64'));
function registry(name){const start=source.indexOf('const '+name+'=')+('const '+name+'=').length;return JSON.parse(source.slice(start,source.indexOf('};',start)+1));}
test('redesigned studio exposes every original gospel/secular profile without replacing its backend instructions',async()=>{
 for(const [family,name,count]of [['gospel','gospelProfiles',66],['secular','secularProfiles',33]]){
  const profiles=registry(name);assert.equal(catalog[family].length,count);
  assert.deepEqual(catalog[family].map(x=>x.id).sort(),Object.keys(profiles).sort());
  for(const x of catalog[family]){assert.equal(x.name,profiles[x.id].name);assert(x.country);assert(profiles[x.id].guide.length>100);}
 }
 const app=await runtime();const r=await app.request('/api/platform/studio/catalog');assert.equal(r.status,200);assert.deepEqual(r.json(),catalog);assert(!r.text.includes('guide'));
});
test('style request keeps families exclusive and forwards every existing creative control',async()=>{
 const {lyricsRequest}=await adapter;
 const b={idea:'An original homecoming song',musicFamily:'secular',musicProfile:'sec-nigeria-2',genre:'Afrobeats',language:'English',nativeLanguage:'Yoruba',nativeLyrics:'Exact supplied phrase',extraLanguage:'French',mood:'Hopeful and inspiring',voice:'Deep expressive male lead',duration:'4 minutes',beat:'yoruba-talking'};
 const secular=lyricsRequest(b);assert.equal(secular.secularProfile,'sec-nigeria-2');assert.equal(secular.gospelProfile,'');
 for(const key of ['idea','genre','language','nativeLanguage','nativeLyrics','extraLanguage','mood','voice','duration','beat'])assert.equal(secular[key],b[key]);
 const gospel=lyricsRequest({...b,musicFamily:'gospel',musicProfile:'afro-gospel-1'});assert.equal(gospel.gospelProfile,'afro-gospel-1');assert.equal(gospel.secularProfile,'');assert(!Object.hasOwn(gospel,'model'));
});
// Exercise the unchanged real lyrics handler with a mocked upstream, no paid calls.
async function providerRequest(payload){
 const start=source.indexOf("if(p==='/api/music/lyrics-generate'"),end=source.indexOf('if(p===',start+10);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const fn=new AsyncFunction('req','res','p','validOrigin','process','body','authAdmin','me','pool','json','grantWelcomeCredits','credits','fetch','AbortSignal','ensureCoinTables','require',source.slice(start,end));
 let upstream,reserved,completed=0;
 const result=await fn({method:'POST',headers:{'idempotency-key':'original-style-test-123'}},{},'/api/music/lyrics-generate',()=>true,{env:{OPENAI_API_KEY:'mock-only',OPENAI_LYRICS_MODEL:'configured-model'}},async()=>payload,()=>false,async()=>({id:7}),{},(_r,status,data)=>({status,data}),async()=>{},
 {reserveLyrics:async(_pool,id,key,b)=>{assert.equal(id,7);assert.equal(key,'original-style-test-123');reserved=b;return {reference:'mock-reservation'};},completeLyrics:async(_pool,id,ref,key,out)=>{completed++;return out;},refundLyrics:async()=>{throw Error('Successful generation must not refund');}},
 async(url,options)=>{if(options.method==='GET')return {ok:true,json:async()=>({id:payload.model})};upstream={url,body:JSON.parse(options.body)};const out=JSON.stringify({title:'Original title',lyrics:'Original complete lyrics',style:'Original matching arrangement'});return {ok:true,json:async()=>payload.model?{output_text:out}:{choices:[{message:{content:out}}]}};},AbortSignal,async()=>{},require('node:module').createRequire(require('node:path').resolve('server.js')));
 assert.equal(result.status,200);assert.equal(completed,1);return {upstream,reserved};
}
test('Organic Afro-Fusion selector reaches existing OpenAI system instructions, configured model and credit reservation',async()=>{
 const {lyricsRequest}=await adapter;const b=lyricsRequest({idea:'An original homecoming song',musicFamily:'secular',musicProfile:'sec-nigeria-2',genre:'Afrobeats',language:'English',mood:'Romantic',voice:'Deep expressive male lead',duration:'4 minutes',beat:'yoruba-talking'});
 const {upstream,reserved}=await providerRequest(b);const instructions=upstream.body.messages[0].content;
 assert(instructions.includes(registry('secularProfiles')['sec-nigeria-2'].guide));assert(instructions.includes('talking'));assert(!instructions.includes('Selected African gospel style profile:'));
 assert.equal(upstream.body.model,'configured-model');assert.equal(reserved.secularProfile,'sec-nigeria-2');assert.equal(reserved.gospelProfile,'');
 const user=JSON.parse(upstream.body.messages[1].content);assert.equal(user.mood,'Romantic');assert.equal(user.duration,'4 minutes');
});
test('gospel fusion retains its original detailed prompt without secular contamination',async()=>{
 const {lyricsRequest}=await adapter;const {upstream,reserved}=await providerRequest(lyricsRequest({idea:'A joyful original praise song',musicFamily:'gospel',musicProfile:'afro-gospel-1',genre:'Afro-Gospel',language:'English'}));
 const instructions=upstream.body.messages[0].content;assert(instructions.includes(registry('gospelProfiles')['afro-gospel-1'].guide));assert(!instructions.includes('Detailed original African secular style:'));assert.equal(reserved.gospelProfile,'afro-gospel-1');
});

test('each approved lyrics model is verified and actually selected without losing the cultural prompt or idempotency payload',async()=>{
 const {lyricsRequest}=await adapter;for(const model of ['gpt-6.1-sol','gpt-6-astra']){const payload=lyricsRequest({idea:'A complete original cultural song',musicFamily:'secular',musicProfile:'sec-nigeria-2',lyricsModel:model});assert.equal(payload.model,model);const {upstream,reserved}=await providerRequest(payload);assert.equal(upstream.body.model,model);assert(upstream.url.endsWith('/responses'));assert.equal(reserved.model,model);assert(upstream.body.input[0].content.includes(registry('secularProfiles')['sec-nigeria-2'].guide));}
});
