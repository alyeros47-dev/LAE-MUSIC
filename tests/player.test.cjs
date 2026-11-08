'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const modulePromise=import('data:text/javascript;base64,'+fs.readFileSync('web/player.js').toString('base64'));
test('queue advances, respects repeat-one on ended, and stops at the end with repeat off',async()=>{const {PlaybackQueue}=await modulePromise;const q=new PlaybackQueue();q.set([{id:1},{id:2},{id:3}]);assert.equal(q.next(),1);q.repeat='one';assert.equal(q.next(true),1);q.repeat='off';assert.equal(q.next(true),2);assert.equal(q.next(true),-1);assert.equal(q.current.id,'3');q.repeat='all';assert.equal(q.next(true),0);});
test('shuffle excludes the current track and previous follows actual history',async()=>{const {PlaybackQueue}=await modulePromise;const q=new PlaybackQueue();q.set([{id:1},{id:2},{id:3}]);q.shuffle=true;assert.equal(q.next(false,()=>0),1);assert.equal(q.next(false,()=>.9),2);assert.equal(q.previous(),1);assert.equal(q.previous(),0);});
test('queue reordering and removal preserve current song and disallow removal of the playing item',async()=>{const {PlaybackQueue}=await modulePromise;const q=new PlaybackQueue();q.set([{id:1},{id:2},{id:3}],1);assert.equal(q.remove(1),false);q.moveUp(1);assert.equal(q.current.id,'2');assert.equal(q.index,0);q.remove(1);assert.equal(q.current.id,'2');q.moveUp(1);assert.equal(q.current.id,'2');assert.equal(q.index,1);});
test('time formatting handles invalid duration and empty queues safely',async()=>{const {PlaybackQueue,time}=await modulePromise;const q=new PlaybackQueue();assert.equal(q.next(),-1);assert.equal(q.previous(),-1);assert.equal(time(NaN),'0:00');assert.equal(time(Infinity),'0:00');assert.equal(time(-2),'0:00');assert.equal(time(125),'2:05');});
class Element extends EventTarget{
 constructor(id){super();this.id=id;this.attrs={};this.dataset={};this.children=[];this.classList={add(){},remove(){}};this.currentTime=0;this.duration=180;this.paused=true;this.volume=.8;this.muted=false;this.hidden=true;}
 setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]||null;}removeAttribute(k){delete this.attrs[k];if(k==='src')this._src='';}set src(v){this._src=v;this.attrs.src=v;}get src(){return this._src||'';}load(){}pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}async play(){this.paused=false;this.dispatchEvent(new Event('play'));}replaceChildren(){this.children=[];}append(...items){this.children.push(...items);}click(){return this.onclick?.();}showModal(){this.open=true;}close(){this.open=false;}
}
function dom(){const nodes=new Map(),storage=new Map();global.document=new EventTarget();document.body=new Element('body');document.getElementById=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);};document.createElement=tag=>new Element(tag);global.window=new EventTarget();global.location=new URL('https://lae.test');global.localStorage={setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)||null};return {nodes,storage,get:id=>document.getElementById(id)};}
test('real player driver fetches platform audio, survives navigation outside its DOM, and ignores stale stream requests',async()=>{const {MusicPlayer}=await modulePromise;const d=dom();const pending=[];const p=new MusicPlayer({api:(url)=>new Promise(resolve=>pending.push({url,resolve})),toast(){},onLike(){},onDetail(){}});const first=p.setTracks([{id:1,title:'First',artist:'A'},{id:2,title:'Second',artist:'B'}]);const second=p.playIndex(1);pending[1].resolve({url:'https://storage.test/second.mp3'});await second;pending[0].resolve({url:'https://storage.test/first.mp3'});await first;assert.equal(p.audio.src,'https://storage.test/second.mp3');assert.equal(p.audio.paused,false);assert.equal(p.queue.current.id,'2');d.get('page').replaceChildren();assert.equal(p.audio,d.get('audio'));assert.equal(p.audio.paused,false);assert.match(pending[1].url,/tracks\/2\/stream/);p.audio.pause();assert.equal(d.get('play-toggle').getAttribute('aria-label'),'Play');});
test('player restore keeps queue and position without autoplay or persisting expiring signed stream URLs',async()=>{const {MusicPlayer}=await modulePromise;const d=dom();d.storage.set('lae_playback_v2',JSON.stringify({tracks:[{id:7,title:'Saved',artist:'Artist'}],index:0,position:35,volume:.4,repeat:'all',shuffle:true}));let calls=0;const p=new MusicPlayer({api:async()=>{calls++;return {url:'https://storage.test/song.mp3'};},toast(){},onLike(){},onDetail(){}});assert.equal(calls,0);assert.equal(p.audio.paused,true);assert.equal(p.queue.current.title,'Saved');assert.equal(p.resumeAt,35);await p.toggle();p.audio.dispatchEvent(new Event('loadedmetadata'));assert.equal(p.audio.currentTime,35);assert.equal(p.audio.volume,.4);p.save();assert(!d.storage.get('lae_playback_v2').includes('storage.test'));});

