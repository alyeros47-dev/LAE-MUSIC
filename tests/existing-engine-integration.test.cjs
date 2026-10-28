'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {runtime,AccountPool}=require('./runtime.cjs');
const adapter=import('data:text/javascript;base64,'+fs.readFileSync('web/studio-engine.js').toString('base64'));
test('studio adapter preserves the existing title, lyrics, style and explicit owned-voice request',async()=>{
 const {musicRequest}=await adapter,brief={title:'Existing artist song',lyrics:'Original owned lyrics',style:'Highlife guitars',language:'English',nativeLyrics:'Exact supplied phrase',useVoice:'on',persona_id:'untrusted-persona'};
 const result=musicRequest(brief,{status:'ready',hasVoice:true});assert.deepEqual(result,{title:brief.title,lyrics:brief.lyrics,style:'Highlife guitars\nLanguage direction: English\nExact supplied phrase',useVoice:true});assert(!Object.hasOwn(result,'persona_id'));
});
test('standard-voice music requests remain usable without R2 or a saved voice',async()=>{
 const {musicRequest}=await adapter;for(const profile of [undefined,{status:'none',hasVoice:false},{status:'unavailable',hasVoice:false}]){assert.equal(musicRequest({title:'Song',lyrics:'Words',style:'Afrobeats',language:'English'},profile).useVoice,false);assert.throws(()=>musicRequest({useVoice:true},profile),/not ready/);}
 assert.throws(()=>musicRequest({style:'x'.repeat(2001)},null),/1,000/);
});
test('existing artist entry points now serve the shared frontend while old API permissions stay enforced',async()=>{
 const app=await runtime({pool:new AccountPool()});for(const path of ['/artist','/artist.html','/artist/profile-photo']){const r=await app.request(path);assert.equal(r.status,200);assert(r.text.includes('/web/app.js'));}
 for(const [path,method]of [['/api/artist/comment-moderation','GET'],['/api/artist/comment-notifications','GET'],['/api/admin/comment-moderation','GET'],['/api/listener/comment-report','POST']]){const r=await app.request(path,{method,...(method==='POST'?{body:{}}:{})});assert.equal(r.status,401,path+' must reach its existing authorized handler rather than disappear');}
 const module=await app.request('/web/studio-engine.js');assert.equal(module.status,200);assert.match(module.headers['content-type'],/javascript/);
});
test('existing voice status is owner-scoped and read without any storage/provider operation',async()=>{
 const ctx={module:{exports:{}},require,console,process:{env:{}},fetch:()=>{throw Error('Must not contact provider');}};vm.runInNewContext(fs.readFileSync('artist-voice.js','utf8'),ctx);
 let queries=0;
 async function profile(id){const res={writeHead(status){this.status=status;},end(s){this.data=JSON.parse(s);}};await ctx.module.exports({method:'GET',headers:{}},res,'/api/voice/profile',{me:async()=>({id}),validOrigin:()=>true,storage:()=>{throw Error('Must not access R2');},pool:{query:async(sql,args)=>{queries++;if(sql.startsWith('CREATE'))return {};assert.match(sql,/WHERE creator_id=\$1/);assert.equal(args[0],id);return {rows:id===7?[{status:'ready',persona_id:'private-owned-persona',object_key:'private-existing-key'}]:[]};}}});return res;}
 const own=await profile(7),other=await profile(8);assert.equal(own.status,200);assert.deepEqual(own.data,{status:'ready',hasVoice:true});assert.deepEqual(other.data,{status:'none',hasVoice:false});assert(!JSON.stringify(own.data).includes('private-'));assert(queries>=3);
});
