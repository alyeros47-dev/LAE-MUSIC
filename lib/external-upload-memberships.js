'use strict';
const crypto=require('node:crypto');
const {transaction,idempotent,fail,audit}=require('./transactions');
const config=require('../config/external-upload-packages.json');
const KIND='external_upload_subscription';
const HASH=value=>crypto.createHash('sha256').update(value).digest('hex');
const CODE=/^EX-[A-F0-9]{36}$/;
function quote(plan){const p=config.plans[plan];if(!p)throw fail(400,'Choose an external upload package.');return {kind:KIND,plan,currency:'USD',amount_minor:p.usd_minor,royalty_percent:50,direct_referral_percent:20,quantity:1,billing:'annual',intended_tracks:p.songs};}
const VALID=`m.status='paid' AND o.status='paid' AND m.starts_at<=NOW() AND m.expires_at>NOW()
 AND NOT EXISTS(SELECT 1 FROM payment_product_reversals x WHERE x.order_id=m.order_id)
 AND NOT EXISTS(SELECT 1 FROM payment_refund_cases x WHERE x.order_id=m.order_id AND x.status NOT IN('declined','refunded'))
 AND NOT EXISTS(SELECT 1 FROM refund_complaints c LEFT JOIN refund_complaint_reviews v ON v.complaint_id=c.id WHERE c.artist_order_id=m.order_id AND COALESCE(v.status,'under_review')<>'resolved_no_refund')`;
