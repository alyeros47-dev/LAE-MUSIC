'use strict';
const {transfer,balance}=require('./finance');
async function record(db,order){
 const e=(await db.query('SELECT * FROM lae_external_purchase_evidence($1)',[order.id])).rows[0];if(!e)return;
 const revision=require('./affiliate-framework').ARTIST_REVISION;
 const recipients=await require('./affiliate-access').recipients(db,e.direct_id,e.leader_id,{at:e.verified_at,mode:e.mode,revision});
 if(recipients.direct){const amount=Math.round(Number(order.amount_minor)*20/100);
  const inserted=await db.query('INSERT INTO external_upload_commissions(order_id,artist_id,referrer_id,amount_minor) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING order_id',[order.id,order.artist_id,e.direct_id,amount]);
  if(inserted.rowCount)await transfer(db,'external-commission:'+order.id,'pending_product_commission','USD',amount,'platform:commission_expense:USD','artist:'+e.direct_id+':pending:USD',e.direct_id);
 }
 await require('./creator-milestones').recordVerifiedPurchase(db,order.id);
}
async function reverse(db,orderId){
 await db.query("UPDATE external_upload_memberships SET status='refunded' WHERE order_id=$1",[orderId]);
 const c=(await db.query('SELECT * FROM external_upload_commissions WHERE order_id=$1 FOR UPDATE',[orderId])).rows[0];if(!c||c.status==='reversed')return;
 if(await balance(db,'artist:'+c.referrer_id+':pending:USD')>=Number(c.amount_minor)){
  await transfer(db,'external-refund-commission:'+orderId,'refunded_product_commission','USD',Number(c.amount_minor),'artist:'+c.referrer_id+':pending:USD','platform:commission_expense:USD',c.referrer_id);
  await db.query("UPDATE external_upload_commissions SET status='reversed' WHERE order_id=$1",[orderId]);
 }else await db.query("UPDATE external_upload_commissions SET status='reconciliation_required' WHERE order_id=$1",[orderId]);
}
module.exports={record,reverse};
