'use strict';
const crypto=require('node:crypto'),{fail,audit}=require('./transactions'),finance=require('./finance');
const config=require('../config/affiliate-revenue-policy.json');
const STAGES=Object.freeze(config.creator_milestones.map(x=>Object.freeze({...x})));
const ELIGIBLE=`SELECT q.* FROM creator_milestone_qualifications q JOIN LATERAL lae_creator_purchase_evidence(q.order_id) e ON e.creator_id=q.creator_id AND e.leader_id=q.leader_id AND e.mode=q.mode`;
function progress(count,rewards=[]){
 let consumed=0;for(const s of STAGES){const earned=rewards.some(r=>Number(r.stage)===s.stage);if(!earned)return {stage:s.stage,target:s.additional_creators,count:Math.max(0,count-consumed),reward_minor:s.reward_usd_minor,complete:false};consumed+=s.additional_creators;}
 return {stage:3,target:100000,count:100000,reward_minor:9000000,complete:true};
}
// Called only inside existing verified-payment transactions, after presentment.
async function recordVerifiedPurchase(db,orderId){
 const e=(await db.query('SELECT * FROM lae_creator_purchase_evidence($1)',[orderId])).rows[0];if(!e)return {counted:false};
 const qualified=await require('./affiliate-access').status(db,e.leader_id,{at:e.verified_at,mode:e.mode,policyRevision:require('./affiliate-framework').ARTIST_REVISION});
 if(!qualified.eligible)return {counted:false};
 await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['creator-milestone:'+e.leader_id+':'+e.mode]);
 const inserted=await db.query('INSERT INTO creator_milestone_qualifications(creator_id,leader_id,direct_referrer_id,order_id,mode,verified_at) SELECT creator_id,leader_id,direct_id,$1,mode,verified_at FROM lae_creator_purchase_evidence($1) ON CONFLICT(creator_id,mode) DO NOTHING RETURNING id',[orderId]);
 if(!inserted.rowCount)return {counted:false};
 await awardEligible(db,e.leader_id,e.mode);
 await audit(db,{type:'provider',id:'creator-milestones'},'affiliate.creator.qualify',String(e.creator_id),{leader_id:String(e.leader_id),order_id:orderId,mode:e.mode});
 return {counted:true};
}
async function awardEligible(db,leader,mode){
 // Lock is also taken here so retry/review callers cannot race a payment callback.
 await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['creator-milestone:'+leader+':'+mode]);
 for(const s of STAGES){
  if((await db.query('SELECT 1 FROM creator_milestone_rewards WHERE leader_id=$1 AND mode=$2 AND stage=$3',[leader,mode,s.stage])).rowCount)continue;
  const members=(await db.query(ELIGIBLE+' WHERE q.leader_id=$1 AND q.mode=$2 AND NOT EXISTS(SELECT 1 FROM creator_milestone_reward_members m WHERE m.qualification_id=q.id) ORDER BY q.id LIMIT $3',[leader,mode,s.additional_creators])).rows;
  if(members.length!==s.additional_creators)break;
  const id=crypto.randomUUID();
  await db.query('INSERT INTO creator_milestone_rewards(id,leader_id,mode,stage,qualifying_count,amount_minor) VALUES($1,$2,$3,$4,$5,$6)',[id,leader,mode,s.stage,s.additional_creators,s.reward_usd_minor]);
  await db.query('INSERT INTO creator_milestone_reward_members(qualification_id,reward_id) SELECT unnest($1::bigint[]),$2::uuid',[members.map(x=>x.id),id]);
  // An earned obligation, NOT available cash or a bank payment. Test/live books stay separate.
  await finance.transfer(db,'creator-milestone:'+leader+':'+mode+':'+s.stage,'creator_milestone_reward','USD',s.reward_usd_minor,'platform:creator_milestone_expense:'+mode+':USD','artist:'+leader+':creator_milestone_pending:'+mode+':USD',leader);
  await audit(db,{type:'provider',id:'creator-milestones'},'affiliate.creator.reward',id,{stage:s.stage,qualifying_count:s.additional_creators,amount_minor:s.reward_usd_minor,mode,funds_sent:false});
 }
}
const NETWORK=`WITH identities AS (
 SELECT 'a:'||c.id AS person,c.id AS artist_id,link.listener_id,c.referred_by AS artist_ref,l.referred_by AS listener_ref FROM creators c LEFT JOIN account_role_links link ON link.artist_id=c.id LEFT JOIN listeners l ON l.id=link.listener_id
 UNION ALL SELECT 'l:'||l.id,NULL::bigint,l.id,NULL::bigint,l.referred_by FROM listeners l WHERE NOT EXISTS(SELECT 1 FROM account_role_links x WHERE x.listener_id=l.id)
), history AS (
 SELECT 'a:'||o.artist_id AS person,s.direct_referrer_id AS referrer_id,r.verified_at,o.id FROM commerce_orders o JOIN commerce_receipts r ON r.order_id=o.id JOIN commerce_order_referral_snapshots s ON s.order_id=o.id LEFT JOIN payment_presentments p ON p.order_id=o.id LEFT JOIN membership_royalty_renewals mr ON mr.order_id=o.id WHERE s.direct_referrer_id IS NOT NULL AND COALESCE(p.mode,CASE WHEN mr.order_id IS NOT NULL THEN 'live' END)=$2
 UNION ALL SELECT CASE WHEN link.artist_id IS NOT NULL THEN 'a:'||link.artist_id ELSE 'l:'||o.listener_id END,o.referrer_id,r.verified_at,o.id FROM premium_orders o JOIN premium_receipts r ON r.order_id=o.id LEFT JOIN account_role_links link ON link.listener_id=o.listener_id WHERE o.referrer_id IS NOT NULL AND r.mode=$2
), original AS (
 SELECT DISTINCT ON(person) person,referrer_id FROM history ORDER BY person,verified_at,id
), people AS (
 SELECT i.*,COALESCE(original.referrer_id,i.artist_ref,i.listener_ref) AS parent FROM identities i LEFT JOIN original ON original.person=i.person
), premium_people AS (
 SELECT DISTINCT CASE WHEN link.artist_id IS NOT NULL THEN 'a:'||link.artist_id ELSE 'l:'||o.listener_id END AS person FROM premium_orders o JOIN premium_receipts r ON r.order_id=o.id LEFT JOIN account_role_links link ON link.listener_id=o.listener_id WHERE r.mode=$2 AND NOT EXISTS(SELECT 1 FROM premium_reversals rev WHERE rev.order_id=o.id)
)
SELECT COUNT(*)::integer AS total_indirect_downlines,COUNT(premium.person)::integer AS indirect_premium_listeners
FROM people buyer JOIN people sponsor ON sponsor.artist_id=buyer.parent LEFT JOIN premium_people premium ON premium.person=buyer.person WHERE sponsor.parent=$1 AND buyer.person<>sponsor.person AND buyer.artist_id IS DISTINCT FROM $1::bigint AND sponsor.artist_id<>$1`;
async function overview(db,leader,{mode='live'}={}){
 if(!['live','test'].includes(mode)||!Number.isSafeInteger(Number(leader))||Number(leader)<1)throw fail(400,'Choose a valid referral account.');
 const network=(await db.query(NETWORK,[leader,mode])).rows[0]||{total_indirect_downlines:0,indirect_premium_listeners:0};
 const count=Number((await db.query('SELECT COUNT(*) AS total FROM ('+ELIGIBLE+' WHERE q.leader_id=$1 AND q.mode=$2) eligible',[leader,mode])).rows[0].total);
 const rewards=(await db.query(`SELECT r.*,EXISTS(SELECT 1 FROM creator_milestone_reward_members m JOIN creator_milestone_qualifications q ON q.id=m.qualification_id WHERE m.reward_id=r.id AND NOT EXISTS(SELECT 1 FROM lae_creator_purchase_evidence(q.order_id))) AS review_required FROM creator_milestone_rewards r WHERE leader_id=$1 AND mode=$2 ORDER BY stage`,[leader,mode])).rows.map(r=>({...r,amount_minor:Number(r.amount_minor),funds_sent:false}));
 const consumed=Number((await db.query('SELECT COUNT(*) AS total FROM creator_milestone_reward_members m JOIN creator_milestone_rewards r ON r.id=m.reward_id WHERE r.leader_id=$1 AND r.mode=$2',[leader,mode])).rows[0].total);
 // Refunds after an award must not turn consumed creators into fresh progress.
 const available=Number((await db.query('SELECT COUNT(*) AS total FROM ('+ELIGIBLE+' WHERE q.leader_id=$1 AND q.mode=$2 AND NOT EXISTS(SELECT 1 FROM creator_milestone_reward_members m WHERE m.qualification_id=q.id)) eligible',[leader,mode])).rows[0].total);
 return {...network,verified_indirect_paying_creators:count,progress:progress(consumed+available,rewards),rewards,rewards_earned_minor:rewards.reduce((n,r)=>n+r.amount_minor,0),currency:'USD',mode,cash_release_enabled:false,funds_sent:false};
}
module.exports={STAGES,ELIGIBLE,NETWORK,progress,recordVerifiedPurchase,awardEligible,overview};
