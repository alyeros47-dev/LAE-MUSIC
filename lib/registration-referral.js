'use strict';
const {fail}=require('./transactions');

// Existing verified attribution takes precedence. Registration attribution is
// the fallback, shared only across explicitly connected account roles.
async function registered(db,{artistId=null,listenerId=null}={}){
 const r=await db.query(`WITH identities AS (
 SELECT $1::bigint AS artist_id,$2::bigint AS listener_id
 UNION SELECT artist_id,listener_id FROM account_role_links WHERE artist_id=$1 OR listener_id=$2
 ), referrals AS (
 SELECT referred_by,0 AS priority FROM creators WHERE id IN(SELECT artist_id FROM identities)
 UNION ALL SELECT referred_by,1 FROM listeners WHERE id IN(SELECT listener_id FROM identities)
 ) SELECT referred_by FROM referrals WHERE referred_by IS NOT NULL ORDER BY priority LIMIT 1`,[artistId,listenerId]);
 return r.rows[0]?.referred_by||null;
}
async function resolve(db,{artistId=null,listenerId=null,email,ref=null,mode='live'}={}){
 const value=String(ref||'').trim();
 if(value&&(!/^[1-9][0-9]{0,15}$/.test(value)||!Number.isSafeInteger(Number(value))))throw fail(400,'Check your referral code.');
 const original=artistId||listenerId?await require('./affiliate-framework').originalReferrer(db,{artistId,listenerId,mode}):null;
 const chosen=original?.referrer_id||(artistId||listenerId?await registered(db,{artistId,listenerId}):null)||value;
 if(!chosen)return null;
 const sponsor=(await db.query('SELECT id,email FROM creators WHERE id=$1',[chosen])).rows[0];
 const linkedArtist=listenerId?(await db.query('SELECT artist_id FROM account_role_links WHERE listener_id=$1',[listenerId])).rows[0]?.artist_id:null;
 if(!sponsor||String(sponsor.id)===String(artistId||linkedArtist)||sponsor.email.trim().toLowerCase()===String(email).trim().toLowerCase())throw fail(400,'Use a valid referral code from another member.');
 return sponsor.id;
}
module.exports={registered,resolve};
