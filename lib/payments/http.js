'use strict';
const {fail}=require('../transactions');
const WEBHOOK=/^\/api\/platform\/payments\/webhooks\/(paystack|flutterwave)$/;
function providerWebhook(req,url){return req.method==='POST'&&WEBHOOK.test(url.pathname);}
async function rawPaymentBody(req){
 if(String(req.headers['content-type']||'').split(';')[0].trim()!=='application/json')throw fail(415,'Payment events must use application/json.');
 const length=req.headers['content-length'];if(length!==undefined&&(!/^\d+$/.test(String(length))||Number(length)>200000))throw fail(413,'Payment event is too large.');
 let bytes=0;const chunks=[];req.setTimeout?.(10000,()=>req.destroy());
 try{for await(const chunk of req){bytes+=chunk.length;if(bytes>200000)throw fail(413,'Payment event is too large.');chunks.push(Buffer.from(chunk));}if(!bytes)throw fail(400,'Payment event is empty.');return Buffer.concat(chunks);}finally{req.setTimeout?.(0);}
}
module.exports={providerWebhook,rawPaymentBody};
