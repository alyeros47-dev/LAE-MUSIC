'use strict';
const {fail}=require('./transactions');
const LIMIT=200;
// Complimentary promotional tracks must not consume the subsequently purchased
// annual package's track slots. Both upload paths retain generation provenance.
const paidTracksOnly="NOT EXISTS(SELECT 1 FROM generation_records g JOIN platform_requests r ON r.scope='music-upload:'||g.creator_id::text AND r.result->>'generation_id'=g.id::text JOIN artist_free_music_usage f ON f.artist_id=g.creator_id AND f.task_reference=r.result->>'task_id' AND f.access_kind='promotion' AND f.status='completed' WHERE g.creator_id=t.creator_id AND g.generated_track_id=t.id)";
async function owner(db,id){return !!db&&(await db.query('SELECT 1 FROM artist_owner_access WHERE artist_id=$1',[id])).rowCount>0;}
async function state(db,id){
 if(!db)return {owner_unlimited:false,promotion:false,remaining_generations:0};
 const q=await db.query("SELECT EXISTS(SELECT 1 FROM artist_owner_access WHERE artist_id=$1) AS owner_unlimited,EXISTS(SELECT 1 FROM artist_launch_grants WHERE artist_id=$1) AS promotion,EXISTS(SELECT 1 FROM artist_free_music_usage WHERE artist_id=$1 AND access_kind='promotion' AND status IN ('reserved','completed')) AS promotion_used",[id]);
 const row=q.rows[0]||{},owner_unlimited=row.owner_unlimited===true,promotion=row.promotion===true;
 return {owner_unlimited,promotion,remaining_generations:owner_unlimited?null:promotion&&row.promotion_used!==true?1:0};
}
async function open(db){
 if(!db)return false;
 return (await db.query('SELECT allocated<capacity AS open FROM artist_launch_campaign WHERE singleton')).rows[0]?.open===true;
}
async function allowance(db,id){
 const s=await state(db,id);if(!s.owner_unlimited&&!s.promotion)return null;
 return {...s,active:true,plan:null,included_generations:s.owner_unlimited?null:1,used_generations:s.owner_unlimited?null:1-s.remaining_generations,unlimited:s.owner_unlimited,tracks_per_generation:2,studio_integration_active:true,notice:s.owner_unlimited?'Owner access: unlimited music generation and publishing.':s.remaining_generations?'Your free generation makes two tracks. Both can be published without a package.':'Your free generation has been used. Choose an artist package to generate more music; you can still publish your two free tracks.'};
}
// Caller owns the creator lock and transaction. No paid balances or commissions
// are manufactured by either of these complimentary access paths.
async function reserve(db,id,reference){
 const s=await state(db,id),kind=s.owner_unlimited?'owner':s.promotion&&s.remaining_generations?'promotion':null;
 if(!kind)return null;
 await db.query('INSERT INTO artist_free_music_usage(reservation_reference,artist_id,access_kind) VALUES($1,$2,$3)',[reference,id,kind]);
 return kind;
}
async function attach(db,id,reference,task){return db.query("UPDATE artist_free_music_usage SET task_reference=$3,updated_at=NOW() WHERE artist_id=$1 AND reservation_reference=$2 AND status='reserved' AND task_reference IS NULL RETURNING artist_id AS id",[id,reference,task]);}
async function settle(db,id,reference,status){
 if(!['completed','restored'].includes(status))throw Error('Invalid complimentary generation state');
 return db.query("UPDATE artist_free_music_usage SET status=$3,updated_at=NOW() WHERE artist_id=$1 AND (reservation_reference=$2 OR task_reference=$2) AND status='reserved' RETURNING artist_id",[id,reference,status]);
}
async function promotionalTask(db,id,task){return (await db.query("SELECT 1 FROM artist_free_music_usage a JOIN sonic_test_tasks t ON t.task_id=a.task_reference AND t.creator_id=a.artist_id WHERE a.artist_id=$1 AND a.task_reference=$2 AND a.access_kind='promotion' AND a.status='completed' AND t.status='succeeded'",[id,task])).rowCount>0;}
async function publication(db,id,task,{excludeTrackId=null}={}){
 if(await owner(db,id))return {owner_unlimited:true};
 if(!await promotionalTask(db,id,task))return null;
 const q=await db.query("SELECT COUNT(*)::int AS n FROM music_tracks t WHERE t.creator_id=$1 AND t.status IN ('pending_upload','published') AND ($3::bigint IS NULL OR t.id<>$3) AND (EXISTS(SELECT 1 FROM generation_records g JOIN platform_requests r ON r.scope=$4 AND r.result->>'generation_id'=g.id::text WHERE g.creator_id=$1 AND g.generated_track_id=t.id AND r.result->>'task_id'=$2) OR EXISTS(SELECT 1 FROM studio_releases s WHERE s.artist_id=$1 AND s.task_id=$2 AND s.track_id=t.id))",[id,task,excludeTrackId,'music-upload:'+id]);
 if(q.rows[0].n>=2)throw fail(403,'Both tracks from your free generation have already been uploaded. Choose an artist package for more music.');
 return {promotional_generated_upload:true};
}
module.exports={LIMIT,paidTracksOnly,owner,state,open,allowance,reserve,attach,settle,promotionalTask,publication};
