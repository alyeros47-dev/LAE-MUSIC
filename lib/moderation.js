'use strict';
const {fail,transaction,idempotent,audit,requestKey}=require('./transactions');
const identifier=value=>{if(!/^[1-9][0-9]{0,15}$/.test(String(value)))throw fail(400,'Invalid moderation reference.');return String(value);};
function revision(value,optional=false){if(value===undefined&&optional)return null;if(!/^(0|[1-9][0-9]{0,15})$/.test(String(value)))throw fail(400,'Refresh the moderation record before saving.');return String(value);}
function note(value,legacy=false){if(value===undefined&&legacy)return 'Reviewed using the legacy moderation interface.';if(typeof value!=='string'||value.trim().length<3||value.length>800||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw fail(400,'Enter a review note of 3–800 characters.');return value.trim();}
const fields=`cm.id,cm.track_id,cm.body,cm.status,cm.platform_hold,cm.moderation_revision,cm.created_at,cm.moderation_updated_at,t.title AS song,c.display_name AS artist,COALESCE(l.display_name,cm.guest_name,'Guest listener') AS author,
 (SELECT COUNT(*)::int FROM comment_reports r WHERE r.comment_id=cm.id AND r.resolved_at IS NULL) AS pending_reports,
 (SELECT COUNT(*)::int FROM comment_reports r WHERE r.comment_id=cm.id) AS reports,
 CASE WHEN $1::bigint IS NULL THEN COALESCE((SELECT jsonb_agg(detail ORDER BY report_id DESC) FROM (SELECT r.id AS report_id,jsonb_build_object('reason',r.reason,'created_at',r.created_at,'resolved_at',r.resolved_at,'resolution',r.resolution) AS detail FROM comment_reports r WHERE r.comment_id=cm.id ORDER BY r.id DESC LIMIT 20) recent),'[]'::jsonb) ELSE '[]'::jsonb END AS reports_detail`;
function createModeration(pool){
 async function comments(artistId=null){const q=await pool.query(`SELECT ${fields} FROM song_comments cm JOIN music_tracks t ON t.id=cm.track_id JOIN creators c ON c.id=t.creator_id LEFT JOIN listeners l ON l.id=cm.listener_id WHERE ($1::bigint IS NULL AND (cm.status<>'visible' OR EXISTS(SELECT 1 FROM comment_reports r WHERE r.comment_id=cm.id AND r.resolved_at IS NULL))) OR t.creator_id=$1 ORDER BY cm.id DESC LIMIT 200`,[artistId]);return {comments:q.rows};}
 async function overview(){const [items,reports]=await Promise.all([comments(),pool.query('SELECT r.id,r.track_id,r.reason,r.details,r.created_at,r.review_status,r.review_revision,r.resolution_note,r.resolved_at,t.title,t.status,c.display_name AS artist FROM music_reports r JOIN music_tracks t ON t.id=r.track_id JOIN creators c ON c.id=t.creator_id ORDER BY (r.review_status=\'open\') DESC,r.id DESC LIMIT 200')]);return {...items,reports:reports.rows};}
 async function report(listenerId,input){const id=identifier(input?.commentId),reason=note(input?.reason);if(reason.length>200)throw fail(400,'Use a report reason up to 200 characters.');return transaction(pool,async db=>{
  const cm=(await db.query("SELECT cm.id,cm.status FROM song_comments cm JOIN music_tracks t ON t.id=cm.track_id WHERE cm.id=$1 AND t.status='published' FOR UPDATE OF cm",[id])).rows[0];if(!cm||cm.status!=='visible')throw fail(409,'This comment is no longer available for reporting.');
  const inserted=await db.query('INSERT INTO comment_reports(comment_id,reporter_id,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',[id,listenerId,reason]);if(!inserted.rowCount)throw fail(409,'You already reported this comment.');
  const count=(await db.query('SELECT COUNT(*)::int AS n FROM comment_reports WHERE comment_id=$1 AND resolved_at IS NULL',[id])).rows[0].n;
  await db.query("UPDATE song_comments SET moderation_revision=moderation_revision+1,moderation_updated_at=NOW(),status=CASE WHEN $2::int>=3 THEN 'held' ELSE status END,platform_hold=CASE WHEN $2::int>=3 THEN TRUE ELSE platform_hold END WHERE id=$1",[id,count]);
  await audit(db,{type:'listener',id:listenerId},'comment.report',id);return {ok:true,message:'Report received'};
 });}
 async function moderate(actor,input,key,{legacy=false}={}){const id=identifier(input?.commentId),expected=revision(input?.revision,legacy),action=input?.action;
  if(action==='delete')throw fail(410,'Permanent deletion is unavailable. Hide the comment to preserve moderation history.');
  if(!['approve','hide'].includes(action))throw fail(400,'Choose approve or hide.');const reviewNote=actor.type==='artist'&&input?.note===undefined?'Artist review of an owned comment.':note(input?.note,legacy);if(!legacy)requestKey(key);
  return transaction(pool,async db=>{const apply=async()=>{
   const cm=(await db.query('SELECT cm.*,t.creator_id FROM song_comments cm JOIN music_tracks t ON t.id=cm.track_id WHERE cm.id=$1 FOR UPDATE OF cm',[id])).rows[0];if(!cm||actor.type==='artist'&&String(cm.creator_id)!==String(actor.id))throw fail(404,'Comment unavailable.');
   if(expected!==null&&String(cm.moderation_revision)!==expected)throw fail(409,'This comment changed. Refresh before reviewing it.');
   if(actor.type==='artist'&&action==='approve'){
    const q=await db.query('SELECT COUNT(*)::int AS n FROM comment_reports WHERE comment_id=$1 AND resolved_at IS NULL',[id]);if(cm.platform_hold||cm.status==='held'||q.rows[0].n>=3)throw fail(403,'This comment requires platform review before it can be restored.');
   }
   const target=action==='approve'?'visible':'hidden',hold=actor.type==='admin'?action==='hide':cm.platform_hold;
   const updated=await db.query('UPDATE song_comments SET status=$2,platform_hold=$3,moderation_revision=moderation_revision+1,moderation_updated_at=NOW() WHERE id=$1 RETURNING id,status,platform_hold,moderation_revision',[id,target,hold]);
   if(actor.type==='admin')await db.query('UPDATE comment_reports SET resolved_at=NOW(),resolution=$2 WHERE comment_id=$1 AND resolved_at IS NULL',[id,action==='approve'?'approved':'hidden']);
   await audit(db,actor,'comment.'+action,id,{previous_status:cm.status,status:target,note:reviewNote});return {ok:true,comment:updated.rows[0]};
  };return key?idempotent(db,'moderation:'+actor.type+':'+(actor.type==='artist'?actor.id:'operators'),key,{id,revision:expected,action,note:reviewNote},apply):apply();
 });}
 async function reviewReport(input,key){const id=identifier(input?.id),expected=revision(input?.revision),decision=input?.decision,reviewNote=note(input?.note);if(!['dismiss','unpublish'].includes(decision))throw fail(400,'Choose dismiss or unpublish.');
  return transaction(pool,db=>idempotent(db,'catalog-report-review',key,{id,revision:expected,decision,note:reviewNote},async()=>{
   const r=(await db.query('SELECT * FROM music_reports WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!r)throw fail(404,'Report unavailable.');if(r.review_status!=='open'||String(r.review_revision)!==expected)throw fail(409,'This report was already reviewed. Refresh before saving.');
   if(decision==='unpublish')await db.query("UPDATE music_tracks SET status='removed' WHERE id=$1 AND status<>'removed'",[r.track_id]);
   const saved=await db.query('UPDATE music_reports SET review_status=$2,review_revision=review_revision+1,resolution_note=$3,resolved_at=NOW() WHERE id=$1 RETURNING id,review_status,review_revision',[id,decision==='dismiss'?'dismissed':'unpublished',reviewNote]);
   await audit(db,{type:'admin',id:'session'},'catalog.report.'+decision,id,{track_id:String(r.track_id),note:reviewNote});return {ok:true,report:saved.rows[0]};
  }));
 }
 return {comments,overview,report,moderate,reviewReport};
}
module.exports={createModeration,identifier,revision,note};