async function current(db,artistId,id=null){
 if(!db)throw fail(503,'External upload subscriptions are temporarily unavailable.');
 const row=(await db.query(`SELECT m.*,(SELECT COUNT(*)::int FROM external_upload_codes c WHERE c.membership_id=m.id AND c.consumed_at IS NOT NULL) AS used FROM external_upload_memberships m JOIN commerce_orders o ON o.id=m.order_id WHERE m.artist_id=$1 AND ($2::bigint IS NULL OR m.id=$2) AND ${VALID} ORDER BY m.expires_at DESC LIMIT 1`,[artistId,id])).rows[0];
 if(!row)throw fail(402,'Renew or purchase an external upload package to upload new songs.');return row;
}
async function status(db,artistId){
 let active=null;try{active=await current(db,artistId);}catch(e){if(e.status!==402)throw e;}
 const history=(await db.query('SELECT id,plan,song_limit,starts_at,expires_at,status FROM external_upload_memberships WHERE artist_id=$1 ORDER BY expires_at DESC LIMIT 50',[artistId])).rows;
 const codes=(await db.query(`SELECT c.id,c.track_id,c.consumed_at,c.created_at,t.title,t.status AS track_status,(SELECT r.result->>'uploadCode' FROM platform_requests r WHERE r.scope='external-code:'||c.artist_id::text AND r.result->>'id'=c.id::text LIMIT 1) AS upload_code FROM external_upload_codes c LEFT JOIN music_tracks t ON t.id=c.track_id WHERE c.artist_id=$1 ORDER BY c.created_at DESC LIMIT 100`,[artistId])).rows;
 const documents=(await db.query('SELECT id,filename,mime,status,submitted_at,reviewed_at,review_note FROM external_rights_documents WHERE artist_id=$1 ORDER BY submitted_at DESC LIMIT 50',[artistId])).rows;
 return {plans:config.plans,revision:config.revision,active_subscription:active,history,codes,remaining_uploads:active?Math.max(0,active.song_limit-active.used):0,rights:{version:config.rights_version,declaration:config.rights_declaration,documents,approved:documents.some(d=>d.status==='approved')},notice:'External upload packages do not include Studio generations. Published songs stay available after expiry. Rights documents must be approved before royalty withdrawals.'};
}
async function fulfill(db,order){
 const terms=(await db.query('SELECT song_limit FROM external_upload_order_terms WHERE order_id=$1',[order.id])).rows[0];if(!terms)throw fail(409,'External upload purchase terms are missing.');
 const now=(await db.query('SELECT NOW() AS now')).rows[0].now,last=(await db.query("SELECT MAX(expires_at) AS expires_at FROM external_upload_memberships WHERE artist_id=$1 AND status='paid' AND NOT EXISTS(SELECT 1 FROM payment_product_reversals r WHERE r.order_id=external_upload_memberships.order_id)",[order.artist_id])).rows[0].expires_at;
 const start=new Date(Math.max(new Date(now).getTime(),new Date(last||0).getTime())),end=require('./subscriptions').annualExpiry(start);
 await db.query('INSERT INTO external_upload_memberships(order_id,artist_id,plan,song_limit,starts_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[order.id,order.artist_id,order.plan,terms.song_limit,start,end]);
}
async function issue(pool,artistId,key){return transaction(pool,async db=>{
 await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[artistId]);
 return idempotent(db,'external-code:'+artistId,key,{},async()=>{
  const m=await current(db,artistId);if(m.used>=m.song_limit)throw fail(409,'You have used this package’s upload allowance.');
  const code='EX-'+crypto.randomBytes(18).toString('hex').toUpperCase(),id=crypto.randomUUID();
  await db.query('INSERT INTO external_upload_codes(id,artist_id,membership_id,code_hash) VALUES($1,$2,$3,$4)',[id,artistId,m.id,HASH(code)]);
  await audit(db,{type:'artist',id:artistId},'external.code.issue',id,{membership_id:String(m.id)});
  return {id,uploadCode:code,remaining_uploads:m.song_limit-m.used,expires_at:m.expires_at};
 });
});}
async function codeStatus(db,artistId,code){
 if(!CODE.test(code))throw fail(400,'Enter your external song upload code.');
 const c=(await db.query('SELECT c.*,t.title,t.status AS track_status FROM external_upload_codes c LEFT JOIN music_tracks t ON t.id=c.track_id WHERE c.artist_id=$1 AND c.code_hash=$2',[artistId,HASH(code)])).rows[0];
 if(!c)throw fail(404,'This code was not issued to your account.');
 return {valid:!c.consumed_at,used:!!c.consumed_at,published:!!c.consumed_at,resumable:!!c.track_id&&!c.consumed_at,track_id:c.track_id,title:c.title||'',external:true};
}
async function trackAccess(db,artistId,trackId,{allowConsumed=false}={}){
 const c=(await db.query('SELECT * FROM external_upload_codes WHERE artist_id=$1 AND track_id=$2',[artistId,trackId])).rows[0];if(!c)return null;
 if(c.consumed_at){if(allowConsumed)return c;throw fail(409,'This upload code has already been used.');}
 const m=await current(db,artistId,c.membership_id);if(m.used>=m.song_limit)throw fail(409,'Your external upload allowance is full.');return c;
}
async function reserve(db,artistId,data){
 const c=(await db.query('SELECT * FROM external_upload_codes WHERE artist_id=$1 AND code_hash=$2 FOR UPDATE',[artistId,data.codeHash])).rows[0];
 if(!c||c.consumed_at)throw fail(409,'This external upload code is invalid, used or belongs to another account.');
 const m=await current(db,artistId,c.membership_id);if(m.used>=m.song_limit)throw fail(409,'Your external upload allowance is full.');
 if(!/^[a-f0-9]{64}$/.test(data.audioSha256||''))throw fail(400,'The recording checksum is required. Choose the audio file again.');
 if(c.audio_sha256&&c.audio_sha256!==data.audioSha256)throw fail(409,'This code is already linked to another recording. Use its original file or generate a new code.');
 let id=c.track_id;
 if(id){
  const t=(await db.query('SELECT status FROM music_tracks WHERE id=$1 AND creator_id=$2 FOR UPDATE',[id,artistId])).rows[0];if(!t||t.status!=='pending_upload')throw fail(409,'This upload is no longer pending.');
  // Every retry receives fresh object keys, isolating older in-flight uploads.
  await db.query("UPDATE music_tracks SET title=$3,genre=$4,description=$5,audio_key=$6,cover_key=$7,audio_mime=$8,audio_bytes=$9,cover_mime=$10,rights_confirmed_at=NOW() WHERE id=$1 AND creator_id=$2",[id,artistId,data.title,data.genre,data.description,data.audioKey,data.coverKey,data.audioMime,data.audioBytes,data.coverMime||null]);
 }else{
  id=(await db.query('INSERT INTO music_tracks(creator_id,title,genre,description,audio_key,cover_key,audio_mime,audio_bytes,cover_mime,rights_confirmed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING id',[artistId,data.title,data.genre,data.description,data.audioKey,data.coverKey,data.audioMime,data.audioBytes,data.coverMime||null])).rows[0].id;
  await db.query('UPDATE external_upload_codes SET track_id=$2,audio_sha256=$3 WHERE id=$1',[c.id,id,data.audioSha256]);
 }
 await db.query('INSERT INTO external_upload_rights_declarations(code_id,artist_id,version,declaration) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[c.id,artistId,config.rights_version,config.rights_declaration]);
 return {id,resumed:!!c.track_id};
}
async function consume(db,artistId,trackId){const c=await trackAccess(db,artistId,trackId);if(!c)return;await db.query('UPDATE external_upload_codes SET consumed_at=NOW() WHERE id=$1 AND consumed_at IS NULL',[c.id]);}
async function verifyBytes(db,artistId,trackId,input,length){
 const c=await trackAccess(db,artistId,trackId);if(!c)return null;
 const chunks=[];let size=0;for await(const chunk of input){size+=chunk.length;if(size>length||size>30*1024*1024)throw fail(413,'The audio file is too large.');chunks.push(Buffer.from(chunk));}
 const bytes=Buffer.concat(chunks);if(size!==length||HASH(bytes)!==c.audio_sha256)throw fail(400,'Upload the original recording linked to this external code.');return bytes;
}
async function requireRightsApproval(db,artistId){
 const external=(await db.query('SELECT 1 FROM external_upload_codes WHERE artist_id=$1 AND consumed_at IS NOT NULL LIMIT 1',[artistId])).rowCount;
 if(!external)return;
 const approved=(await db.query("SELECT 1 FROM external_rights_documents WHERE artist_id=$1 AND status='approved' LIMIT 1",[artistId])).rowCount;
 const disputed=(await db.query("SELECT 1 FROM external_upload_codes c JOIN music_reports r ON r.track_id=c.track_id WHERE c.artist_id=$1 AND r.review_status IN('open','unpublished') LIMIT 1",[artistId])).rowCount;
 if(!approved||disputed)throw fail(428,disputed?'A reported song needs rights review before royalty withdrawal.':'Submit your external music rights documents for approval before royalty withdrawal.');
}
module.exports={KIND,CODE,config,quote,current,status,fulfill,issue,codeStatus,trackAccess,reserve,consume,verifyBytes,requireRightsApproval,HASH};
