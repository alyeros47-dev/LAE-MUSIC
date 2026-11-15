'use strict';
// One owner-authorized email typo correction. No passwords, tokens, addresses or
// connection credentials are printed. Current passwords and artist IDs are retained.
const crypto=require('node:crypto'),{inventory}=require('./audit-existing-service.cjs'),{transaction,idempotent,audit}=require('../lib/transactions'),roles=require('../lib/account-roles');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
async function correct({pool,confirmed,nameDigest,oldDigest,newDigest,fromSuffix,toSuffix}={}){
 if(confirmed!==true||![nameDigest,oldDigest,newDigest].every(v=>/^[a-f0-9]{64}$/.test(v||''))||!/^\d{3}$/.test(fromSuffix||'')||!/^\d{3}$/.test(toSuffix||'')||fromSuffix===toSuffix)throw Error('An explicit bounded owner correction is required');
 const operation=sha([nameDigest,oldDigest,newDigest].join(':'));
 return transaction(pool,db=>idempotent(db,'owner.artist-email-correction',operation,{nameDigest,oldDigest,newDigest},async()=>{
  const found=await db.query("SELECT id,email FROM creators WHERE encode(sha256(convert_to(regexp_replace(lower(btrim(display_name)),'[[:space:]]','','g'),'UTF8')),'hex')=$1 AND encode(sha256(convert_to(email,'UTF8')),'hex')=$2",[nameDigest,oldDigest]);if(found.rowCount!==1)throw Error('The approved existing artist is not uniquely identifiable');
  const artist=found.rows[0],before=artist.email,target=before.replace(new RegExp(fromSuffix+'(?=@gmail\\.com$)'),toSuffix);if(target===before||sha(target)!==newDigest)throw Error('The correction does not match the approved destination');
  for(const email of [before,target].sort())await roles.emailLock(db,email);
  const group=await roles.members(db,'artist',artist.id),snapshots=[];
  for(const member of group){const cfg=roles.roleConfig(member.role),r=(await db.query('SELECT id,email,encode(sha256(convert_to(password_salt||\':\'||password_hash,\'UTF8\')),\'hex\') AS credential_digest FROM '+cfg.table+' WHERE id=$1 FOR UPDATE',[member.id])).rows[0];if(!r||r.email!==before)throw Error('A linked identity changed; correction cancelled');snapshots.push({...member,credential_digest:r.credential_digest});}
  for(const role of ['artist','listener']){const cfg=roles.roleConfig(role),existing=await db.query('SELECT id FROM '+cfg.table+' WHERE lower(btrim(email))=$1',[target]);if(existing.rowCount)throw Error('The corrected email already belongs to an account; no accounts were merged');}
  const musicBefore=(await db.query('SELECT COUNT(*)::int AS tracks FROM music_tracks WHERE creator_id=$1',[artist.id])).rows[0].tracks;
  for(const member of snapshots){const cfg=roles.roleConfig(member.role),changed=await db.query('UPDATE '+cfg.table+' SET email=$1,email_verified_at=NULL WHERE id=$2 AND email=$3',[target,member.id,before]);if(changed.rowCount!==1)throw Error('Concurrent account change; correction cancelled');
   await db.query('DELETE FROM '+cfg.sessions+' WHERE '+cfg.owner+'=$1',[member.id]);
   await db.query('UPDATE account_action_tokens SET consumed_at=NOW() WHERE '+cfg.owner+'=$1 AND consumed_at IS NULL',[member.id]);
   await db.query("UPDATE account_email_outbox SET status='skipped',finished_at=NOW() WHERE status='queued' AND token_hash IN (SELECT token_hash FROM account_action_tokens WHERE "+cfg.owner+'=$1)',[member.id]);
   const after=(await db.query('SELECT id,email,encode(sha256(convert_to(password_salt||\':\'||password_hash,\'UTF8\')),\'hex\') AS credential_digest FROM '+cfg.table+' WHERE id=$1',[member.id])).rows[0];if(after.email!==target||after.credential_digest!==member.credential_digest)throw Error('Credential preservation check failed');
  }
  const musicAfter=(await db.query('SELECT COUNT(*)::int AS tracks FROM music_tracks WHERE creator_id=$1',[artist.id])).rows[0].tracks;if(musicBefore!==musicAfter)throw Error('Artist music records changed; correction cancelled');
  // The corrected address may have exhausted recovery attempts while it did not
  // match an account. Clear only its three email-specific reset-request buckets.
  await db.query('DELETE FROM account_security_rates WHERE bucket=ANY($1::text[])',[[...['account','artist','listener'].map(role=>sha('email-request:'+role+':reset_password:'+target))]]);
  await audit(db,{type:'maintenance',id:'owner-explicit-instruction'},'account.email.correct',String(artist.id),{reason:'Owner confirmed a three-digit Gmail registration typo',previous_email:before,corrected_email:target,password_changed:false,linked_roles:group.map(x=>x.role)});
  return {status:'corrected',artist_identity_preserved:true,password_unchanged:true,music_records_preserved:true,profiles_corrected:group.length,old_reset_links_invalidated:true};
 }));
}
async function main(){
 if(process.env.LAE_OWNER_CONFIRMED_EMAIL_CORRECTION!=='true')throw Error('Owner confirmation is required');
 const key=process.env.RENDER_API_KEY,SERVICE='srv-db84s7m89jmc73c7l9rg';if(!key)throw Error('Service access unavailable');
 const get=async suffix=>{const r=await fetch('https://api.render.com/v1/services/'+SERVICE+suffix,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Service read failed');return r.json();};
 const service=await get('');if(service.id!==SERVICE||service.repo?.replace(/\.git$/,'')!=='https://github.com/alyeros47-dev/LAE-MUSIC'||service.serviceDetails?.url!=='https://lae-music.onrender.com')throw Error('Unexpected service');
 const rows=[];let cursor='';for(let i=0;i<10;i++){const page=await get('/env-vars?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));rows.push(...page);if(page.length<100)break;cursor=page.at(-1)?.cursor;if(!cursor)throw Error('Incomplete settings');}
 const pool=new(require('pg').Pool)({...require('../lib/database').databaseOptions(inventory(rows)),max:1});try{return await correct({pool,confirmed:true,nameDigest:'8ddfe828cf4de3dc45ff9ea9a681ddf56353825e57a51311a53291585a57b786',oldDigest:'e6cd0bcdd66d0653af28f79af623311086fd13a787d0a3e5c29f854582381366',newDigest:'c92fb0ea2aff7d605555c15e3f48dc0b8a0da3755db097bd6b24f68815eb4323',fromSuffix:'188',toSuffix:'118'});}finally{await pool.end();}
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{console.error('The email correction did not complete. No password was changed and no private values are shown.');process.exitCode=1;});
module.exports={correct};
