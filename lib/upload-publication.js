'use strict';
const {transaction,fail}=require('./transactions');
// Storage checks happen before this short transaction. Recheck the paid benefit
// under the same creator lock used by refund holds before making a track public.
async function publishUpload(pool,artistId,trackId){
 return transaction(pool,async db=>{
  await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[artistId]);
  await require('./music-upload-codes').requirePlan(db,artistId,{excludeTrackId:trackId});
  return db.query("UPDATE music_tracks SET status='published',published_at=NOW() WHERE id=$1 AND creator_id=$2 AND status='pending_upload' RETURNING id,creator_id,title,genre",[trackId,artistId]);
 });
}
module.exports={publishUpload};
