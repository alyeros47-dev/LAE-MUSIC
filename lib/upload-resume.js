'use strict';
const crypto=require('node:crypto');
const {fail}=require('./transactions');
const codes=require('./music-upload-codes');
async function checkCode(pool,artistId,code){
 const hash=crypto.createHash('sha256').update(code).digest('hex');
 const q=await pool.query('SELECT g.id,g.title,g.used_at,g.generated_track_id,t.status AS track_status FROM generation_records g LEFT JOIN music_tracks t ON t.id=g.generated_track_id AND t.creator_id=g.creator_id WHERE g.creator_id=$1 AND g.code_hash=$2',[artistId,hash]);
 if(!q.rowCount)throw fail(404,'Code not found for this artist.');
 const g=q.rows[0];await codes.authorization(pool,artistId,g.id);
 const resumed=!!g.used_at&&g.track_status==='pending_upload',published=g.track_status==='published';
 return {valid:!published&&(!g.used_at||resumed),generated_song_id:g.id,title:g.title,used:!!g.used_at,resumable:resumed,published,track_id:g.generated_track_id||null};
}
// Caller owns the transaction and creator lock. A code reserves exactly one draft;
// retrying resumes that draft, while a published/removed release stays one-use.
async function reserve(db,artistId,data){
 const q=await db.query('SELECT id,title,used_at,generated_track_id FROM generation_records WHERE creator_id=$1 AND code_hash=$2 FOR UPDATE',[artistId,data.codeHash]);
 if(!q.rowCount)throw fail(409,'Upload code is invalid or belongs to another artist.');
 const g=q.rows[0];const permit=await codes.authorization(db,artistId,g.id);
 if(g.title.trim().toLowerCase()!==data.title.trim().toLowerCase())throw fail(400,'Keep the original generated song title.');
 if(g.used_at){
  const previous=await db.query('SELECT id,status,audio_mime,audio_bytes,cover_mime FROM music_tracks WHERE id=$1 AND creator_id=$2 FOR UPDATE',[g.generated_track_id,artistId]);
  const track=previous.rows[0];
  if(!track||track.status!=='pending_upload')throw fail(409,'This song is already published or no longer has a pending upload. Open your music catalog.');
  await codes.requireUploadAccess(db,artistId,{generationId:g.id,excludeTrackId:track.id});
  if(track.audio_mime!==data.audioMime||Number(track.audio_bytes)!==data.audioBytes||(track.cover_mime||'')!==(data.coverMime||''))throw fail(409,'Resume with the original audio and artwork file formats. Your existing upload and code remain reserved.');
  await db.query("UPDATE music_tracks SET genre=$3,description=$4 WHERE id=$1 AND creator_id=$2 AND status='pending_upload'",[track.id,artistId,data.genre,data.description]);
  return {id:track.id,resumed:true};
 }
 await codes.requireUploadAccess(db,artistId,{generationId:g.id});
 await codes.assertUnpublished(db,artistId,permit.task_id,permit.clip_id);
 const made=await db.query('INSERT INTO music_tracks(creator_id,title,genre,description,audio_key,cover_key,audio_mime,audio_bytes,cover_mime) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[artistId,data.title,data.genre,data.description,data.audioKey,data.coverKey,data.audioMime,data.audioBytes,data.coverMime||null]);
 const id=made.rows[0].id;
 await db.query('UPDATE generation_records SET used_at=NOW(),generated_track_id=$1 WHERE id=$2 AND used_at IS NULL',[id,g.id]);
 return {id,resumed:false};
}
module.exports={checkCode,reserve};
