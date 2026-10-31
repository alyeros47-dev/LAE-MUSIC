'use strict';
// Internal walkthrough only. No provider, database, wallet or entitlement access.
const {fail}=require('./transactions');
const policy=require('./partner-policy');
const {percentage}=require('./premium-policy');
function products(){
 const plans=require('./plans'),premium=require('./premium-pricing').catalog();
 return [
  ...Object.entries(plans).map(([id,p])=>({id:'artist:'+id,name:id+' artist package',source:'artist',base_minor:Math.round(p.usd*100),direct_percent:policy.disclosure.direct_rates.artist_subscription[id]})),
  ...(premium.approved?premium.plans:[]).map(p=>({id:'premium:'+p.code,name:p.name,source:'premium',base_minor:p.usd_minor,direct_percent:policy.disclosure.direct_rates.premium_listener})),
  ...Object.entries(plans).map(([id,p])=>({id:'studio:'+id,name:'Extra studio generation · '+id,source:'studio',base_minor:Math.round(p.additionalGenerationUsd*100),direct_percent:policy.disclosure.direct_rates.studio_generation}))
 ].map(p=>({...p,currency:'USD',team_percent:p.source==='premium'?5:10}));
}
function preview(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw fail(400,'Choose a demo scenario.');
 const allowed=['product','depth','payment_state','sale_date','count'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))throw fail(400,'Only the demo selections may be submitted. Prices and rates are set by the server.');
 const product=products().find(p=>p.id===input.product);
 if(!product)throw fail(400,'Choose an approved demo product.');
 if(!['string','number'].includes(typeof input.depth))throw fail(400,'Choose one, two or three referral steps.');
 const depth=Number(input.depth);
 if(!/^[123]$/.test(String(input.depth)))throw fail(400,'Choose one, two or three referral steps.');
 if(!['pending','verified','full_refund','held'].includes(input.payment_state))throw fail(400,'Choose a demo payment outcome.');
 if(typeof input.sale_date!=='string'||!/^20\d\d-\d\d-\d\d$/.test(input.sale_date))throw fail(400,'Choose a valid demo sale date.');
 const date=new Date(input.sale_date+'T12:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==input.sale_date)throw fail(400,'Choose a valid demo sale date.');
 if(input.count!==undefined&&!['string','number'].includes(typeof input.count))throw fail(400,'Choose 1–100 identical demo purchases.');
 const count=Number(input.count??1);if(!/^[1-9]\d{0,2}$/.test(String(input.count??1))||count>100)throw fail(400,'Choose 1–100 identical demo purchases.');
 const refund=input.payment_state==='full_refund'?product.base_minor:0;
 const eligible=input.payment_state==='verified'?product.base_minor:0;
 const direct=percentage(eligible,product.direct_percent)*count;
 const team=policy.calculate(Array.from({length:count},(_,i)=>({order_id:'demo-example-'+i,source:product.source,eligible_minor:eligible}))).bonus_minor;
 const people=['You','Demo Partner B','Demo Partner C','Demo Customer D'];
 const teamRecipient=depth>=2?people[depth-2]:null;
 return {
  demo:true,currency:'USD',product,count,depth,payment_state:input.payment_state,sale_date:input.sale_date,
  chain:people.slice(0,depth+1),buyer:people[depth],registration_reward_minor:0,
  gross_minor:product.base_minor*count,refund_minor:refund*count,eligible_minor:eligible*count,
  direct:{recipient:people[depth-1],percent:product.direct_percent,amount_minor:direct},
  team:{recipient:teamRecipient,percent:product.team_percent,projection_minor:teamRecipient?team:0,period:policy.periodForSale(date),immediate_indirect_minor:0},
  your_direct_minor:depth===1?direct:0,your_team_projection_minor:depth===2?team:0,
  actual_payment_received_minor:0,actual_withdrawable_minor:0,
  disclosure:'INTERNAL DEMO ONLY. No payment was received or commission paid. This walkthrough uses the approved pricing and commission rules; it does not verify Paystack, Flutterwave, real referral attribution, settlement or bank payouts. Refund examples assume an already-approved refund and do not create a refund entitlement.'
 };
}
module.exports={products,preview};