test('qualified playback retries keep the same play reference and avoid a separate history mutation',async()=>{const {MusicPlayer}=await modulePromise;dom();const plays=[];const p=new MusicPlayer({api:async(url,method,data,options)=>{if(url.endsWith('/stream'))return {url:'https://storage.test/song.mp3'};plays.push({url,key:options.headers['Idempotency-Key']});if(plays.length===1)throw Error('Temporary fixture outage');return {counted:true};},toast(){},onLike(){},onDetail(){}});await p.setTracks([{id:44,title:'Counted',artist:'A'}]);for(let i=1;i<=30;i++){p.audio.currentTime=i;p.timeUpdate();}await new Promise(resolve=>setTimeout(resolve,1600));assert.equal(plays.length,2);assert.equal(plays[0].key,plays[1].key);assert.match(plays[0].key,/^[a-f0-9-]{36}$/);assert(plays.every(x=>x.url==='/api/music/tracks/44/play'));});

test('a legacy zero-volume browser is visibly muted and one Unmute click restores audible volume',async()=>{
 const {MusicPlayer}=await modulePromise,d=dom();d.storage.set('lae_playback_v2',JSON.stringify({tracks:[{id:7,title:'Existing song'}],index:0,volume:0,position:12}));
 let requests=0;const p=new MusicPlayer({api:async()=>{requests++;return {url:'https://storage.test/song.mp3'};},toast(){},onLike(){},onDetail(){}});
 assert.equal(p.audio.volume,0);assert.equal(p.audio.paused,true);assert.equal(requests,0);
 assert.equal(d.get('mute').getAttribute('aria-label'),'Unmute');assert.equal(d.get('playback-sound-status').hidden,false);assert.equal(Number(d.get('expanded-volume').value),0);
 d.get('mute').onclick();assert.equal(p.audio.muted,false);assert(p.audio.volume>0);assert.equal(p.audio.volume,.8);assert.equal(d.get('playback-sound-status').hidden,true);assert.equal(p.audio.paused,true);assert.equal(requests,0);
 assert.equal(JSON.parse(d.storage.get('lae_playback_v2')).volume,.8);
});
test('both volume controls stay synchronized and zero-volume recovery returns to the last audible level',async()=>{
 const {MusicPlayer}=await modulePromise,d=dom(),p=new MusicPlayer({api:async()=>({url:'https://storage.test/song.mp3'}),toast(){},onLike(){},onDetail(){}});
 d.get('volume').oninput({target:{value:'.27'}});assert.equal(Number(d.get('expanded-volume').value),.27);
 d.get('expanded-volume').oninput({target:{value:'0'}});assert.equal(p.audio.volume,0);assert.equal(Number(d.get('volume').value),0);assert.equal(d.get('mute').getAttribute('aria-label'),'Unmute');assert.equal(d.get('playback-sound-status').hidden,false);
 d.get('mute').onclick();assert.equal(p.audio.volume,.27);assert.equal(p.audio.muted,false);assert.equal(Number(d.get('expanded-volume').value),.27);assert.equal(Number(d.get('volume').value),.27);
 d.get('expanded-volume').oninput({target:{value:'.6'}});assert.equal(d.get('mute').getAttribute('aria-label'),'Mute');assert.equal(Number(d.get('volume').value),.6);
});
test('intentional mute survives reload without autoplay and Unmute preserves the chosen level',async()=>{
 const {MusicPlayer}=await modulePromise,d=dom(),make=()=>new MusicPlayer({api:async()=>{throw Error('A preference change cannot request audio');},toast(){},onLike(){},onDetail(){}});
 const p=make();d.get('volume').oninput({target:{value:'.35'}});d.get('mute').onclick();assert.equal(p.audio.muted,true);assert.equal(JSON.parse(d.storage.get('lae_playback_v2')).muted,true);
 const reloaded=make();assert.equal(reloaded.audio.muted,true);assert.equal(reloaded.audio.volume,.35);assert.equal(reloaded.audio.paused,true);assert.equal(d.get('playback-sound-status').hidden,false);
 d.get('mute').onclick();assert.equal(reloaded.audio.muted,false);assert.equal(reloaded.audio.volume,.35);
});
test('a corrupt recovery volume uses a safe default and sound hints do not hide stream errors',async()=>{
 const {MusicPlayer}=await modulePromise,d=dom();d.storage.set('lae_playback_v2',JSON.stringify({tracks:[],volume:0,lastAudibleVolume:99,muted:'true'}));
 const p=new MusicPlayer({api:async()=>{throw Error('No stream is requested');},toast(){},onLike(){},onDetail(){}});p.message('Audio unavailable. Press play to retry.');p.updateMute();assert.equal(d.get('playback-status').textContent,'Audio unavailable. Press play to retry.');assert.equal(d.get('playback-sound-status').hidden,false);
 d.get('mute').onclick();assert.equal(p.audio.volume,.8);assert.equal(p.audio.muted,false);assert.equal(d.get('playback-status').textContent,'Audio unavailable. Press play to retry.');
});

