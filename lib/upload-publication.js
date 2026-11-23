'use strict';
const {transaction,fail}=require('./transactions');
// Storage checks happen before this short transaction. Recheck the paid or generation-bound complimentary benefit
// under the same creator lock used by refund holds before making a track public.
async function publishUpload(pool,artistId,trackId,verifiedFiles=null){
 return transaction(pool,async db=>{
  await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[artistId]);
  await require('./music-upload-codes').trackAuthorization(db,artistId,trackId);
  const track=(await db.query('SELECT rights_confirmed_at,audio_key,audio_mime,audio_bytes,cover_key,cover_mime FROM music_tracks WHERE id=$1 AND creator_id=$2 FOR UPDATE',[trackId,artistId])).rows[0];
  if(!track?.rights_confirmed_at)throw fail(400,'Confirm the rights declaration by resuming your Studio upload.');
  // A retry can correct a pending file declaration while storage checks run.
  // Publish only the exact files the HTTP handler has just verified.
  if(verifiedFiles&&(['audio_key','audio_mime','cover_key','cover_mime'].some(k=>(track[k]||null)!==(verifiedFiles[k]||null))||Number(track.audio_bytes)!==Number(verifiedFiles.audio_bytes)))throw fail(409,'Your upload changed while it was being checked. Retry Upload & publish with the same song and code.');
  await require('./music-upload-codes').requireUploadAccess(db,artistId,{excludeTrackId:trackId});
  const published=await db.query("UPDATE music_tracks SET status='published',published_at=NOW() WHERE id=$1 AND creator_id=$2 AND status='pending_upload' RETURNING id,creator_id,title,genre",[trackId,artistId]);
  if(published.rowCount)await require('./external-upload-memberships').consume(db,artistId,trackId);
  return published;
 });
}
module.exports={publishUpload};
