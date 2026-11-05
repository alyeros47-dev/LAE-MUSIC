'use strict';
const crypto=require('node:crypto');
const defaults=require('../config/manual-bank-payments.json');
// Official business banking instructions are public payment information, never credentials.
// No placeholder account, guessed currency or invented exchange rate can enable collection.
function configuration(env=process.env,document=defaults){
 let c=document;try{if(env.MANUAL_BANK_PAYMENTS_JSON)c=JSON.parse(env.MANUAL_BANK_PAYMENTS_JSON);}catch{return {enabled:false,reason:'Official bank payment configuration is invalid.'};}
 const a=c?.account,validText=v=>typeof v==='string'&&v.trim().length>=2&&v.length<=160&&!/[\x00-\x1f<>]/.test(v);
 if(c?.enabled!==true)return {enabled:false,reason:'Bank transfer is not available yet.'};
 if(!a||!validText(a.bank_name)||!validText(a.account_name)||typeof a.account_number!=='string'||!/^[-A-Za-z0-9 ]{6,40}$/.test(a.account_number)||!['USD','NGN'].includes(a.currency)||a.country!=='NG'||!Number.isInteger(c.invoice_hours)||c.invoice_hours<1||c.invoice_hours>72)return {enabled:false,reason:'Official bank name, business account name, account number, supported currency and country must be configured.'};
 const account={bank_name:a.bank_name.trim(),account_name:a.account_name.trim(),account_number:a.account_number.trim(),currency:a.currency,country:a.country};
 return {enabled:true,account,merchant_id:'bank_'+crypto.createHash('sha256').update(JSON.stringify(account)).digest('hex').slice(0,40),invoice_hours:c.invoice_hours,mode:['test','staging'].includes(env.NODE_ENV)?'test':'live'};
}
module.exports={configuration};
