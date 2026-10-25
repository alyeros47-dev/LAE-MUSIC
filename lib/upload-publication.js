'use strict';
const {transaction,fail}=require('./transactions');
// Storage checks happen before this short transaction. Recheck the paid benefit
// under the same creator lock used by refund holds before making a track public.
async function publishUpload(pool,artistId,trackId){
 return transaction(pool,async db=>{
  await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[artistId]);
  const active=await db.query("SELECT id FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' AND starts_at<=NOW() AND expires_at>NOW() AND NOT payment_hold LIMIT 1",[artistId]);
  if(!active.rowCount){
   // Preserve the existing, separately funded generated-song code permission.
   const permit=await db.query('SELECT id FROM generation_records WHERE creator_id=$1 AND generated_track_id=$2 AND used_at IS NOT NULL',[artistId,trackId]);
   if(!permit.rowCount)throw fail(403,'Your publishing benefit is unavailable or held for payment review.');
  }
  return db.query("UPDATE music_tracks SET status='published',published_at=NOW() WHERE id=$1 AND creator_id=$2 AND status='pending_upload' RETURNING id,creator_id,title,genre",[trackId,artistId]);
 });
}
module.exports={publishUpload};
