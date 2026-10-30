'use strict';
const crypto=require('node:crypto');
const {fail,transaction,idempotent,audit,requestKey,digest}=require('./transactions');
const {allowedHosts,createMediaDownloader}=require('./media-download');
const PLANS=require('./plans'); // External-upload contradictions remain documented; total annual quotas are unchanged.
const view='id,task_id,clip_id,title,genre,description,status,track_id,audio_bytes,cover_mime,warnings,failure_code,attempts,created_at,updated_at';
function releaseInput(data) {
  const value={task_id:String(data.task_id||''),clip_id:String(data.clip_id||''),title:String(data.title||'').trim(),genre:String(data.genre||'').trim(),description:String(data.description||'').trim()};
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(value.task_id)||value.task_id.startsWith('sonic-')||!/^[a-zA-Z0-9_-]{8,128}$/.test(value.clip_id))throw fail(400,'Choose a completed generation and one of its songs.');
  if(value.title.length<2||value.title.length>140||!value.genre||value.genre.length>60||value.description.length>800)throw fail(400,'Check the song title, genre and description.');
  if(data.rightsConfirmed!==true)throw fail(400,'Confirm that you have permission to release this song.');
  return value;
}
function createStudioReleases({pool,store,provider,env=process.env,download,onPublished,heartbeatMs=30000}) {
  let timer,busy=false,stopped=false;
  function hosts(){return allowedHosts(env.GENERATED_MEDIA_ALLOWED_HOSTS);}
  function availability(){return env.STUDIO_RELEASE_WORKER_ENABLED!=='false'&&!!pool&&!!store?.configured()&&!!provider?.configured()&&hosts().size>0;}
  async function owned(artistId,id,db=pool) {const q=await db.query(`SELECT ${view},artist_id,audio_key,audio_mime,cover_key,cover_mime,audio_sha256 FROM studio_releases WHERE id=$1 AND artist_id=$2`,[id,artistId]);if(!q.rowCount)throw fail(404,'Your studio release was not found.');return q.rows[0];}
  async function clip(artistId,taskId,clipId) {
    const q=await pool.query("SELECT task_id FROM sonic_test_tasks WHERE task_id=$1 AND creator_id=$2 AND status='succeeded'",[taskId,artistId]);
    if(!q.rowCount)throw fail(404,'A completed generation owned by this artist is required.');
    const tracks=await provider.clips(taskId);const selected=tracks.find(t=>t.clip_id===clipId);
    if(!selected)throw fail(409,'This song is not part of that completed generation.');return selected;
  }
  async function create(artistId,key,data) {
    const input=releaseInput(data);requestKey(key);
    const previous=await pool.query('SELECT payload_hash,result FROM platform_requests WHERE scope=$1 AND request_key=$2',['studio-release:'+artistId,key]);
    if(previous.rowCount){if(previous.rows[0].payload_hash!==digest(input))throw fail(409,'This request key was already used for different details.');const row=await pool.query(`SELECT ${view} FROM studio_releases WHERE id=$1 AND artist_id=$2`,[previous.rows[0].result.id,artistId]);if(!row.rowCount)throw fail(404,'Your studio release was not found.');return row.rows[0];}
    const known=await pool.query('SELECT id FROM studio_releases WHERE artist_id=$1 AND task_id=$2 AND clip_id=$3',[artistId,input.task_id,input.clip_id]);
    if(!known.rowCount){if(!availability())throw fail(503,'Saving studio releases is not available yet. No new generation was requested.');await clip(artistId,input.task_id,input.clip_id);}
    return transaction(pool,async db=>{
      await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[artistId]);
      return idempotent(db,'studio-release:'+artistId,key,input,async()=>{
        const existing=await db.query(`SELECT ${view} FROM studio_releases WHERE artist_id=$1 AND task_id=$2 AND clip_id=$3`,[artistId,input.task_id,input.clip_id]);
        if(existing.rowCount)return existing.rows[0];
        const q=await db.query(`INSERT INTO studio_releases(artist_id,task_id,clip_id,title,genre,description,rights_confirmed_at) VALUES($1,$2,$3,$4,$5,$6,NOW()) RETURNING ${view}`,[artistId,input.task_id,input.clip_id,input.title,input.genre,input.description]);
        await audit(db,{type:'artist',id:artistId},'studio.release.create',String(q.rows[0].id),{task_id:input.task_id,clip_id:input.clip_id});return q.rows[0];
      });
    });
  }
  async function list(artistId){return (await pool.query(`SELECT ${view},(SELECT status FROM music_tracks WHERE id=studio_releases.track_id) AS catalog_status FROM studio_releases WHERE artist_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,[artistId])).rows;}
  async function retry(artistId,id) {
    if(!availability())throw fail(503,'Saving studio releases is temporarily unavailable.');
    const q=await pool.query(`UPDATE studio_releases SET status='queued',failure_code=NULL,updated_at=NOW() WHERE id=$1 AND artist_id=$2 AND status='failed' RETURNING ${view}`,[id,artistId]);
    if(!q.rowCount)throw fail(409,'Only your failed imports can be retried.');return q.rows[0];
  }
  async function claim() {
    return transaction(pool,async db=>{
      const q=await db.query("SELECT * FROM studio_releases WHERE status='queued' OR (status='copying' AND lease_until<NOW()) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1");
      if(!q.rowCount)return null;
      const token=crypto.randomUUID();return (await db.query("UPDATE studio_releases SET status='copying',lease_token=$2,lease_until=NOW()+INTERVAL '3 minutes',attempts=attempts+1,failure_code=NULL,updated_at=NOW() WHERE id=$1 RETURNING *",[q.rows[0].id,token])).rows[0];
    });
  }
  async function processNext() {
    if(!availability())return false;
    const job=await claim();if(!job)return false;
    const heartbeat=setInterval(()=>{pool.query("UPDATE studio_releases SET lease_until=NOW()+INTERVAL '3 minutes' WHERE id=$1 AND lease_token=$2 AND status='copying'",[job.id,job.lease_token]).catch(()=>{});},heartbeatMs);heartbeat.unref?.();
    try {
      const selected=await clip(job.artist_id,job.task_id,job.clip_id);
      const get=download||createMediaDownloader({hosts:hosts()});
      const audio=await get(selected.audio_url,'audio');
      const audioKey=`studio-releases/${job.artist_id}/${job.id}/${job.lease_token}.${audio.extension}`;
      await store.put(audioKey,audio);
      let coverKey=null,coverMime=null;const warnings=[];
      if(selected.image_url)try{const art=await get(selected.image_url,'art');coverKey=`studio-releases/${job.artist_id}/${job.id}/${job.lease_token}-cover.${art.extension}`;await store.put(coverKey,art);coverMime=art.mime;}catch{coverKey=null;warnings.push('Artwork could not be copied. Your audio is saved and you can use the default artwork.');}
      const checksum=crypto.createHash('sha256').update(audio.bytes).digest('hex');
      // An expired worker cannot replace the result of a newer lease. Unique object keys prevent overwrites.
      await pool.query("UPDATE studio_releases SET status='ready',audio_key=$3,audio_mime=$4,audio_bytes=$5,audio_sha256=$6,cover_key=$7,cover_mime=$8,warnings=$9,lease_token=NULL,lease_until=NULL,updated_at=NOW() WHERE id=$1 AND lease_token=$2 AND status='copying'",[job.id,job.lease_token,audioKey,audio.mime,audio.bytes.length,checksum,coverKey,coverMime,JSON.stringify(warnings)]);
    }catch(error){
      // Never delete media after an uncertain database commit: it may already back a ready release.
      await pool.query("UPDATE studio_releases SET status='failed',failure_code=$3,lease_token=NULL,lease_until=NULL,updated_at=NOW() WHERE id=$1 AND lease_token=$2 AND status='copying'",[job.id,job.lease_token,error.status===413?'file_too_large':error.status===415?'unsupported_audio':error.status===422?'media_host_unapproved':'copy_failed']);
    }finally{clearInterval(heartbeat);}
    return true;
  }
  async function edit(artistId,id,data) {
    const title=String(data.title||'').trim(),genre=String(data.genre||'').trim(),description=String(data.description||'').trim();
    if(title.length<2||title.length>140||!genre||genre.length>60||description.length>800)throw fail(400,'Check the song title, genre and description.');
    const q=await pool.query(`UPDATE studio_releases SET title=$3,genre=$4,description=$5,updated_at=NOW() WHERE id=$1 AND artist_id=$2 AND status<>'published' RETURNING ${view}`,[id,artistId,title,genre,description]);if(!q.rowCount)throw fail(409,'Edit a private draft before publishing.');return q.rows[0];
  }
  async function publish(artistId,id,key,rightsConfirmed) {
    if(rightsConfirmed!==true)throw fail(400,'Confirm that you have permission to publish this song.');
    return transaction(pool,async db=>{
      await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[artistId]);
      return idempotent(db,'studio-publish:'+artistId,key,{id:String(id)},async()=>{
        const q=await db.query('SELECT * FROM studio_releases WHERE id=$1 AND artist_id=$2 FOR UPDATE',[id,artistId]),job=q.rows[0];
        if(!job)throw fail(404,'Your studio release was not found.');
        if(job.status==='published')return {track_id:job.track_id,release_id:job.id};
        if(job.status!=='ready')throw fail(409,'Wait until your audio has been saved before publishing.');
        await require('./music-upload-codes').requirePlan(db,artistId);
        await require('./music-upload-codes').assertUnpublished(db,artistId,job.task_id,job.clip_id);
        const track=await db.query("INSERT INTO music_tracks(creator_id,title,genre,description,audio_key,audio_mime,audio_bytes,cover_key,cover_mime,status,published_at,rights_confirmed_at,studio_release_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'published',NOW(),NOW(),$10) RETURNING id",[artistId,job.title,job.genre,job.description,job.audio_key,job.audio_mime,job.audio_bytes,job.cover_key,job.cover_mime,job.id]);
        await require('./music-upload-codes').consumeForRelease(db,artistId,job.task_id,job.clip_id,track.rows[0].id);
        await db.query("UPDATE studio_releases SET status='published',track_id=$2,updated_at=NOW() WHERE id=$1",[id,track.rows[0].id]);
        await db.query('INSERT INTO catalog_release_events(track_id,artist_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[track.rows[0].id,artistId]);
        await audit(db,{type:'artist',id:artistId},'studio.release.publish',String(id),{track_id:track.rows[0].id});
        return {track_id:track.rows[0].id,release_id:job.id};
      });
    });
  }
  async function preview(artistId,id) {const job=await owned(artistId,id);if(!['ready','published'].includes(job.status))throw fail(409,'The audio is not ready yet.');return {url:await store.signed(job.audio_key),expires_in:300};}
  async function downloadSaved(artistId,id){const job=await owned(artistId,id);if(!['ready','published'].includes(job.status))throw fail(409,'Wait until your audio is saved.');if(!store.read)throw fail(503,'Saved file delivery is unavailable.');return {...await store.read(job.audio_key,'audio'),title:job.title};}
  async function artwork(artistId,id){const job=await owned(artistId,id);if(!['ready','published'].includes(job.status)||!job.cover_key)throw fail(404,'Artwork is not available for this release.');return {url:await store.signed(job.cover_key)};}
  async function deliverEvents() {
    // In-app delivery is idempotent; network push is best-effort and never controls publication success.
    return transaction(pool,async db=>{
      const q=await db.query("SELECT e.track_id,e.artist_id,t.title,t.genre FROM catalog_release_events e JOIN music_tracks t ON t.id=e.track_id WHERE e.delivered_at IS NULL AND t.status='published' ORDER BY e.created_at FOR UPDATE OF e SKIP LOCKED LIMIT 1");
      if(!q.rowCount)return null;const t=q.rows[0];
      await db.query('INSERT INTO listener_notifications(listener_id,track_id,artist_id) SELECT listener_id,$1,$2 FROM listener_favorite_artists WHERE artist_id=$2 ON CONFLICT DO NOTHING',[t.track_id,t.artist_id]);
      await db.query('UPDATE catalog_release_events SET delivered_at=NOW() WHERE track_id=$1',[t.track_id]);return t;
    }).then(async event=>{if(event&&onPublished)try{await onPublished({id:event.track_id,creator_id:event.artist_id,title:event.title,genre:event.genre});}catch{}return !!event;});
  }
  async function tick(){if(busy||stopped||!pool)return;busy=true;try{await processNext();await deliverEvents();}catch{console.error('Studio release worker could not complete this pass.');}finally{busy=false;}}
  function start(){if(!pool||timer||env.STUDIO_RELEASE_WORKER_ENABLED==='false')return;stopped=false;timer=setInterval(tick,4000);timer.unref?.();void tick();}
  function stop(){stopped=true;clearInterval(timer);timer=null;}
  return {availability,create,list,retry,processNext,edit,publish,preview,artwork,downloadSaved,deliverEvents,start,stop};
}
module.exports={createStudioReleases,releaseInput};
