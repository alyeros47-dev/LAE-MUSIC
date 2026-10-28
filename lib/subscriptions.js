'use strict';
const PLANS=require('./plans');
const {fail}=require('./transactions');
async function recordVerifiedProductReferral(client,subscriptionId,artistId,plan,referrerId,amountMinor=PLANS[plan]?.usd*100,percent=PLANS[plan]?.directReferralPercent,lineage=undefined){
 if(!PLANS[plan]||!Number.isSafeInteger(Number(referrerId))||Number(referrerId)===Number(artistId))return;
 const check=await client.query('SELECT id,referred_by FROM creators WHERE id=$1',[referrerId]);
 if(!check.rowCount)return;
 const cents=Number(amountMinor);
 if(!Number.isSafeInteger(cents)||cents<1||![15,25].includes(percent))throw fail(400,'Invalid commission basis.');
 const direct=Math.round(cents*percent/100);
 await client.query("INSERT INTO affiliate_subscription_commissions(subscription_id,referrer_id,referred_artist_id,tier,amount_cents,status) VALUES($1,$2,$3,1,$4,'pending') ON CONFLICT(subscription_id,tier) DO NOTHING",[subscriptionId,referrerId,artistId,direct]);
 const leader=lineage===undefined?check.rows[0].referred_by:lineage.team_leader_id;
 if(leader&&Number(leader)!==Number(referrerId)&&Number(leader)!==Number(artistId)){
  await client.query("INSERT INTO affiliate_team_sales(subscription_id,affiliate_id,team_leader_id,base_amount_cents,quarter_start) VALUES($1,$2,$3,$4,date_trunc('quarter',NOW())::date) ON CONFLICT(subscription_id) DO NOTHING",[subscriptionId,referrerId,leader,cents]);
 }
}

// The caller must hold the creator lock and supply independently verified purchase evidence.
async function fulfillSubscription(db,order,reference) {
 const last=await db.query("SELECT MAX(expires_at) AS expires_at FROM artist_subscriptions WHERE artist_id=$1 AND status='paid'",[order.artist_id]);
 const now=(await db.query('SELECT NOW() AS now')).rows[0].now;
 const start=new Date(Math.max(new Date(now).getTime(),new Date(last.rows[0].expires_at||0).getTime()));
 const expiry=new Date(start);expiry.setUTCFullYear(expiry.getUTCFullYear()+1);
 const inserted=await db.query("INSERT INTO artist_subscriptions(artist_id,plan,amount_cents,payment_reference,status,starts_at,expires_at) VALUES($1,$2,$3,$4,'paid',$5,$6) RETURNING id",[order.artist_id,order.plan,order.amount_minor,reference,start,expiry]);
 const id=inserted.rows[0].id;
 const referralSnapshot=(await db.query('SELECT direct_referrer_id,team_leader_id FROM commerce_order_referral_snapshots WHERE order_id=$1',[order.id])).rows[0];
 if(order.referral_intent_id){
  const intent=await db.query('SELECT referrer_id FROM affiliate_product_intents WHERE id=$1 AND buyer_id=$2 AND plan=$3 AND consumed_at IS NULL FOR UPDATE',[order.referral_intent_id,order.artist_id,order.plan]);
  if(!intent.rowCount)throw fail(409,'The purchase referral was already consumed.');
  await recordVerifiedProductReferral(db,id,order.artist_id,order.plan,intent.rows[0].referrer_id,Number(order.amount_minor),order.direct_referral_percent,referralSnapshot);
  await db.query('UPDATE affiliate_product_intents SET consumed_at=NOW(),subscription_id=$2 WHERE id=$1',[order.referral_intent_id,id]);
 }
 if(!order.referral_intent_id&&referralSnapshot?.direct_referrer_id)await recordVerifiedProductReferral(db,id,order.artist_id,order.plan,referralSnapshot.direct_referrer_id,Number(order.amount_minor),order.direct_referral_percent,referralSnapshot);
 // A future renewal must not change the currently active package.
 const active=await db.query("SELECT plan FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' AND starts_at<=NOW() AND expires_at>NOW() AND NOT payment_hold ORDER BY expires_at DESC LIMIT 1",[order.artist_id]);
 if(active.rowCount)await db.query("UPDATE creators SET plan=$1,membership_status='active' WHERE id=$2",[active.rows[0].plan,order.artist_id]);
 return id;
}
module.exports={fulfillSubscription,recordVerifiedProductReferral};
