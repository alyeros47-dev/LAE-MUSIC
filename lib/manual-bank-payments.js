'use strict';
const crypto=require('node:crypto');
const {fail,transaction,idempotent,audit,digest}=require('./transactions');
const money=require('./currency'),{configuration}=require('./manual-bank-config');
const PROVIDER='manual_bank_transfer',UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SELECT=`SELECT m.*,COALESCE(m.artist_order_id,f.artist_order_id) AS artist_order_id,COALESCE(m.listener_order_id,f.premium_order_id) AS listener_order_id,(f.payment_id IS NOT NULL) AS guest_claimed,q.base_currency,q.base_minor,q.charge_currency,q.charge_minor,q.rate_snapshot_id,s.payer_name,s.transfer_reference,s.transferred_at,s.note AS customer_note,s.proof_mime,r.decision,r.note AS review_note,r.reviewed_at FROM manual_bank_payments m JOIN payment_checkout_quotes q ON q.id=m.quote_id LEFT JOIN guest_purchase_fulfillments f ON f.payment_id=m.id LEFT JOIN manual_bank_submissions s ON s.payment_id=m.id LEFT JOIN manual_bank_reviews r ON r.payment_id=m.id`;
function role(value){if(!['artist','listener','guest'].includes(value))throw fail(400,'Choose the artist or listener account.');return value;}
function text(value,label,min=2,max=160){if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw fail(400,'Enter '+label+'.');return value.trim();}
function date(value,label){if(typeof value!=='string'||value.length>40||!/^\d{4}-\d\d-\d\dT/.test(value)||!Number.isFinite(Date.parse(value)))throw fail(400,'Enter '+label+'.');return new Date(value);}
function proof(input){if(!input)return {bytes:null,mime:null};if(typeof input!=='string'||input.length>1400000)throw fail(400,'Use a JPEG, PNG or WebP receipt up to 1 MB.');const match=input.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);if(!match)throw fail(400,'Use a JPEG, PNG or WebP receipt.');const bytes=Buffer.from(match[2],'base64'),mime=match[1];if(bytes.length<12||bytes.length>1048576||bytes.toString('base64')!==match[2]||!(mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'))throw fail(400,'The receipt image is invalid or exceeds 1 MB.');return {bytes,mime};}
function createManualBankPayments({pool,rates,env=process.env,premium,config}={}){
 const settings=configuration(env,config);
 const capabilities=()=>({enabled:!!pool&&settings.enabled,mode:settings.enabled?settings.mode:'disabled',currency:settings.account?.currency||null,reason:settings.reason||null,products:['artist_subscription','studio_generation','premium_listener'],approval_required:true});
 function ensure(){if(!pool||!settings.enabled)throw fail(503,settings.reason||'Official bank payment instructions are not configured.');}
 const orderTable=r=>r==='guest'?'guest_purchase_orders':r==='artist'?'commerce_orders':'premium_orders',ownerColumn=r=>r==='guest'?'session_hash':r==='artist'?'artist_id':'listener_id',orderColumn=r=>r==='guest'?'guest_order_id':r==='artist'?'artist_order_id':'listener_order_id';
 const boundOrder=r=>r==='guest'?'m.guest_order_id':'COALESCE(m.'+orderColumn(r)+',f.'+(r==='artist'?'artist_order_id':'premium_order_id')+')';
 async function lockOwner(db,r,id){await db.query(r==='guest'?'SELECT id FROM guest_purchase_orders WHERE session_hash=$1 FOR UPDATE':'SELECT id FROM '+(r==='artist'?'creators':'listeners')+' WHERE id=$1 FOR UPDATE',[id]);}
 async function owned(db,r,owner,id,lock=false){role(r);if(!UUID.test(id||''))throw fail(400,'Invalid bank payment reference.');const q=await db.query(SELECT+' JOIN '+orderTable(r)+' o ON o.id='+boundOrder(r)+' WHERE m.id=$1 AND o.'+ownerColumn(r)+'=$2'+(lock?' FOR UPDATE OF m':''),[id,owner]);if(!q.rowCount)throw fail(404,'Your bank payment was not found.');return q.rows[0];}
 const view=m=>({...m,base_minor:Number(m.base_minor),charge_minor:Number(m.charge_minor),amount:money.format(Number(m.charge_minor),m.charge_currency),expired:m.status==='awaiting_transfer'&&new Date(m.expires_at)<=new Date(),proof_available:!!m.proof_mime,notice:m.status==='awaiting_transfer'&&new Date(m.expires_at)<=new Date()?'The transfer deadline has passed. Do not send a new transfer. If you transferred on time, submit the actual receipt for review; otherwise contact support.':m.status==='approved'?(m.guest_order_id&&!m.guest_claimed?'Bank receipt verified. Finish account setup to activate your purchased service.':'Bank receipt verified. Your purchased service is active or scheduled.'):m.status==='submitted'?'Confirmation received. Awaiting verification in the business bank account. Paid benefits are not active yet.':m.status==='rejected'?'Payment was not approved. Review the administrator’s note. Contact support if you sent money; do not send it again.':m.status==='cancelled'?'These payment instructions were cancelled. Do not transfer against this reference.':'Transfer the exact displayed amount before the deadline, then submit confirmation. A screenshot alone does not activate benefits.'});
 async function list(r,owner){role(r);return (await pool.query(SELECT+' JOIN '+orderTable(r)+' o ON o.id='+boundOrder(r)+' WHERE o.'+ownerColumn(r)+'=$1 ORDER BY m.created_at DESC LIMIT 100',[owner])).rows.map(view);}
 async function get(r,owner,id){return view(await owned(pool,r,owner,id));}
 async function start(r,owner,key,input){
  ensure();role(r);if(!UUID.test(input?.order_id||''))throw fail(400,'Choose your purchase record.');require('./financial-policy').confirmation(input);
  const snapshot=settings.account.currency==='USD'?null:await rates.snapshot();
  if(snapshot&&(!snapshot.rates?.[settings.account.currency]||Date.now()-Date.parse(snapshot.as_of)>require('./exchange-rates').MAX_AGE||Date.parse(snapshot.as_of)>Date.now()+300000))throw fail(503,'A current bank-transfer exchange rate is unavailable. No payment instructions were issued.');
  return transaction(pool,async db=>{await lockOwner(db,r,owner);return idempotent(db,'manual-bank-start:'+r+':'+owner,key,{order_id:input.order_id,policy_revision:input.policy_revision},async()=>{
   const o=(await db.query('SELECT *,expires_at>NOW() AS current FROM '+orderTable(r)+' WHERE id=$1 AND '+ownerColumn(r)+'=$2 FOR UPDATE',[input.order_id,owner])).rows[0];
   if(!o)throw fail(404,'Your purchase record was not found.');
   const previous=(await db.query('SELECT id FROM manual_bank_payments WHERE '+orderColumn(r)+'=$1',[o.id])).rows[0];if(previous)return get(r,owner,previous.id);
   const pending=(await db.query("SELECT COUNT(*)::int AS n FROM manual_bank_payments m JOIN "+orderTable(r)+" o ON o.id=m."+orderColumn(r)+" WHERE o."+ownerColumn(r)+"=$1 AND (m.status='submitted' OR (m.status='awaiting_transfer' AND m.expires_at>NOW()))",[owner])).rows[0].n;if(pending>=(r==='artist'?20:10))throw fail(429,'Review or cancel your existing pending bank payments before requesting more instructions.');
   const attempts=r==='guest'?{rowCount:0}:await db.query('SELECT 1 FROM '+(r==='artist'?'payment_checkout_attempts':'premium_attempts')+' WHERE order_id=$1',[o.id]);
   if(!o.current||o.currency!=='USD'||r==='artist'&&o.status!=='pending'||attempts.rowCount||(r==='listener'&&(await db.query('SELECT 1 FROM premium_receipts WHERE order_id=$1',[o.id])).rowCount))throw fail(409,'This purchase expired, is already paid or has another payment reference. Reconcile it before paying again.');
   const charge=settings.account.currency==='USD'?Number(o.amount_minor):money.convertUsd(Number(o.amount_minor),snapshot.rates[settings.account.currency],settings.account.currency);
   if(charge<1||money.convertToUsd(charge,snapshot?.rates[settings.account.currency]||'1',settings.account.currency)!==Number(o.amount_minor))throw fail(409,'This product cannot be quoted accurately in the bank account currency.');
   const id=crypto.randomUUID(),quote=crypto.randomUUID(),attempt=crypto.randomUUID(),reference='LAE-'+crypto.randomBytes(8).toString('hex').toUpperCase();
   const expiry=(await db.query("SELECT NOW()+($1::integer*INTERVAL '1 hour') AS expiry",[settings.invoice_hours])).rows[0].expiry;
   await db.query("INSERT INTO payment_checkout_quotes(id,order_id,premium_order_id,provider,base_currency,base_minor,charge_currency,charge_minor,rate_snapshot_id,expires_at,guest_order_id) VALUES($1,$2,$3,$4,'USD',$5,$6,$7,$8,$9,$10)",[quote,r==='artist'?o.id:null,r==='listener'?o.id:null,PROVIDER,o.amount_minor,settings.account.currency,charge,snapshot?.id||null,expiry,r==='guest'?o.id:null]);
   if(r==='artist')await db.query("INSERT INTO payment_checkout_attempts(id,order_id,quote_id,provider,merchant_id,merchant_country,mode,reference,status) VALUES($1,$2,$3,$4,$5,'NG',$6,$7,'review')",[attempt,o.id,quote,PROVIDER,settings.merchant_id,settings.mode,reference]);
   else if(r==='listener') await db.query("INSERT INTO premium_attempts(id,order_id,quote_id,provider,merchant_id,mode,reference,status) VALUES($1,$2,$3,$4,$5,$6,$7,'review')",[attempt,o.id,quote,PROVIDER,settings.merchant_id,settings.mode,reference]);
   const label=r==='guest'?o.product_snapshot.label:r==='artist'?(o.kind==='studio_generation'?'Additional music generation · ':'Annual artist membership · ')+require('./publishing-policy').disclosure().package_names[o.plan]:'Premium listening · '+require('./premium-pricing').catalog().plans.find(p=>p.code===o.plan)?.name;
   await db.query('INSERT INTO manual_bank_payments(id,artist_order_id,listener_order_id,quote_id,attempt_id,reference,merchant_id,mode,bank_account,product_label,expires_at,guest_order_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,r==='artist'?o.id:null,r==='listener'?o.id:null,quote,attempt,reference,settings.merchant_id,settings.mode,JSON.stringify(settings.account),label,expiry,r==='guest'?o.id:null]);
   if(r!=='guest')await require('./financial-policy').accept(db,r,o.id,owner);
   await audit(db,(r==='guest'?{type:'provider',id:'guest-bank'}:{type:r,id:owner}),'manual_bank.instructions',id,{order_id:o.id,quote_id:quote,mode:settings.mode,charge_currency:settings.account.currency,charge_minor:charge});
   return view(await owned(db,r,owner,id));
  });}).then(saved=>get(r,owner,saved.id));
 }
 async function submit(r,owner,id,key,input){
  role(r);const payer=text(input?.payer_name,'the sender’s bank account name'),image=proof(input?.proof);if(!image.bytes)throw fail(400,'Upload your payment receipt.');
  return transaction(pool,async db=>{await lockOwner(db,r,owner);return idempotent(db,'manual-bank-submit:'+r+':'+owner,key,{id,payer,proof_hash:digest(image.bytes.toString('base64'))},async()=>{
   const m=await owned(db,r,owner,id,true);if(m.status!=='awaiting_transfer')throw fail(409,'This bank payment already has a confirmation or final decision.');
   await db.query('INSERT INTO manual_bank_submissions(payment_id,payer_name,transfer_reference,transferred_at,note,proof,proof_mime) VALUES($1,$2,NULL,NULL,\'\',$3,$4)',[id,payer,image.bytes,image.mime]);
   await db.query("UPDATE manual_bank_payments SET status='submitted',updated_at=NOW() WHERE id=$1",[id]);
   await audit(db,(r==='guest'?{type:'provider',id:'guest-bank'}:{type:r,id:owner}),'manual_bank.submit',id,{proof_attached:!!image.bytes});return view(await owned(db,r,owner,id));
  });});
 }
 async function cancel(r,owner,id,key){return transaction(pool,async db=>{await lockOwner(db,r,owner);return idempotent(db,'manual-bank-cancel:'+r+':'+owner,key,{id},async()=>{const m=await owned(db,r,owner,id,true);if(m.status!=='awaiting_transfer')throw fail(409,'A submitted or reviewed payment cannot be cancelled.');await db.query("UPDATE manual_bank_payments SET status='cancelled',updated_at=NOW() WHERE id=$1",[id]);await audit(db,(r==='guest'?{type:'provider',id:'guest-bank'}:{type:r,id:owner}),'manual_bank.cancel',id);return view(await owned(db,r,owner,id));});});}
 async function report(status){if(status&&!['awaiting_transfer','submitted','approved','rejected','cancelled'].includes(status))throw fail(400,'Choose a payment status.');return (await pool.query(SELECT.replace('SELECT m.*','SELECT COALESCE(c.display_name,l.display_name,g.email) AS customer_name,COALESCE(c.email,l.email,g.email) AS customer_email,m.*')+" LEFT JOIN commerce_orders ao ON ao.id=m.artist_order_id LEFT JOIN creators c ON c.id=ao.artist_id LEFT JOIN premium_orders po ON po.id=m.listener_order_id LEFT JOIN listeners l ON l.id=po.listener_id LEFT JOIN guest_purchase_orders g ON g.id=m.guest_order_id"+(status?' WHERE m.status=$1':'')+' ORDER BY m.created_at DESC LIMIT 200',status?[status]:[])).rows.map(view);}
 async function review(principal,id,key,input){
  if(!principal||!['owner','finance'].includes(principal.role))throw fail(403,'Owner or finance access is required.');if(principal.source==='named'&&principal.mfa_recent!==true)throw fail(403,'Confirm administrator MFA before reviewing payments.');
  if(!UUID.test(id||''))throw fail(400,'Invalid bank payment reference.');if(!['approved','rejected'].includes(input?.decision))throw fail(400,'Approve or reject this submitted payment.');const note=input.note?text(input.note,'a review note',10,1000):(input.decision==='approved'?'Receipt verified in the business bank account.':'Payment not confirmed. Contact support if you transferred.');
  return transaction(pool,async db=>{
   const who=(await db.query('SELECT a.artist_id,p.listener_id,g.session_hash FROM manual_bank_payments m LEFT JOIN commerce_orders a ON a.id=m.artist_order_id LEFT JOIN premium_orders p ON p.id=m.listener_order_id LEFT JOIN guest_purchase_orders g ON g.id=m.guest_order_id WHERE m.id=$1',[id])).rows[0];if(!who)throw fail(404,'Bank payment was not found.');const r=who.session_hash?'guest':who.artist_id?'artist':'listener',owner=who.session_hash||who.artist_id||who.listener_id;await lockOwner(db,r,owner);
   return idempotent(db,'manual-bank-review',key,{id,...input},async()=>{
    const m=await owned(db,r,owner,id,true),old=(await db.query('SELECT * FROM manual_bank_reviews WHERE payment_id=$1',[id])).rows[0];if(old){if(old.decision!==input.decision)throw fail(409,'This payment already has a final decision.');return view(m);}
    if(!['awaiting_transfer','submitted'].includes(m.status)||input.decision==='approved'&&m.status!=='submitted')throw fail(409,'Only submitted confirmations can be approved.');
    let bankReference=null,bankHash=null,received=null,amount=null,currency=null,receiptHash=null;
    const method=input.bank_reference===undefined?'receipt_review':'bank_details';
    if(input.decision==='approved'){
     if(input.receipt_verified!==true)throw fail(400,'Verify the cleared receipt in the business bank account before approving.');
     const evidence=(await db.query('SELECT proof FROM manual_bank_submissions WHERE payment_id=$1',[id])).rows[0];
     if(evidence?.proof){
      receiptHash=crypto.createHash('sha256').update(evidence.proof).digest('hex');
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['manual-bank-proof:'+m.mode+':'+receiptHash]);
      if((await db.query("SELECT 1 FROM manual_bank_reviews r JOIN manual_bank_submissions s ON s.payment_id=r.payment_id WHERE r.mode=$1 AND r.decision='approved' AND s.proof=$2",[m.mode,evidence.proof])).rowCount)throw fail(409,'This receipt has already activated another purchase. Check the bank before approving.');
     }
     if(method==='bank_details'){
     bankReference=text(input.bank_reference,'the bank’s unique transaction reference',6).toUpperCase().replace(/\s+/g,'');if(!/^[A-Z0-9_.:/-]{6,160}$/.test(bankReference)||bankReference===m.reference)throw fail(400,'Use the unique bank transaction reference, not the LAE payment reference.');
     bankHash=digest(bankReference);currency=input.currency;if(currency!==m.charge_currency)throw fail(400,'The bank receipt currency must match this invoice.');amount=money.majorToMinor(input.received_amount,currency);if(amount!==Number(m.charge_minor))throw fail(409,'The cleared amount does not match the exact invoice. Reconcile underpayments or overpayments before activation.');
     received=date(input.received_at,'the bank receipt date');if(+received>Date.now()+300000||+received<+new Date(m.created_at)-300000||+received>+new Date(m.expires_at))throw fail(409,'The bank receipt falls outside this invoice’s transfer window. Reconcile it before activation.');
     await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['manual-bank-receipt:'+m.mode+':'+bankHash]);
     if((await db.query('SELECT 1 FROM manual_bank_reviews WHERE mode=$1 AND bank_reference_hash=$2',[m.mode,bankHash])).rowCount)throw fail(409,'This bank receipt has already activated another purchase.');
     }else{
      // The administrator confirms the invoice against the bank. Do not invent a
      // bank transaction reference or receipt time from the uploaded image.
      currency=m.charge_currency;amount=Number(m.charge_minor);
      if(input.currency!==undefined&&input.currency!==currency)throw fail(400,'The bank receipt currency must match this invoice.');
      if(input.received_amount!==undefined&&money.majorToMinor(input.received_amount,currency)!==amount)throw fail(409,'The cleared amount does not match the exact invoice.');
      bankHash=digest('manual-bank-approval:'+id);
     }
    }
    await db.query('INSERT INTO manual_bank_reviews(payment_id,decision,administrator_id,note,merchant_id,mode,bank_reference,bank_reference_hash,received_at,received_minor,currency,verification_method,receipt_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[id,input.decision,String(principal.id),note,m.merchant_id,m.mode,bankReference,method==='bank_details'?bankHash:null,received,amount,currency,method,receiptHash]);
    if(input.decision==='approved'&&r!=='guest'){
     const payment={id:bankHash,orderId:m.artist_order_id||m.listener_order_id,quoteId:m.quote_id,reference:m.reference,merchantId:m.merchant_id,status:'paid',currency:m.charge_currency,amountMinor:Number(m.charge_minor),mode:m.mode};
     if(r==='artist'){
      const order=(await db.query('SELECT * FROM commerce_orders WHERE id=$1 FOR UPDATE',[m.artist_order_id])).rows[0];if(order.status!=='pending')throw fail(409,'This purchase has already been paid or cancelled.');
      await require('./commerce').fulfillPaidOrder(db,order,'manual-bank:'+id,{provider:PROVIDER,merchantId:m.merchant_id,paymentId:bankHash,eventId:'manual-bank:'+id,payloadHash:digest({id,bankHash,amount,currency}),mode:m.mode});
      await db.query("INSERT INTO payment_presentments(order_id,attempt_id,quote_id,provider,merchant_id,payment_id,reference,mode,base_currency,base_minor,charge_currency,charge_minor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'USD',$9,$10,$11)",[order.id,m.attempt_id,m.quote_id,PROVIDER,m.merchant_id,bankHash,m.reference,m.mode,order.amount_minor,m.charge_currency,m.charge_minor]);
      await db.query("UPDATE payment_checkout_attempts SET status='paid',updated_at=NOW() WHERE id=$1",[m.attempt_id]);
      await require('./partner-attribution').recordStudioTeam(db,order);
      await audit(db,{type:'provider',id:PROVIDER},'purchase.fulfill',order.id,{reference:'manual-bank:'+id,kind:order.kind,amount_minor:Number(order.amount_minor)});
     }else await premium.fulfillVerified(db,{name:PROVIDER,merchantId:m.merchant_id,mode:m.mode},payment);
    }
    await db.query('UPDATE manual_bank_payments SET status=$2,updated_at=NOW() WHERE id=$1',[id,input.decision]);
    await audit(db,{type:'admin',id:principal.id},'manual_bank.'+input.decision,id,{note,mode:m.mode,verification_method:method,receipt_hash:receiptHash,bank_reference_hash:method==='bank_details'?bankHash:null,charge_minor:amount,charge_currency:currency});return view(await owned(db,r,owner,id));
   });
  });
 }
 async function receipt(r,owner,id,principal){if(!UUID.test(id||''))throw fail(400,'Invalid bank payment reference.');let m;if(principal){if(!['owner','finance'].includes(principal.role))throw fail(403,'Finance access is required.');m=(await pool.query('SELECT id FROM manual_bank_payments WHERE id=$1',[id])).rows[0];}else m=await owned(pool,r,owner,id);if(!m)throw fail(404,'Receipt unavailable.');const p=(await pool.query('SELECT proof,proof_mime FROM manual_bank_submissions WHERE payment_id=$1',[id])).rows[0];if(!p?.proof)throw fail(404,'No receipt image was attached.');return {bytes:p.proof,mime:p.proof_mime};}
 return {capabilities,list,get,start,submit,cancel,report,review,receipt};
}
module.exports={createManualBankPayments,proof,PROVIDER};
