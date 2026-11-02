'use strict';
const PLANS=require('./plans');
async function subscriptionView(pool,artistId,selectedPlan,env=process.env){
 const [active,history]=await Promise.all([
  pool.query("SELECT id,plan,amount_cents,starts_at,expires_at FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' AND starts_at<=NOW() AND expires_at>NOW() AND NOT payment_hold ORDER BY expires_at DESC LIMIT 1",[artistId]),
  pool.query("SELECT id,plan,amount_cents,starts_at,expires_at,payment_hold,starts_at>NOW() AS upcoming FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' ORDER BY starts_at DESC LIMIT 50",[artistId])]);
 const sub=active.rows[0]||history.rows.find(s=>!s.upcoming)||null;
 const plan=active.rows[0]?.plan||(Object.hasOwn(PLANS,selectedPlan)?selectedPlan:'starter');
 const count=await pool.query("SELECT COUNT(*)::int AS n FROM music_tracks WHERE creator_id=$1 AND status IN ('published','pending_upload') AND created_at>=COALESCE($2::timestamptz,date_trunc('year',NOW()))",[artistId,active.rows[0]?.starts_at||null]);
 return {artist_test_access:require('./artist-test-access').enabled(env),plan,annual_price_usd:PLANS[plan].usd,upload_limit:PLANS[plan].uploads,uploads_used:count.rows[0].n,studio_generations_included:PLANS[plan].studioGenerations,tracks_per_generation:2,additional_generation_usd:PLANS[plan].additionalGenerationUsd,subscription:sub,upcoming_subscriptions:history.rows.filter(s=>s.upcoming),artist_features_active:!!active.rowCount||require('./artist-test-access').enabled(env),expired:!!sub&&new Date(sub.expires_at)<=new Date(),demo:!sub,history:history.rows};
}
module.exports={subscriptionView};