test('new player code remains usable with a previously cached shell lacking the new sound-status span',async()=>{
 const {MusicPlayer}=await modulePromise,d=dom(),lookup=document.getElementById;
 document.getElementById=id=>id==='playback-sound-status'?null:lookup(id);
 d.storage.set('lae_playback_v2',JSON.stringify({tracks:[{id:7,title:'Cached shell fixture'}],index:0,volume:0}));
 const p=new MusicPlayer({api:async()=>({url:'https://storage.test/song.mp3'}),toast(){},onLike(){},onDetail(){}});
 assert.equal(d.get('mute').getAttribute('aria-label'),'Unmute');d.get('mute').onclick();assert.equal(p.audio.volume,.8);assert.equal(p.audio.muted,false);
});

test('ended advances and plays automatically; next and previous skip while audio is playing',async()=>{
 const {MusicPlayer}=await modulePromise,d=dom(),p=new MusicPlayer({api:async url=>({url:'https://storage.test/'+url.split('/')[4]+'.mp3'}),toast(){},onLike(){},onDetail(){}});
 await p.setTracks([{id:1,title:'One'},{id:2,title:'Two'},{id:3,title:'Three'}]);
 p.audio.dispatchEvent(new Event('ended'));await new Promise(r=>setImmediate(r));assert.equal(p.queue.current.id,'2');assert.equal(p.audio.paused,false);
 await d.get('next').click();assert.equal(p.queue.current.id,'3');p.audio.currentTime=15;
 await d.get('previous').click();assert.equal(p.queue.current.id,'2');assert.equal(p.audio.paused,false);
 p.queue.repeat='one';await p.advance(true);assert.equal(p.queue.current.id,'2');
 p.queue.repeat='off';await p.advance(true);assert.equal(p.queue.current.id,'3');await p.advance(true);assert.equal(p.queue.current.id,'3');assert.match(d.get('playback-status').textContent,/end of your queue/);
});
test('automatic transitions request fresh offline sources and fail closed when the next grant expires',async()=>{
 const {MusicPlayer}=await modulePromise;dom();let valid=true,calls=[];
 const p=new MusicPlayer({api:async()=>{throw Error('Offline playback must not request a stream');},toast(){},onLike(){},onDetail(){}});
 p.sourceProvider=async track=>{calls.push(track.id);if(!valid)throw Error('Offline access expired');return {url:'blob:https://lae.test/'+track.id,offline:true};};
 await p.setTracks([{id:1,offline:true},{id:2,offline:true}]);await p.advance(true);assert.deepEqual(calls,['1','2']);assert.equal(p.currentSourceOffline,true);assert.equal(p.audio.paused,false);
 valid=false;await p.playIndex(0);assert.equal(p.audio.paused,true);assert.equal(p.audio.getAttribute('src'),null);
});

test('reaching the end does not add a false previous-track history entry',async()=>{
 const {PlaybackQueue}=await modulePromise,q=new PlaybackQueue();q.set([{id:1},{id:2}]);q.next(true);assert.equal(q.next(true),-1);assert.equal(q.previous(),0);assert.equal(q.current.id,'1');
});

