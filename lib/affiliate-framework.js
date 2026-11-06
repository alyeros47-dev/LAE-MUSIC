'use strict';
const crypto=require('node:crypto'),config=require('../config/affiliate-revenue-policy.json');
const {fail,audit}=require('./transactions'),p=require('./premium-policy');
const REVISION=config.revision;
function distribution(value){const eligible=p.minor(value),affiliate=p.percentage(eligible,30),remaining=eligible-affiliate,artist=Math.floor(remaining/2);return {eligible_minor:eligible,affiliate_and_team_minor:affiliate,remaining_minor:remaining,artist_pool_minor:artist,platform_minor:remaining-artist,allocation_status:'pending_decisions',individual_rates:null,revision:REVISION};}
// Recognize each child allocation from its parent's cumulative recognized cents.
// Independent time rounding can otherwise allocate a child cent in a zero-revenue month.
function recognizeArtistShare(allocation,start,end,period){
 const remaining=p.minor(allocation.remaining_minor),artist=p.minor(allocation.artist_pool_minor);
 if(artist>remaining)throw fail(400,'Invalid artist pool allocation.');
 const before=p.recognize(remaining,start,end,{start:new Date(start),end:period.start}),after=before+p.recognize(remaining,start,end,period);
 return remaining?Number(BigInt(artist)*BigInt(after)/BigInt(remaining)-BigInt(artist)*BigInt(before)/BigInt(remaining)):0;
}
function disclosure(){return {...config,notice:'Affiliate registration is free and optional. A verified artist package or qualifying Premium purchase activates participation without a subscription-expiry limit. Premium reserves 30% of eligible revenue for affiliates and team rewards; the remaining 70% is split equally between eligible streaming royalties and LAE-MUSIC. Individual allocations and detailed team rules await approval. No projected budget is withdrawable income.'};}
// Original attribution comes from immutable verified purchases, across explicitly linked roles only.
async function originalReferrer(db,{artistId=null,listenerId=null,mode='live'}={}){
 const r=await db.query(`WITH identities AS (
 SELECT $1::bigint AS artist_id,$2::bigint AS listener_id UNION SELECT artist_id,listener_id FROM account_role_links WHERE artist_id=$1 OR listener_id=$2
 ), purchases AS (
 SELECT s.direct_referrer_id AS referrer_id,r.verified_at,r.order_id FROM commerce_receipts r JOIN commerce_orders o ON o.id=r.order_id JOIN commerce_order_referral_snapshots s ON s.order_id=o.id LEFT JOIN payment_presentments p ON p.order_id=o.id
 WHERE o.artist_id IN(SELECT artist_id FROM identities) AND s.direct_referrer_id IS NOT NULL AND (p.mode=$3 OR ($3='live' AND EXISTS(SELECT 1 FROM membership_royalty_renewals mr WHERE mr.order_id=o.id)))
 UNION ALL SELECT o.referrer_id,r.verified_at,o.id FROM premium_orders o JOIN premium_receipts r ON r.order_id=o.id WHERE o.listener_id IN(SELECT listener_id FROM identities) AND o.referrer_id IS NOT NULL AND r.mode=$3
 ) SELECT referrer_id,order_id FROM purchases ORDER BY verified_at,order_id LIMIT 1`,[artistId,listenerId,mode]);return r.rows[0]||null;
}
async function receiptPolicy(db,kind,orderId,revision=REVISION){if(revision!==REVISION)return;await db.query('INSERT INTO affiliate_receipt_policies(artist_order_id,premium_order_id,policy_revision) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[kind==='premium'?null:orderId,kind==='premium'?orderId:null,REVISION]);}
// This is an attributed, verified purchase record, not an individual commission or payout.
async function recordOpportunity(db,{kind,orderId,mode}){
 let o;if(kind==='premium')o=(await db.query(`SELECT o.id,o.listener_id,o.referrer_id,COALESCE(rp.policy_revision,o.affiliate_policy_revision) AS revision,r.mode,r.amount_minor,r.verified_at FROM premium_orders o JOIN premium_receipts r ON r.order_id=o.id LEFT JOIN affiliate_receipt_policies rp ON rp.premium_order_id=o.id JOIN premium_presentments p ON p.order_id=o.id JOIN premium_attempts a ON a.id=p.attempt_id WHERE o.id=$1 AND r.currency='USD' AND p.base_currency='USD' AND p.base_minor=r.amount_minor AND a.provider=r.provider AND a.merchant_id=r.merchant_id AND a.mode=r.mode`,[orderId])).rows[0];
 else o=(await db.query(`SELECT o.id,o.artist_id,s.direct_referrer_id AS referrer_id,COALESCE(rp.policy_revision,s.policy_revision) AS revision,COALESCE(p.mode,CASE WHEN mr.order_id IS NOT NULL THEN 'live' END) AS mode,r.amount_minor,r.verified_at FROM commerce_orders o JOIN commerce_receipts r ON r.order_id=o.id JOIN commerce_order_referral_snapshots s ON s.order_id=o.id LEFT JOIN affiliate_receipt_policies rp ON rp.artist_order_id=o.id LEFT JOIN payment_presentments p ON p.order_id=o.id LEFT JOIN membership_royalty_renewals mr ON mr.order_id=o.id AND mr.artist_id=o.artist_id AND mr.amount_minor=r.amount_minor WHERE o.id=$1 AND r.currency='USD' AND r.amount_minor=o.amount_minor AND ((p.base_minor=r.amount_minor AND p.provider=r.provider AND p.merchant_id=r.merchant_id AND p.payment_id=r.payment_id) OR mr.order_id IS NOT NULL)`,[orderId])).rows[0];
 if(!o||o.revision!==REVISION)return;
 if(!['test','live'].includes(o.mode)||mode&&mode!==o.mode)throw fail(409,'Verified referral purchase evidence requires reconciliation.');
 const eligibility=o.referrer_id?await require('./affiliate-access').status(db,o.referrer_id,{mode:o.mode,at:o.verified_at}):null;
 const inserted=await db.query("INSERT INTO affiliate_purchase_opportunities(id,artist_order_id,premium_order_id,direct_referrer_id,buyer_artist_id,buyer_listener_id,mode,policy_revision,currency,gross_minor,eligibility_snapshot,allocation_status,verified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'USD',$9,$10,'pending_decisions',$11) ON CONFLICT DO NOTHING RETURNING id",[crypto.randomUUID(),kind==='premium'?null:o.id,kind==='premium'?o.id:null,o.referrer_id,o.artist_id||null,o.listener_id||null,o.mode,REVISION,o.amount_minor,JSON.stringify({at:o.verified_at,referrer:eligibility?{id:o.referrer_id,registered:eligibility.registered,qualified:eligibility.qualified,active:eligibility.eligible}:null,individual_rates:null,team_rules:null}),o.verified_at]);
 if(inserted.rowCount)await audit(db,{type:'provider',id:'affiliate-framework'},'affiliate.purchase.awaiting_rules',o.id,{kind,mode:o.mode,referrer_id:o.referrer_id||null,individual_allocation:false});
}
async function opportunities(db,artistId,{mode='live'}={}){if(!['test','live'].includes(mode))throw fail(400,'Choose live or test records.');return (await db.query(`SELECT x.id,x.artist_order_id,x.premium_order_id,x.mode,x.gross_minor,x.currency,x.allocation_status,x.verified_at,COALESCE(a.plan,p.plan) AS product_plan,CASE WHEN x.artist_order_id IS NOT NULL THEN a.kind ELSE 'premium_listener' END AS product,EXISTS(SELECT 1 FROM payment_product_reversals r WHERE r.order_id=x.artist_order_id) OR EXISTS(SELECT 1 FROM premium_reversals r WHERE r.order_id=x.premium_order_id) AS reversed FROM affiliate_purchase_opportunities x LEFT JOIN commerce_orders a ON a.id=x.artist_order_id LEFT JOIN premium_orders p ON p.id=x.premium_order_id WHERE x.direct_referrer_id=$1 AND x.mode=$2 ORDER BY x.verified_at DESC LIMIT 100`,[artistId,mode])).rows;}
module.exports={REVISION,receiptPolicy,distribution,recognizeArtistShare,disclosure,originalReferrer,recordOpportunity,opportunities};
