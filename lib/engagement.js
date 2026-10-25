'use strict';
const crypto=require('node:crypto');
const {fail,transaction,idempotent}=require('./transactions');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function viewerIdentity(req,res,listener){
 if(listener)return {key:hash('listener:'+listener.id),listenerId:listener.id};
 let token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('lae_guest='))?.slice(10);
 if(!/^[a-f0-9]{64}$/.test(token||'')){token=crypto.randomBytes(32).toString('hex');const old=res.getHeader?.('Set-Cookie');res.setHeader('Set-Cookie',[...(old?Array.isArray(old)?old:[old]:[]),'lae_guest='+token+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000']);}
 return {key:hash('guest:'+token),listenerId:null};
}
function analyticsDays(value){const days=String(value||'30');if(!['7','30','90'].includes(days))throw fail(400,'Choose a 7, 30 or 90 day reporting period.');return Number(days);}
function createEngagement(pool){
 async function record(trackId,viewer,requestKey){
  if(!/^[1-9][0-9]{0,15}$/.test(String(trackId))||!/^[a-f0-9]{64}$/.test(viewer?.key||''))throw fail(400,'Invalid play record.');
  const integrated=requestKey!==undefined;const key=integrated?requestKey:crypto.randomUUID();
  return transaction(pool,db=>idempotent(db,'music-play:'+viewer.key,key,{track_id:String(trackId)},async()=>{
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['play:'+viewer.key+':'+trackId]);
   const track=(await db.query("SELECT id,creator_id FROM music_tracks WHERE id=$1 AND status='published' FOR SHARE",[trackId])).rows[0];if(!track)throw fail(404,'This song is unavailable.');
   const gate=await db.query("INSERT INTO music_play_gates(track_id,viewer_key) VALUES($1,$2) ON CONFLICT(track_id,viewer_key) DO UPDATE SET last_counted_at=clock_timestamp() WHERE music_play_gates.last_counted_at<=clock_timestamp()-INTERVAL '60 seconds' RETURNING track_id",[trackId,viewer.key]);
   if(!gate.rowCount)return {ok:true,counted:false,history_recorded:false};
   await db.query('INSERT INTO music_play_events(track_id,artist_id,listener_id,viewer_key,source) VALUES($1,$2,$3,$4,$5)',[trackId,track.creator_id,viewer.listenerId,viewer.key,integrated?'player':'legacy']);
   await db.query('UPDATE music_tracks SET plays=plays+1 WHERE id=$1',[trackId]);
   if(integrated&&viewer.listenerId)await db.query('INSERT INTO listener_history(listener_id,track_id) VALUES($1,$2) ON CONFLICT(listener_id,track_id) DO UPDATE SET last_played=NOW(),play_count=listener_history.play_count+1',[viewer.listenerId,trackId]);
   return {ok:true,counted:true,history_recorded:!!(integrated&&viewer.listenerId)};
  }));
 }
 async function report(artistId,days=30){days=analyticsDays(days);const [daily,tracks,summary]=await Promise.all([
  pool.query("WITH dates AS (SELECT generate_series((NOW() AT TIME ZONE 'UTC')::date-($2::int-1),(NOW() AT TIME ZONE 'UTC')::date,INTERVAL '1 day')::date AS day), totals AS (SELECT (received_at AT TIME ZONE 'UTC')::date AS day,COUNT(*)::int AS plays,COUNT(DISTINCT viewer_key)::int AS audience_identities FROM music_play_events WHERE artist_id=$1 AND received_at>=(((NOW() AT TIME ZONE 'UTC')::date-($2::int-1))::timestamp AT TIME ZONE 'UTC') GROUP BY 1) SELECT to_char(d.day,'YYYY-MM-DD') AS day,COALESCE(t.plays,0)::int AS plays,COALESCE(t.audience_identities,0)::int AS audience_identities FROM dates d LEFT JOIN totals t USING(day) ORDER BY d.day",[artistId,days]),
  pool.query("SELECT t.id,t.title,t.genre,t.status,t.plays AS lifetime_plays,COUNT(e.id)::int AS period_plays,COUNT(DISTINCT e.viewer_key)::int AS audience_identities FROM music_tracks t LEFT JOIN music_play_events e ON e.track_id=t.id AND e.received_at>=(((NOW() AT TIME ZONE 'UTC')::date-($2::int-1))::timestamp AT TIME ZONE 'UTC') WHERE t.creator_id=$1 GROUP BY t.id ORDER BY period_plays DESC,t.id DESC LIMIT 100",[artistId,days]),
  pool.query("SELECT COUNT(*)::int AS recorded_plays,COUNT(DISTINCT viewer_key)::int AS audience_identities,COUNT(*) FILTER(WHERE listener_id IS NOT NULL)::int AS listener_plays,COUNT(*) FILTER(WHERE listener_id IS NULL)::int AS guest_plays,MIN(received_at) AS first_recorded_at FROM music_play_events WHERE artist_id=$1 AND received_at>=(((NOW() AT TIME ZONE 'UTC')::date-($2::int-1))::timestamp AT TIME ZONE 'UTC')",[artistId,days])]);
  return {days,time_zone:'UTC',summary:summary.rows[0],daily:daily.rows,tracks:tracks.rows,royalty_funding_enabled:false,notice:'Recorded plays use browser playback signals and server-side duplicate protection. Audience identities represent signed-in accounts or browser identities, not verified individual people. Dated events start with this release; lifetime counters include earlier activity. These statistics do not establish payable royalties.'};
 }
 return {record,report};
}
function analyticsCsv(report){const cell=value=>{let text=String(value??'');if(/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};return [['Song ID','Song','Genre','Recorded plays in period','Audience identities','Lifetime plays'],...report.tracks.map(t=>[t.id,t.title,t.genre,t.period_plays,t.audience_identities,t.lifetime_plays])].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';}
module.exports={createEngagement,viewerIdentity,analyticsDays,analyticsCsv};
