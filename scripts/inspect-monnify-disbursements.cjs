'use strict';
// Read-only merchant readiness. Login obtains a token; every merchant operation
// below is GET. Never initiates, authorizes, refunds or reverses a transfer.
const {serviceValid,inventory}=require('./audit-existing-service.cjs');
const SERVICE='srv-db84s7m89jmc73c7l9rg';
async function inspect({key=process.env.RENDER_API_KEY,fetcher=fetch}={}){
 if(!key)throw Error('Render read access is unavailable.');
 async function render(suffix){const r=await fetcher('https://api.render.com/v1/services/'+SERVICE+suffix,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Render read unavailable');return r.json();}
 const raw=await render(''),service=raw.service||raw;
 if(service.id!==SERVICE||!serviceValid(service))throw Error('Unexpected service');
 const env=inventory(await render('/env-vars?limit=100'));
 const report={production_writes:0,transfer_requests:0,merchant_authorization:'requires_provider_confirmation',live:{},sandbox:{},approved_minimums:require('../config/affiliate-payouts.json').minimum_ngn_minor===500000&&require('../config/affiliate-payouts.json').minimum_usd_minor===400,payout_schedule:require('../config/affiliate-payouts.json').schedule};
 for(const mode of ['live','sandbox']){
  const prefix=mode==='live'?'MONNIFY_':'MONNIFY_SANDBOX_',base=mode==='live'?'https://api.monnify.com':'https://sandbox.monnify.com';
  const apiKey=env[prefix+'API_KEY'],secret=env[prefix+'SECRET_KEY'],contract=env[prefix+'CONTRACT_CODE'],wallet=env[prefix+'DISBURSEMENT_SOURCE_ACCOUNT']||env[prefix+'WALLET_ACCOUNT_NUMBER'];
  const item=report[mode];item.credentials_configured=!!(apiKey&&secret&&contract);item.wallet_configured=/^\d{10}$/.test(wallet||'');
  if(!item.credentials_configured)continue;
  if(mode==='live'&&/^MK_TEST_/i.test(apiKey)||mode==='sandbox'&&!/^MK_TEST_/i.test(apiKey)){item.credential_mode_valid=false;continue;}
  item.credential_mode_valid=true;
  async function query(path,auth,method='GET'){const r=await fetcher(base+path,{method,headers:{Authorization:auth,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});let body;try{body=await r.json();}catch{return {ok:false,http:r.status};}return {ok:r.ok&&body?.requestSuccessful===true&&String(body?.responseCode)==='0',http:r.status,data:body?.responseBody};}
  try{
   const auth=await query('/api/v1/auth/login','Basic '+Buffer.from(apiKey+':'+secret).toString('base64'),'POST');item.authentication_verified=auth.ok&&typeof auth.data?.accessToken==='string';if(!item.authentication_verified)continue;
   const bearer='Bearer '+auth.data.accessToken;
   const listing=await query('/api/v2/disbursements/single/transactions?pageNo=0&pageSize=1',bearer);item.transfer_listing_accessible=listing.ok;item.listing_http_status=listing.http;
   if(item.wallet_configured){const balance=await query('/api/v2/disbursements/wallet-balance?accountNumber='+encodeURIComponent(wallet),bearer);item.wallet_read_verified=balance.ok;item.wallet_http_status=balance.http;item.wallet_has_funds=balance.ok&&Number(balance.data?.availableBalance)>0;}
   item.live_transfer_permission_proven=false;
   if(mode==='live'){
    const ref=require('../config/monnify-payments.json').successful_payment_reference;
    const found=await query('/api/v1/merchant/transactions/query?paymentReference='+encodeURIComponent(ref),bearer);
    if(found.ok&&typeof found.data?.transactionReference==='string'){
     const settlement=await query('/api/v1/settlement-detail?transactionReference='+encodeURIComponent(found.data.transactionReference),bearer);
     item.existing_settlement_read_verified=settlement.ok;item.settlement_http_status=settlement.http;
     try{const proof=await require('../lib/payments/monnify-disbursements').create({apiKey,secretKey:secret,contractCode:contract,baseUrl:base,mode:'live',fetchImpl:fetcher}).settlement(ref);item.merchant_settlement_binding_verified=proof.settled===true;}catch(e){item.merchant_settlement_binding_verified=false;item.settlement_binding_error_status=e.status||null;item.settlement_binding_error=typeof e.message==='string'&&/^(The original |The settlement |The settled |Invalid Monnify |Monnify |Payout confirmation )/.test(e.message)?e.message:'Settlement proof did not pass.';}
     if(settlement.ok){const d=settlement.data;item.contract_beneficiary_matches=Array.isArray(d?.beneficiaries)?d.beneficiaries.filter(b=>b.beneficiaryType==='MERCHANT_CONTRACT'&&String(b.beneficiaryCode)===String(contract)).length:0;item.settlement_amount_formats=[d?.transaction?.amountPaid,d?.transaction?.settlementAmount,...(d?.beneficiaries||[]).flatMap(b=>[b.beneficiaryIncome,b.settlementInformation?.settlementAmount])].map(v=>({type:typeof v,valid_minor_format:/^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$/.test(String(v??''))}));item.settlement_states=Array.isArray(d?.beneficiaries)?d.beneficiaries.map(b=>({type:/^[A-Z_]{1,30}$/.test(b.beneficiaryType||'')?b.beneficiaryType:'unknown',status:/^[A-Z_]{1,30}$/.test(b.settlementStatus||'')?b.settlementStatus:'unknown',information_keys:Object.keys(b.settlementInformation||{})})):[];item.settlement_response_shape=Array.isArray(d)?{array:true,keys:Object.keys(d[0]||{})}:{array:false,keys:Object.keys(d||{}),nested:Object.fromEntries(Object.entries(d||{}).filter(([,v])=>v&&typeof v==='object').map(([k,v])=>[k,Object.keys(Array.isArray(v)?v[0]||{}:v)]))};}
    }
   }
  }catch{item.read_check_incomplete=true;}
 }
 return report;
}
module.exports={inspect};
if(require.main===module)inspect().then(x=>console.log(JSON.stringify(x))).catch(()=>{console.error('Read-only merchant inspection could not complete. No money movement was attempted.');process.exitCode=1;});
