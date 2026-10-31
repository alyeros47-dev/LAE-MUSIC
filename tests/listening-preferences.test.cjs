'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalize,matches}=require('../web/listening-preferences'),{discover,parseDiscovery}=require('../lib/discovery');
const pref=(family='gospel',genres=[])=>({version:1,selections:[{family,genres}]});
test('Gospel preferences distinguish explicit worship, praise, both and uncategorized Gospel',()=>{
 assert(matches('Gospel Worship',pref('gospel',['worship'])));assert(!matches('Gospel Praise',pref('gospel',['worship'])));
 assert(matches('Gospel praise',pref('gospel',['praise'])));assert(!matches('Afrobeats',pref()));
 for(const genre of ['Gospel','Gospel & Worship']){assert(matches(genre,pref()));assert(!matches(genre,pref('gospel',['worship'])));}
 assert(matches('Gospel Worship & Praise',pref('gospel',['worship','praise'])));
});
test('other families refine real genre labels and never include Gospel fusion accidentally',()=>{
 assert(matches('Afrobeats',pref('afrobeats')));assert(!matches('Afrobeat Gospel',pref('afrobeats')));
 assert(matches('Roots Reggae',pref('reggae',['Roots Reggae'])));assert(!matches('Lovers Reggae',pref('reggae',['Roots Reggae'])));
 assert(matches('Experimental',pref('other')));assert(!matches('Highlife',pref('other')));
});
test('preferences reject malformed, unknown or injected categories and bind pagination to selection',async()=>{
 for(const value of [null,{},pref('unknown'),pref('gospel',['party']),pref('reggae',['Afrobeats']),{version:1,selections:[...pref().selections,...pref().selections]}])assert.throws(()=>normalize(value));
 assert.throws(()=>parseDiscovery(new URLSearchParams({listening:'{bad'})),/preferences/);
 const pool={query:async sql=>({rows:sql.includes('AS cursor_at')?[1,2].map(id=>({id:String(id),plays:3,cursor_at:'2026-10-31T12:00:00.000000Z'})):[]})};
 const page=await discover(pool,new URLSearchParams({listening:JSON.stringify(pref()),limit:'1'}));
 assert.throws(()=>parseDiscovery(new URLSearchParams({listening:JSON.stringify(pref('reggae')),cursor:page.next_cursor})),/filters/);
});
test('actual PostgreSQL filters before pagination and applies the same preferences to genres and artists',{skip:process.env.LAE_DB_TESTS!=='true'},async()=>{
 require('./ci-database.cjs').ciDatabase();const {Client}=require('pg'),db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
 let queued=Promise.resolve();const pool={query:(...args)=>{const task=queued.then(()=>db.query(...args));queued=task.catch(()=>{});return task;}};
 try{await db.query('CREATE TEMP TABLE creators(id bigint PRIMARY KEY,display_name text); CREATE TEMP TABLE music_tracks(id bigint,title text,genre text,description text,plays bigint,status text,created_at timestamptz,published_at timestamptz,creator_id bigint)');
 await db.query("INSERT INTO creators VALUES(1,'Worship artist'),(2,'Praise artist'),(3,'Reggae artist')");
 const genres=['Gospel Worship','Gospel Praise','Gospel','Gospel & Worship','Roots Reggae','Lovers Reggae','Afrobeats','Gospel Worship'];
 for(let i=0;i<genres.length;i++)await db.query("INSERT INTO music_tracks VALUES($1,$2,$3,'',0,'published','2026-10-31T12:00:00Z','2026-10-31T12:00:00Z',$4)",[i+1,'Song '+(i+1),genres[i],genres[i].includes('Worship')?1:genres[i].includes('Reggae')?3:2]);
 const params=(p,more={})=>new URLSearchParams({listening:JSON.stringify(p),...more});
 const first=await discover(pool,params(pref('gospel',['worship']),{limit:'1'}));assert.deepEqual(first.tracks.map(t=>t.id),['8']);assert.deepEqual(first.genres.map(g=>g.genre),['Gospel Worship']);assert.deepEqual(first.artists.map(a=>a.id),['1']);assert(first.next_cursor);
 const next=await discover(pool,params(pref('gospel',['worship']),{limit:'1',cursor:first.next_cursor}));assert.deepEqual(next.tracks.map(t=>t.id),['1']);assert.equal(next.next_cursor,null);
 const popular=await discover(pool,params(pref('gospel',['worship']),{limit:'1',sort:'popular'}));const popNext=await discover(pool,params(pref('gospel',['worship']),{limit:'1',sort:'popular',cursor:popular.next_cursor}));assert.equal(popNext.tracks[0].id,'1');
 assert.deepEqual((await discover(pool,params(pref('gospel',['praise'])))).tracks.map(t=>t.genre),['Gospel Praise']);
 assert.equal((await discover(pool,params(pref()))).tracks.length,5);
 assert.deepEqual((await discover(pool,params(pref('reggae',['Roots Reggae'])))).tracks.map(t=>t.genre),['Roots Reggae']);
 assert.equal((await discover(pool,params(pref('traditional')))).tracks.length,0);
 }finally{await db.end();}
});
