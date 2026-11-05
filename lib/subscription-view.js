'use strict';
const PLANS=require('./plans');
async function subscriptionView(pool,artistId,selectedPlan,env=process.env){
 const [active,history]=await Promise.all([
  pool.query("SELECT id,plan,amount_cents,starts_at,expires_at,included_generations,publish_track_limit FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' AND starts_at<=NOW() AND expires_at>NOW() AND NOT payment_hold ORDER BY expires_at DESC LIMIT 1",[artistId]),
  pool.query("SELECT id,plan,amount_cents,starts_at,expires_at,payment_hold,starts_at>NOW() AS upcoming FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' ORDER BY starts_at DESC LIMIT 50",[artistId])]);
 const sub=active.rows[0]||history.rows.find(s=>!s.upcoming)||null;
 const testAccess=require('./artist-test-access').enabled(env)&&!(history.rows.some(s=>new Date(s.expires_at)<=new Date())&&!active.rowCount);
 const acceptance=await require('./creator-agreement').accepted(pool,artistId);
 const plan=active.rows[0]?.plan||(Object.hasOwn(PLANS,selectedPlan)?selectedPlan:'starter');
 const extras=active.rows[0]?(await pool.query('SELECT COUNT(*)::int AS n FROM membership_generation_terms mt JOIN studio_purchased_credits p ON p.order_id=mt.order_id LEFT JOIN artist_studio_usage su ON su.purchase_order_id=p.order_id LEFT JOIN payment_refund_cases h ON h.order_id=p.order_id WHERE (mt.subscription_id=$1 OR su.subscription_id=$1) AND COALESCE(h.benefit_hold,FALSE)=FALSE',[active.rows[0].id])).rows[0].n:0;
 const count=await pool.query("SELECT COUNT(*)::int AS n FROM music_tracks WHERE creator_id=$1 AND status IN ('published','pending_upload') AND COALESCE(published_at,created_at)>=COALESCE($2::timestamptz,date_trunc('year',NOW()))",[artistId,active.rows[0]?.starts_at||null]);
 return {artist_test_access:testAccess,plan,annual_price_usd:PLANS[plan].usd,agreement_required:!acceptance,agreement_acceptance:acceptance,upload_limit:active.rows[0]?require('./membership-terms').allowance(active.rows[0]).tracks+extras*2:PLANS[plan].uploads,uploads_used:count.rows[0].n,studio_generations_included:active.rows[0]?require('./membership-terms').allowance(active.rows[0]).generations:PLANS[plan].studioGenerations,tracks_per_generation:2,additional_generation_price:require('./membership-terms').additionalPrice(plan),additional_generation_usd:require('./membership-terms').additionalPrice(plan).effective_usd,subscription:sub,upcoming_subscriptions:history.rows.filter(s=>s.upcoming),artist_features_active:!!active.rowCount||testAccess,expired:!!sub&&new Date(sub.expires_at)<=new Date(),demo:!sub,history:history.rows};
}
module.exports={subscriptionView};
