'use strict';
const crypto=require('node:crypto'),{transaction,idempotent,fail,audit}=require('./transactions');
const LIMIT=5*1024*1024;
function validate(bytes,mime){return mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':['image/png','image/jpeg'].includes(mime)&&require('./file-signatures').matches(bytes,mime);}
function createStorage({storage,presign,env=process.env,fetcher=fetch}){
 const secret=env.ACCOUNT_EMAIL_KEY||env.ADMIN_KEY||'',key=secret.length>=16?crypto.createHmac('sha256',secret).update('lae-external-rights-documents-v1').digest():null;
 function ready(){if(!key||!storage?.())throw fail(503,'Private rights-document storage is not configured.');}
 return {configured:()=>!!key&&!!storage?.(),async put(id,bytes){
  ready();const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);
  const payload=Buffer.concat([cipher.update(bytes),cipher.final()]),file=Buffer.concat([nonce,cipher.getAuthTag(),payload]),object='private-rights/'+id+'.encrypted';
  const response=await fetcher(presign(storage(),object,'put',120),{method:'PUT',headers:{'Content-Type':'application/octet-stream','Content-Length':String(file.length)},body:file,redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw fail(502,'Your document could not be saved. Please retry.');
  const verify=await fetcher(presign(storage(),object,'get',120),{redirect:'error',signal:AbortSignal.timeout(30000)});if(!verify.ok)throw fail(502,'Your saved document could not be checked.');
  const saved=await require('./media-download').readBounded(verify,LIMIT+28);if(!crypto.timingSafeEqual(crypto.createHash('sha256').update(saved).digest(),crypto.createHash('sha256').update(file).digest()))throw fail(502,'Your saved document did not pass verification.');return object;
 },async read(object){ready();if(!/^private-rights\/[a-f0-9-]{36}\.encrypted$/.test(object))throw fail(400,'Invalid document reference.');const r=await fetcher(presign(storage(),object,'get',120),{redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw fail(502,'Your document is temporarily unavailable.');const file=await require('./media-download').readBounded(r,LIMIT+28);if(file.length<29)throw fail(502,'Document verification failed.');const decipher=crypto.createDecipheriv('aes-256-gcm',key,file.subarray(0,12));decipher.setAuthTag(file.subarray(12,28));try{return Buffer.concat([decipher.update(file.subarray(28)),decipher.final()]);}catch{throw fail(502,'Document verification failed.');}}
 };
}
function createRights({pool,store}){
 async function submit(artistId,key,input){
  if(!store?.configured())throw fail(503,'Private rights-document storage is not configured.');
  const mime=input?.mime,filename=String(input?.filename||'').replace(/[^a-zA-Z0-9 ._-]/g,'').slice(0,120),data=input?.data;
  if(!filename||typeof data!=='string'||data.length>Math.ceil(LIMIT/3)*4||!/^[a-zA-Z0-9+/]+={0,2}$/.test(data))throw fail(400,'Choose a PDF, PNG or JPEG document up to 5 MB.');
  const bytes=Buffer.from(data,'base64');if(!bytes.length||bytes.length>LIMIT||!validate(bytes,mime))throw fail(400,'Choose a valid PDF, PNG or JPEG document up to 5 MB.');
  require('./transactions').requestKey(key);const sha256=crypto.createHash('sha256').update(bytes).digest('hex'),id=crypto.randomUUID(),object=await store.put(id,bytes);
  return transaction(pool,db=>idempotent(db,'external-rights:'+artistId,key,{sha256,mime,filename},async()=>{
   await db.query('INSERT INTO external_rights_documents(id,artist_id,storage_key,mime,filename,byte_length,sha256) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,artistId,object,mime,filename,bytes.length,sha256]);
   await audit(db,{type:'artist',id:artistId},'external.rights.submit',id,{mime,bytes:bytes.length});return {id,status:'pending'};
  }));
 }
 async function report(){return {documents:(await pool.query('SELECT d.id,d.artist_id,d.filename,d.mime,d.status,d.submitted_at,d.reviewed_at,d.review_note,c.display_name FROM external_rights_documents d JOIN creators c ON c.id=d.artist_id ORDER BY d.submitted_at DESC LIMIT 200')).rows,notice:'Approve only after verifying distribution and monetization rights. Approval does not release royalties or send money. Use the existing song-report tools to review and suspend disputed recordings.'};}
 async function review(actor,key,input){if(!require('./premium-utils').uuid(input?.id))throw fail(400,'Choose a valid rights document.');if(!['approved','rejected','revoked'].includes(input?.decision)||typeof input?.note!=='string'||input.note.trim().length<5||input.note.length>1000)throw fail(400,'Choose a decision and add a short review note.');
  return transaction(pool,db=>idempotent(db,'external-rights-review',key,{id:input.id,decision:input.decision,note:input.note},async()=>{
   const d=(await db.query('SELECT * FROM external_rights_documents WHERE id=$1 FOR UPDATE',[input.id])).rows[0];if(!d)throw fail(404,'Document not found.');
   await db.query('SELECT id FROM creators WHERE id=$1 FOR UPDATE',[d.artist_id]);
   await db.query('UPDATE external_rights_documents SET status=$2,reviewed_at=NOW(),reviewed_by=$3,review_note=$4 WHERE id=$1',[d.id,input.decision,actor||'owner',input.note.trim()]);
   await audit(db,{type:'admin',id:actor||'session'},'external.rights.'+input.decision,d.id,{artist_id:String(d.artist_id)});return {ok:true,status:input.decision};
  }));
 }
 async function document(id){const d=(await pool.query('SELECT * FROM external_rights_documents WHERE id=$1',[id])).rows[0];if(!d)throw fail(404,'Document not found.');const bytes=await store.read(d.storage_key);if(crypto.createHash('sha256').update(bytes).digest('hex')!==d.sha256||!validate(bytes,d.mime))throw fail(502,'Document verification failed.');return {...d,bytes};}
 return {submit,report,review,document};
}
module.exports={createStorage,createRights,validate,LIMIT};
