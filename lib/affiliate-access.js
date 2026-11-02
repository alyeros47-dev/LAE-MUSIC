'use strict';
// Marketing/commission eligibility is independent of artist tools and Premium playback.
// Only verified same-book purchases qualify; account links, never email matching,
// connect a listener purchase to their affiliate identity.
const {fail}=require('./transactions');
const QUALIFYING=`WITH purchases AS (
 SELECT 'artist_subscription'::text AS product,o.id AS order_id,o.plan,r.verified_at,
 r.verified_at+INTERVAL '1 year' AS expires_at
 FROM artist_subscriptions s JOIN commerce_orders o ON o.subscription_id=s.id AND o.artist_id=s.artist_id
 JOIN commerce_receipts r ON r.order_id=o.id JOIN payment_presentments p ON p.order_id=o.id
 WHERE s.artist_id=$1 AND s.status='paid' AND NOT s.payment_hold AND o.status='paid'
 AND o.currency='USD' AND r.amount_minor=o.amount_minor AND o.kind='artist_subscription' AND o.plan IN('starter','growth','professional') AND r.currency='USD' AND r.amount_minor>=600
 AND p.mode=$3 AND p.base_currency='USD' AND p.base_minor=r.amount_minor AND p.payment_id=r.payment_id AND p.provider=r.provider AND p.merchant_id=r.merchant_id
 AND NOT EXISTS(SELECT 1 FROM refund_complaints c LEFT JOIN refund_complaint_reviews v ON v.complaint_id=c.id WHERE c.artist_order_id=o.id AND COALESCE(v.status,'under_review')<>'resolved_no_refund')
 AND NOT EXISTS(SELECT 1 FROM payment_product_reversals rev WHERE rev.order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM payment_refund_cases h WHERE h.order_id=o.id AND h.status NOT IN('declined','refunded'))
 UNION ALL
 SELECT 'premium_listener',o.id,o.plan,r.verified_at,r.verified_at+INTERVAL '1 year'
 FROM premium_orders o JOIN premium_receipts r ON r.order_id=o.id JOIN premium_entitlements e ON e.order_id=o.id
 JOIN premium_presentments p ON p.order_id=o.id JOIN premium_attempts a ON a.id=p.attempt_id
 WHERE (o.listener_id=$4::bigint OR o.listener_id IN(SELECT listener_id FROM account_role_links WHERE artist_id=$1))
 AND a.order_id=o.id AND e.listener_id=o.listener_id AND r.amount_minor=o.amount_minor AND o.days>=90 AND o.currency='USD' AND r.currency='USD' AND r.amount_minor>=180 AND r.mode=$3
 AND p.base_currency='USD' AND p.base_minor=r.amount_minor AND a.provider=r.provider AND a.merchant_id=r.merchant_id AND a.mode=r.mode AND NOT a.benefit_hold
 AND NOT EXISTS(SELECT 1 FROM refund_complaints c LEFT JOIN refund_complaint_reviews v ON v.complaint_id=c.id WHERE c.premium_order_id=o.id AND COALESCE(v.status,'under_review')<>'resolved_no_refund')
 AND NOT EXISTS(SELECT 1 FROM premium_reversals rev WHERE rev.order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM premium_payment_reviews h WHERE h.order_id=o.id)
) SELECT * FROM purchases WHERE verified_at<=$2::timestamptz AND expires_at>$2::timestamptz ORDER BY verified_at DESC,order_id LIMIT 1`;
async function status(db,artistId,{listenerId=null,at=new Date(),mode='live'}={}){
 if(!db)throw fail(503,'Affiliate eligibility cannot be checked right now.');
 if(!['live','test'].includes(mode)||!Number.isFinite(new Date(at).getTime()))throw fail(400,'Invalid affiliate eligibility context.');
 const row=(await db.query(QUALIFYING,[artistId||null,new Date(at),mode,listenerId])).rows[0];
 return {eligible:!!row,qualifying_purchase:row||null,commission_window_years:1,qualifying_purchase_required:true,enrollment_fee_minor:0,registration_free:false,mode,notice:'Buy a qualifying artist package from $6 or Three-Month Premium for $1.80. Your verified purchase opens affiliate access and commissions for one year. Premium renewals of any duration can earn commission during that year.'};
}
async function requireQualified(db,id,options){const value=await status(db,id,options);if(!value.eligible)throw Object.assign(fail(402,value.notice),{code:'affiliate_purchase_required'});return value;}
const modeForEnv=env=>['test','staging'].includes(env.NODE_ENV)?'test':'live';
async function recipients(db,direct,leader,{at,mode='live',revision}={}){
 const policy=require('./partner-policy');if(![policy.REVISION,policy.LEGACY_REVISION,'legacy-premium-10-5'].includes(revision))throw fail(409,'Unrecognized affiliate eligibility policy.');if(revision!==policy.REVISION)return {direct:!!direct,team:!!leader};
 const d=direct?await status(db,direct,{at,mode}):null,t=leader?await status(db,leader,{at,mode}):null;
 // Immutable audit receipts preserve eligibility at earning time. Later expiry
 // never removes a commission already earned within the window.
 await require('./transactions').audit(db,{type:'provider',id:'affiliate-policy'},'affiliate.eligibility.snapshot',direct||leader||'unattributed',{revision,at:new Date(at).toISOString(),mode,direct_id:direct||null,team_id:leader||null,direct_purchase:d?.qualifying_purchase||null,team_purchase:t?.qualifying_purchase||null});
 return {direct:!!d?.eligible,team:!!t?.eligible};
}
async function activate(pool,listenerId,{mode='live',userAgent=''}={}){
 return require('./transactions').transaction(pool,async db=>{
  const roles=require('./account-roles'),source=await roles.lockAccount(db,'listener',listenerId);
  const eligibility=await status(db,null,{listenerId,mode});if(!eligibility.eligible)throw fail(402,eligibility.notice);
  const linked=(await db.query('SELECT artist_id FROM account_role_links WHERE listener_id=$1',[listenerId])).rows[0];let artistId=linked?.artist_id;
  if(!artistId){
   if((await db.query('SELECT id FROM creators WHERE email=$1',[source.email])).rowCount)throw Object.assign(fail(409,'Connect your existing artist profile securely before enabling affiliate access. Your purchases are preserved.'),{code:'account_link_required'});
   // Carry the purchaser's verified Premium referral into the new partner
   // profile so their own customers have the correct second-step leader.
   const ref=(await db.query('SELECT c.id FROM premium_orders o JOIN creators c ON c.id=o.referrer_id WHERE o.id=$1 AND lower(c.email)<>lower($2)',[eligibility.qualifying_purchase.order_id,source.email])).rows[0]?.id||null;
   artistId=(await db.query("INSERT INTO creators(display_name,email,password_salt,password_hash,plan,referred_by) VALUES($1,$2,$3,$4,'starter',$5) RETURNING id",[source.display_name,source.email,source.password_salt,source.password_hash,ref])).rows[0].id;
   await db.query('INSERT INTO account_role_links(artist_id,listener_id) VALUES($1,$2)',[artistId,listenerId]);
   await require('./transactions').audit(db,{type:'listener',id:listenerId},'affiliate.profile.activate',artistId,{qualifying_order:eligibility.qualifying_purchase.order_id,artist_package_granted:false});
  }
  const token=require('node:crypto').randomBytes(32).toString('hex'),sessionRoles=await roles.issueSessions(db,'listener',listenerId,token,require('./account-security').deviceLabel(userAgent));return {token,sessionRoles,artist_id:artistId,eligibility};
 });
}
module.exports={activate,status,requireQualified,modeForEnv,recipients,QUALIFYING};
