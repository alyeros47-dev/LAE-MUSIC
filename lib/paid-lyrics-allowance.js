'use strict';
const {transaction}=require('./transactions');
// One companion lyrics draft per purchased music generation, using the same
// verified purchase and snapshotted annual allowance. Historical credits stay intact.
async function purchases(db,artistId,mode){
 const active=(await db.query("SELECT 1 FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' AND starts_at<=NOW() AND expires_at>NOW() AND NOT payment_hold LIMIT 1",[artistId])).rowCount;
 if(!active)return [];
 const result=await db.query("SELECT o.id,o.kind,COALESCE(s.included_generations,0) AS included_generations FROM commerce_orders o JOIN commerce_receipts r ON r.order_id=o.id LEFT JOIN artist_subscriptions s ON s.id=o.subscription_id LEFT JOIN payment_presentments p ON p.order_id=o.id WHERE o.artist_id=$1 AND o.status='paid' AND r.currency='USD' AND r.amount_minor=o.amount_minor AND ((p.mode=$2 AND p.base_currency='USD' AND p.base_minor=r.amount_minor AND p.payment_id=r.payment_id AND p.provider=r.provider AND p.merchant_id=r.merchant_id) OR ($2='live' AND EXISTS(SELECT 1 FROM membership_royalty_renewals mr WHERE mr.order_id=o.id AND mr.artist_id=o.artist_id AND mr.currency=r.currency AND mr.amount_minor=r.amount_minor))) AND ((o.kind='artist_subscription' AND s.status='paid' AND s.starts_at<=NOW() AND s.expires_at>NOW() AND NOT s.payment_hold) OR o.kind='studio_generation') AND NOT EXISTS(SELECT 1 FROM payment_product_reversals rev WHERE rev.order_id=o.id) AND NOT EXISTS(SELECT 1 FROM payment_refund_cases h WHERE h.order_id=o.id AND h.status NOT IN('declined','refunded'))",[artistId,mode]);
 return result.rows;
}
async function award(db,artistId,{mode='live'}={}){const rows=await purchases(db,artistId,mode);
 for(const p of rows){
  const quantity=p.kind==='studio_generation'?1:Number(p.included_generations);if(!Number.isSafeInteger(quantity)||quantity<1)continue;
  await db.query("WITH awarded AS (INSERT INTO generation_ledger(creator_id,delta,reason,reference,source_order_id) VALUES($1,$2,'paid_lyrics_allowance',$3,$4) ON CONFLICT(reference) DO NOTHING RETURNING creator_id,delta) INSERT INTO generation_wallets(creator_id,credits) SELECT creator_id,delta FROM awarded ON CONFLICT(creator_id) DO UPDATE SET credits=generation_wallets.credits+EXCLUDED.credits,updated_at=NOW()",[artistId,quantity,'paid-lyrics:'+p.id,p.id]);
 }
}
async function grant(pool,artistId,options){if(artistId===null||artistId===undefined)return;return transaction(pool,async db=>{await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[artistId]);await award(db,artistId,options);});}
async function state(db,artistId,{mode='live'}={}){
 const raw=Number((await db.query('SELECT credits FROM generation_wallets WHERE creator_id=$1',[artistId])).rows[0]?.credits||0);
 const sources=(await db.query("SELECT source_order_id,SUM(delta) FILTER(WHERE reason='paid_lyrics_allowance') AS granted,COALESCE(SUM(delta) FILTER(WHERE delta<0 AND reason<>'lyrics_generation_refunded'),0) AS spent FROM generation_ledger WHERE creator_id=$1 AND source_order_id IS NOT NULL GROUP BY source_order_id ORDER BY MIN(created_at),source_order_id",[artistId])).rows.map(r=>({id:r.source_order_id,left:Number(r.granted)+Number(r.spent)}));
 const remaining=sources.reduce((n,r)=>n+Math.max(0,r.left),0),free=Math.max(0,raw-remaining);
 const valid=new Set((await purchases(db,artistId,mode)).map(r=>r.id)),available=sources.filter(r=>valid.has(r.id)&&r.left>0);
 return {credits:free+available.reduce((n,r)=>n+r.left,0),source_order_id:free>0?null:available[0]?.id||null};
}
module.exports={award,grant,state};
