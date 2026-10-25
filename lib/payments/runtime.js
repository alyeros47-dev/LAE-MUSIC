'use strict';
const merchant=require('../../config/payment-merchant.json');
const {createCheckoutService}=require('./checkout');
const {createPaystack}=require('./paystack');
const {createFlutterwave}=require('./flutterwave');
// The versioned merchant review and staging environment are both required.
// There is intentionally no production/live enable switch in this candidate.
function checkoutRuntime({pool,rates,env=process.env,config=merchant,fetchImpl=fetch}={}){
 const closed=()=>createCheckoutService({pool,rates});
 if(config.merchant_country!=='NG'||config.base_currency!=='USD'||config.checkout_mode!=='sandbox'||env.NODE_ENV!=='staging')return closed();
 const reviewed=p=>config.providers?.[p]?.account_verified===true;
 const currencies=p=>Array.isArray(config.providers?.[p]?.approved_currencies)?config.providers[p].approved_currencies.filter(c=>['NGN','USD'].includes(c)):[];
 const adapters={
  paystack:createPaystack({secretKey:env.PAYSTACK_SECRET_KEY||'',merchantId:String(config.providers?.paystack?.merchant_id||''),mode:'test',approvedCurrencies:currencies('paystack'),reviewed:reviewed('paystack'),fetchImpl}),
  flutterwave:createFlutterwave({secretKey:env.FLUTTERWAVE_SECRET_KEY||'',secretHash:env.FLUTTERWAVE_WEBHOOK_HASH||'',merchantId:String(config.providers?.flutterwave?.merchant_id||''),mode:'test',approvedCurrencies:currencies('flutterwave'),reviewed:reviewed('flutterwave'),fetchImpl})
 };
 return createCheckoutService({pool,rates,adapters,mode:'sandbox',merchantCountry:'NG',callbackOrigin:env.PAYMENT_CALLBACK_ORIGIN||''});
}
module.exports={checkoutRuntime};