const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('a prepared next song starts synchronously on ended without clearing native audio or waiting on the network',async()=>{
 const {MusicPlayer}=await modulePromise,d=dom(),calls=[];
 const p=new MusicPlayer({api:async url=>{calls.push(url);return {url:'https://storage.test/'+url.split('/')[4]+'.mp3'};},toast(){},onLike(){},onDetail(){}});
 await p.setTracks([{id:1,title:'One'},{id:2,title:'Two'}]);p.audio.duration=60;p.audio.dispatchEvent(new Event('loadedmetadata'));await settle();assert.equal(p.prepared.data.url,'https://storage.test/2.mp3');
 let pauses=0,loads=0;p.audio.pause=()=>{pauses++;};p.audio.load=()=>{loads++;};p.audio.ended=true;p.audio.paused=true;
 p.audio.dispatchEvent(new Event('ended'));
 assert.equal(p.queue.current.id,'2');assert.equal(p.audio.src,'https://storage.test/2.mp3');assert.equal(p.audio.paused,false);assert.equal(pauses,0);assert.equal(loads,0);assert.equal(calls.filter(x=>x.endsWith('/stream')).length,2);assert(!calls.some(x=>x.endsWith('/play')));
 await settle();assert(!d.storage.get('lae_playback_v2').includes('storage.test'));
});
test('slow preparation keeps the current audio source and media session until the next source is ready',async()=>{
 const {MusicPlayer}=await modulePromise;dom();let next;
 const p=new MusicPlayer({api:async url=>url.includes('/1/')?{url:'https://storage.test/1.mp3'}:new Promise(resolve=>{next=resolve;}),toast(){},onLike(){},onDetail(){}});
 await p.setTracks([{id:1},{id:2}]);const end=p.advance(true);assert.equal(p.audio.src,'https://storage.test/1.mp3');next({url:'https://storage.test/2.mp3'});await end;assert.equal(p.audio.src,'https://storage.test/2.mp3');
});
test('a deliberate pause during an asynchronous song transition cancels its pending autoplay',async()=>{
 const {MusicPlayer}=await modulePromise;dom();let resolve;
 const p=new MusicPlayer({api:async()=>({url:'https://storage.test/song.mp3'}),toast(){},onLike(){},onDetail(){}});
 await p.setTracks([{id:1},{id:2}]);p.advertiser={beforeAdvance:()=>new Promise(r=>{resolve=r;})};const end=p.advance(true);p.pause();resolve(true);await end;assert.equal(p.queue.current.id,'1');assert.equal(p.audio.paused,true);
});
test('offline preloading releases old blobs only after switching, and rejects a prepared expired grant',async()=>{
 const {MusicPlayer}=await modulePromise;dom();let valid=true,serial=0;const released=[];
 const p=new MusicPlayer({api:async()=>{throw Error('No online media');},toast(){},onLike(){},onDetail(){}});
 p.sourceProvider=async track=>{if(!valid)throw Error('Offline access expired');const id=++serial;return {url:'blob:https://lae.test/'+id,offline:true,release:()=>released.push(id),validate:()=>{if(!valid)throw Error('Expired grant');}};};
 await p.setTracks([{id:1,offline:true},{id:2,offline:true},{id:3,offline:true}]);p.audio.duration=60;p.audio.dispatchEvent(new Event('loadedmetadata'));await settle();assert.deepEqual(released,[]);await p.advance(true);assert.equal(p.queue.current.id,'2');assert.deepEqual(released,[1]);
 p.audio.dispatchEvent(new Event('loadedmetadata'));await settle();valid=false;await p.advance(true);assert.equal(p.audio.paused,true);assert.equal(p.audio.getAttribute('src'),null);assert.equal(p.streamFailed,true);assert(released.includes(3));assert(released.includes(2));
});
test('queue edits discard prepared audio and shuffle consumes the exact prepared choice',async()=>{
 const {MusicPlayer}=await modulePromise;dom();const releases=[];
 const p=new MusicPlayer({api:async url=>({url:'https://storage.test/'+url.split('/')[4]+'.mp3',release:()=>releases.push(url)}),toast(){},onLike(){},onDetail(){}});
 await p.setTracks([{id:1},{id:2},{id:3}]);p.queue.shuffle=true;p.audio.duration=60;p.audio.dispatchEvent(new Event('loadedmetadata'));await settle();const expected=p.prepared.index;await p.advance(true);assert.equal(p.queue.index,expected);
 p.audio.dispatchEvent(new Event('loadedmetadata'));await settle();const old=p.prepared.data.url;p.queue.set([{id:9},{id:10}]);await p.playIndex(0);assert.equal(p.audio.src,'https://storage.test/9.mp3');assert(!p.audio.src.includes(old));assert(releases.length>=2);
});
test('a cancelled or superseded preparation releases its late offline blob instead of selecting it',async()=>{
 const {MusicPlayer}=await modulePromise;dom();let finish;const released=[];
 const p=new MusicPlayer({api:async()=>({url:'https://storage.test/live.mp3'}),toast(){},onLike(){},onDetail(){}});
 await p.setTracks([{id:1},{id:2}]);p.sourceProvider=async(track,online,options)=>options?.preparing?new Promise(resolve=>{finish=resolve;}):online();p.audio.duration=60;p.prepareNext();await settle();p.clearPrepared();finish({url:'blob:https://lae.test/late',offline:true,release:()=>released.push('late')});await settle();assert.deepEqual(released,['late']);assert.equal(p.audio.src,'https://storage.test/live.mp3');
});
test('failed speculative preparation waits before retrying and never interrupts the current song',async()=>{
 const {MusicPlayer}=await modulePromise;dom();let calls=0;
 const p=new MusicPlayer({api:async()=>({url:'https://storage.test/current.mp3'}),toast(){},onLike(){},onDetail(){}});
 await p.setTracks([{id:1},{id:2}]);p.sourceProvider=async()=>{calls++;throw Error('Temporary network outage');};p.audio.duration=60;p.prepareNext();await settle();p.prepareNext();await settle();assert.equal(calls,1);assert.equal(p.audio.paused,false);assert.equal(p.audio.src,'https://storage.test/current.mp3');
});
test('an explicitly paused player does not advance if an ended callback was already queued',async()=>{
 const {MusicPlayer}=await modulePromise,d=dom();const p=new MusicPlayer({api:async()=>({url:'https://storage.test/song.mp3'}),toast(){},onLike(){},onDetail(){}});
 await p.setTracks([{id:1},{id:2}]);p.pause();await p.advance(true);assert.equal(p.queue.current.id,'1');assert.equal(p.audio.paused,true);assert.equal(d.get('play-toggle').getAttribute('aria-label'),'Play');await p.toggle();await p.advance(true);assert.equal(p.queue.current.id,'2');
});
test('pausing a pending source change prevents a stale offline source from being resumed under the new selection',async()=>{
 const {MusicPlayer}=await modulePromise;dom();let finish;
 const p=new MusicPlayer({api:async url=>url.includes('/1/')?{url:'https://storage.test/1.mp3'}:new Promise(resolve=>{finish=resolve;}),toast(){},onLike(){},onDetail(){}});
 await p.setTracks([{id:1},{id:2}]);const pending=p.advance(true);assert(p.loading);await p.toggle();assert.equal(p.audio.paused,true);assert.equal(p.audio.getAttribute('src'),null);assert.equal(p.streamFailed,true);finish({url:'https://storage.test/2.mp3'});await pending;assert.equal(p.audio.paused,true);assert.equal(p.audio.getAttribute('src'),null);
});

