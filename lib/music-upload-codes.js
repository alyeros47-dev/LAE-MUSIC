'use strict';
const crypto=require('node:crypto');
const {transaction,idempotent,digest,fail}=require('./transactions');
const media=require('./media-download');
const scope=id=>'music-upload:'+id;
// Uses the existing durable idempotency store; no new database or environment keys.
async function issue({pool,provider,artistId,taskId,clipId,download,env=process.env}){
 if(!/^[a-zA-Z0-9_-]{8,128}$/.test(taskId)||taskId.startsWith('sonic-')||!/^[a-zA-Z0-9_-]{8,128}$/.test(clipId))throw fail(400,'Choose a completed song.');
 const key=digest({taskId,clipId}),payload={taskId,clipId};
 const previous=await pool.query('SELECT result FROM platform_requests WHERE scope=$1 AND request_key=$2',[scope(artistId),key]);
 if(previous.rowCount)return previous.rows[0].result;
 const owned=await pool.query("SELECT task_id FROM sonic_test_tasks WHERE task_id=$1 AND creator_id=$2 AND status='succeeded'",[taskId,artistId]);
 if(!owned.rowCount)throw fail(403,'Only your successfully completed songs can receive an upload code.');
 const song=(await provider.clips(taskId)).find(s=>s.clip_id===clipId);
 if(!song)throw fail(409,'This song does not belong to the completed generation.');
 const get=download||media.createMediaDownloader({hosts:require('./studio-output').mediaHosts(env)});
 const audio=await get(song.audio_url,'audio'),audioSha256=crypto.createHash('sha256').update(audio.bytes).digest('hex');
 return transaction(pool,async db=>{
  await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[artistId]);
  return idempotent(db,scope(artistId),key,payload,async()=>{
   await assertUnpublished(db,artistId,taskId,clipId);
   const code=crypto.randomBytes(18).toString('hex').toUpperCase();
   const saved=await db.query('INSERT INTO generation_records(creator_id,code_hash,model,title,lyrics,style) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[artistId,crypto.createHash('sha256').update(code).digest('hex'),'musicapi-sonic',String(song.title||'Generated song'),'[Completed audio: '+taskId+'/'+clipId+']','Completed platform-generated audio']);
   return {uploadCode:code,generation_id:String(saved.rows[0].id),task_id:taskId,clip_id:clipId,title:String(song.title||'Generated song'),audio_sha256:audioSha256};
  });
 });
}
async function assertUnpublished(db,artistId,taskId,clipId){
 const published=await db.query("SELECT id FROM studio_releases WHERE artist_id=$1 AND task_id=$2 AND clip_id=$3 AND status='published'",[artistId,taskId,clipId]);
 if(published.rowCount)throw fail(409,'This generated song has already been published.');
 const used=await db.query("SELECT g.id FROM platform_requests r JOIN generation_records g ON g.id=(r.result->>'generation_id')::bigint WHERE r.scope=$1 AND r.result->>'task_id'=$2 AND r.result->>'clip_id'=$3 AND g.used_at IS NOT NULL",[scope(artistId),taskId,clipId]);
 if(used.rowCount)throw fail(409,'This song already has an upload reserved or published. Reopen that upload instead.');
}
async function consumeForRelease(db,artistId,taskId,clipId,trackId){
 await db.query("UPDATE generation_records SET used_at=NOW(),generated_track_id=$4 WHERE creator_id=$1 AND id IN (SELECT (result->>'generation_id')::bigint FROM platform_requests WHERE scope=$2 AND result->>'task_id'=$3 AND result->>'clip_id'=$5) AND used_at IS NULL",[artistId,scope(artistId),taskId,trackId,clipId]);
}
async function authorization(db,artistId,generationId){
 const q=await db.query("SELECT result FROM platform_requests WHERE scope=$1 AND result->>'generation_id'=$2",[scope(artistId),String(generationId)]);
 if(!q.rowCount)throw fail(403,'This legacy lyrics code is not an audio authorization. Open a completed song in the studio to obtain its upload code.');
 return q.rows[0].result;
}
async function verifyUploaded({pool,artistId,trackId,url,fetcher=fetch}){
 const record=await pool.query('SELECT id FROM generation_records WHERE creator_id=$1 AND generated_track_id=$2 AND used_at IS NOT NULL',[artistId,trackId]);
 if(!record.rowCount)return; // Existing external-upload path is governed by its paid artist plan.
 const permit=await authorization(pool,artistId,record.rows[0].id);
 const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw fail(502,'Could not verify the uploaded recording.');
 const bytes=await media.readBounded(response,media.AUDIO_LIMIT);
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==permit.audio_sha256)throw fail(400,'The audio does not match the generated song authorized by this code. Upload the original generated file.');
}
async function verifiedUploadBody({pool,artistId,trackId,input,length}){
 const record=await pool.query('SELECT id FROM generation_records WHERE creator_id=$1 AND generated_track_id=$2 AND used_at IS NOT NULL',[artistId,trackId]);
 if(!record.rowCount)return input;
 const permit=await authorization(pool,artistId,record.rows[0].id),chunks=[];let size=0;
 for await(const chunk of input){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>length||size>media.AUDIO_LIMIT)throw fail(413,'Generated audio exceeds the authorized upload size.');chunks.push(bytes);}
 if(size!==length)throw fail(400,'The generated audio upload was incomplete.');
 const bytes=Buffer.concat(chunks,size);
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==permit.audio_sha256)throw fail(400,'Upload the original generated recording authorized by this code.');
 // Verify before PUT, so an earlier in-flight upload cannot replace checked audio
 // with unrelated bytes after the publication transaction commits.
 return bytes;
}
async function requirePlan(db,artistId,{excludeTrackId=null}={}){
 const current=await db.query("SELECT id,plan,starts_at FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' AND starts_at<=NOW() AND expires_at>NOW() AND NOT payment_hold ORDER BY expires_at DESC LIMIT 1",[artistId]);
 if(!current.rowCount)throw fail(403,'A verified active artist package is required to publish or upload. Generating a song does not include publishing entitlement.');
 const count=await db.query("SELECT COUNT(*)::int AS n FROM music_tracks WHERE creator_id=$1 AND status IN ('published','pending_upload') AND created_at>=$2 AND ($3::bigint IS NULL OR id<>$3)",[artistId,current.rows[0].starts_at,excludeTrackId]);
 const allowance=require('./plans')[current.rows[0].plan]?.uploads||0;
 if(count.rows[0].n>=allowance)throw fail(409,'Your annual upload allowance is full. Your generated songs remain saved.');
 return current.rows[0];
}
module.exports={issue,authorization,verifyUploaded,verifiedUploadBody,requirePlan,assertUnpublished,consumeForRelease};
