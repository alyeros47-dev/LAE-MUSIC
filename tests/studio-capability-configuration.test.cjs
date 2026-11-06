'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{runtime}=require('./runtime.cjs');
test('Studio availability and displayed model use the same injected environment as its handlers',async()=>{
 const app=await runtime({env:{NODE_ENV:'test',OPENAI_API_KEY:'synthetic-lyrics-key',MUSICAPI_API_KEY:'synthetic-music-key',OPENAI_LYRICS_MODEL:'gpt-6.1-sol'}}),r=await app.request('/api/platform/capabilities');assert.equal(r.status,200);const c=r.json();assert.equal(c.lyrics_configured,true);assert.equal(c.music_provider_configured,true);assert.equal(c.lyrics_model,'gpt-6.1-sol');assert(!r.text.includes('synthetic-lyrics-key'));assert(!r.text.includes('synthetic-music-key'));
 const absent=await runtime({env:{NODE_ENV:'test'}}),empty=(await absent.request('/api/platform/capabilities')).json();assert.equal(empty.lyrics_configured,false);assert.equal(empty.music_provider_configured,false);
});
