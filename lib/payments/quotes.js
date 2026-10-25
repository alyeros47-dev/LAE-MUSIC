'use strict';
const crypto=require('node:crypto');
const {transaction,fail}=require('../transactions');
const {convertUsd,currencyCode}=require('../currency');
function createCheckoutQuotes({pool,rates,accounts={}}){
 async function prepare(artistId,orderId,provider,currency){
  if(typeof orderId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(orderId))throw fail(400,'Invalid purchase reference.');
  currencyCode(currency);const account=accounts[provider];
  if(!['paystack','flutterwave'].includes(provider)||!account?.configured||!Array.isArray(account.currencies)||!account.currencies.includes(currency))throw fail(503,'This payment currency has not been approved for the merchant account.');
  const snapshot=currency==='USD'?null:await rates.snapshot();
  if(snapshot&&!snapshot.rates[currency])throw fail(503,'A current exchange rate is unavailable.');
  return transaction(pool,async db=>{
   await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[artistId]);const r=await db.query("SELECT *,expires_at>NOW() AS unexpired FROM commerce_orders WHERE id=$1 AND artist_id=$2 FOR UPDATE",[orderId,artistId]);const order=r.rows[0];if(!order||order.status!=='pending'||!order.unexpired)throw fail(409,'Your unpaid purchase record is unavailable.');
   const amount=currency==='USD'?Number(order.amount_minor):convertUsd(Number(order.amount_minor),snapshot.rates[currency],currency);if(amount<=0)throw fail(409,'This amount is below the currency precision.');
   // A quote is not a charge. A later checkout service must bind this immutable ID to one attempt.
   const q=await db.query("INSERT INTO payment_checkout_quotes(id,order_id,provider,base_currency,base_minor,charge_currency,charge_minor,rate_snapshot_id,expires_at) VALUES($1,$2,$3,'USD',$4,$5,$6,$7,LEAST($8::timestamptz,NOW()+INTERVAL '5 minutes')) RETURNING *",[crypto.randomUUID(),order.id,provider,order.amount_minor,currency,amount,snapshot?.id||null,order.expires_at]);return q.rows[0];
  });
 }
 return {prepare};
}
module.exports={createCheckoutQuotes};
