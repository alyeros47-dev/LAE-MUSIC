'use strict';
const {fail,transaction}=require('./transactions');
function notificationId(value){if(typeof value!=='string'||!/^[1-9][0-9]{0,18}$/.test(value)||BigInt(value)>9223372036854775807n)throw fail(400,'Invalid notification reference.');return value;}
function inboxOptions(search){const before=search.get('before'),unread=search.get('unread');if(unread!==null&&!['0','1'].includes(unread))throw fail(400,'Choose a valid notification filter.');return {before:before?notificationId(before):null,unread:unread==='1'};}
const reminderSQL=`WITH terms AS (
 SELECT DISTINCT ON (artist_id) id,artist_id,plan,expires_at FROM artist_subscriptions
 WHERE status='paid' AND NOT payment_hold AND expires_at IS NOT NULL AND starts_at<=NOW() AND ($1::bigint IS NULL OR artist_id=$1)
 ORDER BY artist_id,expires_at DESC,id DESC
), due AS (
 SELECT s.*,CASE WHEN expires_at<=NOW() THEN 'expired' WHEN expires_at<=NOW()+INTERVAL '1 day' THEN '1' WHEN expires_at<=NOW()+INTERVAL '7 days' THEN '7' ELSE '30' END AS milestone
 FROM terms s WHERE expires_at>NOW()-INTERVAL '7 days' AND expires_at<=NOW()+INTERVAL '30 days'
 AND NOT EXISTS(SELECT 1 FROM artist_subscriptions future WHERE future.artist_id=s.artist_id AND future.status='paid' AND NOT future.payment_hold AND future.starts_at<=s.expires_at AND future.expires_at>s.expires_at)
)
INSERT INTO artist_notifications(artist_id,source_key,kind,title,message,destination,event_at)
SELECT artist_id,'subscription:'||id||':'||milestone||':'||EXTRACT(EPOCH FROM expires_at)::bigint,'subscription',
 CASE WHEN milestone='expired' THEN 'Your artist subscription expired' ELSE 'Your artist subscription expires soon' END,
 INITCAP(plan)||' term ends '||TO_CHAR(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI')||' UTC. '||
 CASE WHEN milestone='expired' THEN 'Review your subscription to renew artist services. Public listening and existing account records remain available.' ELSE 'Review your subscription and renewal options. This reminder does not renew your package or charge your account.' END,
 '/workspace?tab=plans',NOW() FROM due ON CONFLICT(artist_id,source_key) DO NOTHING RETURNING id`;
function createArtistNotifications({pool,env=process.env}={}){
 let timer=null,busy=false;
 async function remind(artistId=null){return transaction(pool,async db=>{if(artistId===null){const lock=await db.query("SELECT pg_try_advisory_xact_lock(hashtext('lae-artist-subscription-notices')) AS acquired");if(!lock.rows[0].acquired)return 0;}return (await db.query(reminderSQL,[artistId])).rowCount;});}
 async function list(artistId,options={}){if(options.before)notificationId(options.before);await remind(artistId);const [items,count]=await Promise.all([
  pool.query('SELECT id,kind,title,message,destination,event_at,created_at,read_at FROM artist_notifications WHERE artist_id=$1 AND ($2::bigint IS NULL OR id<$2) AND (NOT $3::boolean OR read_at IS NULL) ORDER BY id DESC LIMIT 61',[artistId,options.before||null,options.unread===true]),
  pool.query('SELECT COUNT(*)::int AS unread FROM artist_notifications WHERE artist_id=$1 AND read_at IS NULL',[artistId])
 ]);const notifications=items.rows.slice(0,60);return {notifications,unread:count.rows[0].unread,next_before:items.rows.length>60?String(notifications.at(-1).id):null};}
 async function read(artistId,through){notificationId(through);const q=await pool.query('UPDATE artist_notifications SET read_at=NOW() WHERE artist_id=$1 AND id<=$2 AND read_at IS NULL',[artistId,through]);return {ok:true,acknowledged:q.rowCount};}
 async function health(){const q=await pool.query("SELECT kind,COUNT(*)::int AS records,COUNT(*) FILTER(WHERE read_at IS NULL)::int AS unread,MAX(created_at) AS latest_at FROM artist_notifications GROUP BY kind ORDER BY kind");return {channel:'in_app',external_delivery_enabled:false,scheduled_reminders:!!timer,groups:q.rows};}
 const tick=async()=>{if(busy)return;busy=true;try{await remind();}catch{console.error('Artist subscription reminders require attention');}finally{busy=false;}};
 return {list,read,remind,health,start(){if(!pool||timer||env.ARTIST_NOTIFICATION_WORKER_ENABLED==='false'||!['production','staging'].includes(env.NODE_ENV))return;timer=setInterval(tick,15*60000);timer.unref?.();void tick();},stop(){clearInterval(timer);timer=null;}};
}
module.exports={createArtistNotifications,notificationId,inboxOptions};
