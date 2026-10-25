'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {runtime}=require('./runtime.cjs'),{createModeration}=require('../lib/moderation');
module.exports=async(t,{pool})=>{
 const env={NODE_ENV:'test',ADMIN_KEY:'isolated-moderation-key-123456',STUDIO_RELEASE_WORKER_ENABLED:'false'},app=await runtime({pool,env}),service=createModeration(pool);
 const api=async(path,{body,cookie,key}={})=>{const r=await app.request(path,{method:body===undefined?'GET':'POST',body,headers:{...(cookie?{cookie}:{}),...(key?{'idempotency-key':key}:{})}});return {status:r.status,data:r.json(),cookie:(Array.isArray(r.headers['set-cookie'])?r.headers['set-cookie'][0]:r.headers['set-cookie'])?.split(';')[0]};};
 const key=()=>crypto.randomUUID();
 async function register(role,name){const r=await api(role==='artist'?'/api/register':'/api/listener/register',{body:{name:'Moderation '+name,email:name+'@moderation-ci.invalid',country:'Nigeria',password:'ModerationPassword123',confirmPassword:'ModerationPassword123',plan:'starter'}});assert.equal(r.status,201);return {id:r.data.user.id,cookie:r.cookie};}
 const current=async()=>((await pool.query('SELECT * FROM song_comments WHERE id=$1',[comment.id])).rows[0]);
 let artist,other,reporters,track,comment,admin;
 await t.test('real guest comments remain visible in owned moderation views and suspicious guest submissions receive a platform hold',async()=>{
  artist=await register('artist','artist');other=await register('artist','other');reporters=await Promise.all(['one','two','three'].map(name=>register('listener',name)));
  track=(await pool.query("INSERT INTO music_tracks(creator_id,title,genre,audio_key,audio_mime,audio_bytes,status,published_at) VALUES($1,'Moderation fixture song','Highlife','isolated/moderation.mp3','audio/mpeg',1024,'published',NOW()) RETURNING *",[artist.id])).rows[0];
  assert.equal((await api('/api/listener/comments',{body:{trackId:track.id,comment:'A thoughtful guest comment for the review journey.',guestName:'CI Guest Reviewer'}})).status,201);comment=(await pool.query('SELECT * FROM song_comments WHERE track_id=$1 ORDER BY id LIMIT 1',[track.id])).rows[0];assert.equal(comment.listener_id,null);
  const owned=await api('/api/artist/comment-moderation',{cookie:artist.cookie});assert.equal(owned.status,200);assert.equal(owned.data.comments.find(c=>c.id===comment.id).author,'CI Guest Reviewer');assert.equal(owned.data.comments.find(c=>c.id===comment.id).reports_detail.length,0);
  assert.equal((await api('/api/artist/comment-notifications',{cookie:artist.cookie})).data.notifications[0].author,'CI Guest Reviewer');
  const held=await api('/api/listener/comments',{body:{trackId:track.id,comment:'Review this link https://example.invalid/fixture',guestName:'CI Held Guest'}});assert.equal(held.status,201);assert.equal(held.data.held,true);assert.equal((await pool.query("SELECT platform_hold FROM song_comments WHERE track_id=$1 AND guest_name='CI Held Guest'",[track.id])).rows[0].platform_hold,true);
 });
 await t.test('concurrent distinct listener reports hold the comment once, advance revisions and retain all original report reasons',async()=>{
  assert.equal((await api('/api/listener/comment-report',{body:{commentId:comment.id,reason:'Account required'},cookie:artist.cookie})).status,401);
  const responses=await Promise.all(reporters.map((u,i)=>api('/api/listener/comment-report',{cookie:u.cookie,body:{commentId:comment.id,reason:'Review reason '+i}})));assert(responses.every(r=>r.status===200));const saved=await current();assert.equal(saved.status,'held');assert.equal(saved.platform_hold,true);assert.equal(String(saved.moderation_revision),'3');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM comment_reports WHERE comment_id=$1 AND resolved_at IS NULL',[comment.id])).rows[0].n,3);assert.equal((await api('/api/listener/comment-report',{cookie:reporters[0].cookie,body:{commentId:comment.id,reason:'Duplicate reason'}})).status,409);
  assert(!(await api('/api/listener/comments?trackId='+track.id)).data.comments.some(c=>c.id===comment.id));
 });
 await t.test('artist ownership cannot bypass automatic or platform holds and another artist cannot moderate the comment',async()=>{
  assert.equal((await api('/api/artist/comment-moderation',{cookie:artist.cookie,body:{commentId:comment.id,action:'approve'}})).status,403);
  assert.equal((await api('/api/artist/comment-moderation',{cookie:other.cookie,body:{commentId:comment.id,action:'hide'}})).status,404);assert.equal((await current()).status,'held');
  const login=await api('/api/admin/login',{body:{password:env.ADMIN_KEY}});assert.equal(login.status,200);admin=login.cookie;
  const queue=await api('/api/platform/admin/moderation',{cookie:admin});assert.equal(queue.status,200);const shown=queue.data.comments.find(c=>c.id===comment.id);assert.equal(shown.author,'CI Guest Reviewer');assert.equal(shown.reports_detail.length,3);assert(!JSON.stringify(shown.reports_detail).includes('reporter_id'));
  assert.equal((await api('/api/admin/comment-moderation',{cookie:admin,body:{commentId:comment.id,action:'delete'}})).status,410);assert(await current());
 });
 await t.test('failed audit persistence rolls comment visibility and report resolution back together',async()=>{
  const faulty={query:pool.query.bind(pool),connect:async()=>{const db=await pool.connect();return {release:()=>db.release(),query:async(sql,args)=>{if(sql.startsWith('INSERT INTO platform_audit')&&args[2]==='comment.approve')throw Error('isolated moderation audit failure');return db.query(sql,args);}};}};
  await assert.rejects(createModeration(faulty).moderate({type:'admin',id:'session'},{commentId:comment.id,revision:String((await current()).moderation_revision),action:'approve',note:'Fixture reviewed carefully.'},key()),/audit failure/);assert.equal((await current()).status,'held');assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM comment_reports WHERE comment_id=$1 AND resolved_at IS NULL',[comment.id])).rows[0].n,3);
 });
 await t.test('platform review is revision-checked and idempotent, resolves reports without deletion and restores public visibility',async()=>{
  const body={commentId:comment.id,revision:String((await current()).moderation_revision),action:'approve',note:'Reviewed all fixture report context.'},requestKey=key();
  assert.equal((await api('/api/platform/admin/moderation/comment',{cookie:admin,key:key(),body:{...body,revision:'0'}})).status,409);
  const a=await api('/api/platform/admin/moderation/comment',{cookie:admin,key:requestKey,body}),b=await api('/api/platform/admin/moderation/comment',{cookie:admin,key:requestKey,body});assert.equal(a.status,200);assert.deepEqual(a.data,b.data);assert.equal((await current()).platform_hold,false);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM comment_reports WHERE comment_id=$1 AND resolution=\'approved\'',[comment.id])).rows[0].n,3);assert((await api('/api/listener/comments?trackId='+track.id)).data.comments.some(c=>c.id===comment.id));
  await assert.rejects(pool.query("UPDATE comment_reports SET reason='tampered' WHERE comment_id=$1",[comment.id]),/append-only/);await assert.rejects(pool.query('DELETE FROM song_comments WHERE id=$1',[comment.id]),/cannot be deleted/);
 });
 await t.test('artists can hide and restore their own ordinary comments but cannot restore a platform-hidden comment',async()=>{
  const edit=async action=>api('/api/artist/comment-moderation',{cookie:artist.cookie,key:key(),body:{commentId:comment.id,revision:String((await current()).moderation_revision),action,note:'Owned fixture community review.'}});
  assert.equal((await edit('hide')).status,200);assert.equal((await current()).platform_hold,false);assert.equal((await edit('approve')).status,200);
  assert.equal((await api('/api/platform/admin/moderation/comment',{cookie:admin,key:key(),body:{commentId:comment.id,revision:String((await current()).moderation_revision),action:'hide',note:'Platform fixture review hold.'}})).status,200);assert.equal((await edit('approve')).status,403);
 });
 await t.test('competing reviewers cannot silently overwrite a review even when one action retains the same status',async()=>{
  const expected=String((await current()).moderation_revision);const results=await Promise.all(['approve','hide'].map(action=>api('/api/platform/admin/moderation/comment',{cookie:admin,key:key(),body:{commentId:comment.id,revision:expected,action,note:'Concurrent fixture review.'}})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(BigInt((await current()).moderation_revision),BigInt(expected)+1n);
 });
 await t.test('catalog complaints have auditable one-way review, preserve source records and can unpublish without deleting audio metadata',async()=>{
  const publicReport=await api('/api/music/tracks/'+track.id+'/report',{body:{reason:'Rights review',details:'Isolated complaint for moderation verification.'}});assert.equal(publicReport.status,200);const report=(await pool.query('SELECT * FROM music_reports WHERE track_id=$1 ORDER BY id DESC LIMIT 1',[track.id])).rows[0];
  const body={id:report.id,revision:'0',decision:'dismiss',note:'Fixture rights evidence reviewed.'},requestKey=key();const a=await api('/api/platform/admin/moderation/report',{cookie:admin,key:requestKey,body});assert.equal(a.status,200);assert.deepEqual((await api('/api/platform/admin/moderation/report',{cookie:admin,key:requestKey,body})).data,a.data);assert.equal((await pool.query('SELECT status FROM music_tracks WHERE id=$1',[track.id])).rows[0].status,'published');
  assert.equal((await api('/api/platform/admin/moderation/report',{cookie:admin,key:key(),body})).status,409);
  const next=(await pool.query("INSERT INTO music_reports(track_id,reason,details) VALUES($1,'Further rights review','Second isolated fixture record.') RETURNING id",[track.id])).rows[0];
  assert.equal((await api('/api/platform/admin/moderation/report',{cookie:artist.cookie,key:key(),body:{id:next.id,revision:'0',decision:'unpublish',note:'Unauthorized fixture review.'}})).status,401);
  assert.equal((await api('/api/platform/admin/moderation/report',{cookie:admin,key:key(),body:{id:next.id,revision:'0',decision:'unpublish',note:'Fixture catalog visibility review.'}})).status,200);const source=(await pool.query('SELECT status,audio_key FROM music_tracks WHERE id=$1',[track.id])).rows[0];assert.equal(source.status,'removed');assert.equal(source.audio_key,'isolated/moderation.mp3');
  await assert.rejects(pool.query("UPDATE music_reports SET reason='changed' WHERE id=$1",[report.id]),/append-only/);assert.equal((await pool.query('SELECT review_status FROM music_reports WHERE id=$1',[next.id])).rows[0].review_status,'unpublished');
  const audits=(await pool.query("SELECT action,actor_id FROM platform_audit WHERE resource=$1 AND action LIKE 'comment.%'",[String(comment.id)])).rows;assert(audits.some(a=>a.actor_id==='legacy-shared-key'&&a.action==='comment.approve'));
 });
};
