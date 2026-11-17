'use strict';
// No checkout or subscription approval is changed by the disbursement service.
const policy=require('../config/affiliate-payouts.json');
function create({pool,rates,env=process.env,config=policy,provider=null}={}){
 const mode=['test','staging','development'].includes(env.NODE_ENV)?'test':'live',prefix=mode==='test'?'MONNIFY_SANDBOX_':'MONNIFY_';
 const allowed=()=>config.enabled===true&&config.merchant_disbursements_confirmed===true&&config.sandbox_verified===true&&(mode==='test'||config.controlled_live_test_verified===true);
 const adapter=provider||require('./payments/monnify-disbursements').create({apiKey:env[prefix+'API_KEY'],secretKey:env[prefix+'SECRET_KEY'],contractCode:env[prefix+'CONTRACT_CODE'],baseUrl:mode==='test'?'https://sandbox.monnify.com':'https://api.monnify.com',mode,sourceAccount:env[prefix+'DISBURSEMENT_SOURCE_ACCOUNT']||env[prefix+'WALLET_ACCOUNT_NUMBER']||'',allowTransfers:allowed});
 return require('./affiliate-payouts').create({pool,rates,env,config,provider:adapter});
}
function isPayoutEvent(raw){try{return ['SUCCESSFUL_DISBURSEMENT','FAILED_DISBURSEMENT','REVERSED_DISBURSEMENT'].includes(JSON.parse(raw).eventType);}catch{return false;}}
module.exports={create,isPayoutEvent};