test('a preview takes audio focus without changing the main source, queue, position or volume',async()=>{
 const {MusicPlayer}=await modulePromise,d=dom(),p=new MusicPlayer({api:async()=>({url:'https://storage.test/original.mp3'}),toast(){},onLike(){},onDetail(){}}),preview=new Element('preview');
 document.querySelectorAll=()=>[p.audio,preview];p.focusId='fixture';p.focusStamp=0;
 await p.setTracks([{id:7,title:'Original recording'}]);p.audio.currentTime=24;p.setVolume(1);
 await preview.play();p.focusPlayback(preview);
 assert(p.audio.paused);assert(!preview.paused);assert.equal(p.audio.src,'https://storage.test/original.mp3');assert.equal(p.audio.currentTime,24);assert.equal(p.audio.volume,1);assert.equal(p.queue.current.id,'7');
 // Navigation may detach the preview while its native audio is still running.
 document.querySelectorAll=()=>[p.audio];await p.audio.play();p.focusPlayback(p.audio);assert(preview.paused);assert(!p.audio.paused);assert.equal(p.audio.currentTime,24);
 const claim=JSON.parse(d.storage.get('lae_audio_focus_v1'));assert.deepEqual(Object.keys(claim).sort(),['at','owner']);
});
test('an ad taking audio focus preserves its queue transition; an external preview pauses it deliberately',async()=>{
 const {MusicPlayer}=await modulePromise;dom();const p=new MusicPlayer({api:async()=>({url:'https://storage.test/original.mp3'}),toast(){},onLike(){},onDetail(){}}),ad=new Element('detached-ad'),preview=new Element('preview');
 document.querySelectorAll=()=>[p.audio,preview];p.focusId='fixture';p.focusStamp=0;
 await p.setTracks([{id:7}]);p.advertiser={active:true,audio:ad};const request=p.request;
 await ad.play();p.focusPlayback(ad);assert.equal(p.request,request);assert(p.audio.paused);assert(!ad.paused);
 await preview.play();p.focusPlayback(preview);assert(ad.paused);assert.equal(p.advertiser.userPaused,true);assert(p.request>request);assert(!preview.paused);
});
