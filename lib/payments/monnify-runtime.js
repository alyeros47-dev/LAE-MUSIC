'use strict';
const policy=require('../../config/monnify-payments.json');
const {fail}=require('../transactions');
function approved(config=policy){return config.public_enabled===true&&config.live_acceptance_confirmed===true&&/^laep?-[A-Za-z0-9-]{16,100}$/.test(config.successful_payment_reference||'');}
function adapter(env,config=policy){return require('./monnify').createMonnify({apiKey:env.MONNIFY_API_KEY,secretKey:env.MONNIFY_SECRET_KEY,contractCode:env.MONNIFY_CONTRACT_CODE,baseUrl:env.MONNIFY_BASE_URL,paymentMethods:config.payment_methods,mode:'live',reviewed:true});}
function proof(pool,a,config=policy){return async()=>{
 if(!approved(config)||!pool)throw fail(503,'Monnify is awaiting live payment confirmation.');
 const q=await pool.query("SELECT 1 FROM payment_presentments WHERE provider='monnify' AND mode='live' AND merchant_id=$1 AND reference=$2 UNION ALL SELECT 1 FROM premium_presentments p JOIN premium_attempts a ON a.id=p.attempt_id JOIN premium_receipts r ON r.order_id=p.order_id WHERE r.provider='monnify' AND r.mode='live' AND r.merchant_id=$1 AND a.reference=$2 LIMIT 1",[a.merchantId,config.successful_payment_reference]);
 if(!q.rowCount)throw fail(503,'Monnify live acceptance has not been verified against a paid receipt.');
 };}
function create({pool,rates,env=process.env,config=policy,controlled=false}={}){
 const a=adapter(env,config),callbackOrigin=env.PAYMENT_CALLBACK_ORIGIN||'https://lae-music.com';
 const authorizeCheckout=controlled?async()=>{}:proof(pool,a,config);
 const checkout=require('./checkout').createCheckoutService({pool,rates,adapters:{monnify:a},mode:'live',callbackOrigin,authorizeCheckout});
 const premium=require('../premium-listeners').createPremium({pool,rates,adapters:{monnify:a},callbackOrigin,allowLiveMonnify:true,authorizeCheckout});
 return {checkout,premium,configured:a.configured,merchantId:a.merchantId};
}
module.exports={approved,adapter,proof,create};
