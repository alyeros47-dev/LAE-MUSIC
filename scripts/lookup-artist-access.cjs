'use strict';
// Read one owner-specified artist identity. The result is encrypted for the
// requesting session before it leaves the runner; no email or credential in logs.
const crypto=require('node:crypto'),{inventory}=require('./audit-existing-service.cjs');
const SERVICE='srv-db84s7m89jmc73c7l9rg';
function recipientKey(encoded){const key=crypto.createPublicKey({key:Buffer.from(encoded||'','base64'),format:'der',type:'spki'});if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<3072)throw Error('A session public key is required');return key;}
function encrypt(result,publicKey){const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const bytes=Buffer.concat([cipher.update(JSON.stringify(result),'utf8'),cipher.final()]);return {version:1,key:crypto.publicEncrypt({key:publicKey,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:bytes.toString('base64')};}
async function lookup({key,target,publicKey,fetcher=fetch,dbFactory=options=>new(require('pg').Pool)(options)}={}){
 if(!key||!/^[a-f0-9]{64}$/.test(target||''))throw Error('A single artist identifier is required');const recipient=recipientKey(publicKey);
 async function get(suffix){const r=await fetcher('https://api.render.com/v1/services/'+SERVICE+suffix,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Service read unavailable');return r.json();}
 const service=await get('');if(service.id!==SERVICE||service.repo?.replace(/\.git$/,'')!=='https://github.com/alyeros47-dev/LAE-MUSIC'||service.serviceDetails?.url!=='https://lae-music.onrender.com')throw Error('Unexpected service');
 const rows=[];let cursor='';for(let i=0;i<10;i++){const page=await get('/env-vars?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));rows.push(...page);if(page.length<100)break;cursor=page.at(-1)?.cursor;if(!cursor)throw Error('Incomplete settings');}
 const options=require('../lib/database').databaseOptions(inventory(rows));if(!options)throw Error('Database unavailable');const pool=dbFactory({...options,max:1});let db;
 try{
  db=await pool.connect();await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='10s'");
  const result=await db.query("SELECT display_name,email,(length(password_hash)>0 AND length(password_salt)>0) AS password_set,(password_hash ~ '^[a-f0-9]{128}$' AND password_salt ~ '^[a-f0-9]{32,64}$') AS password_format_valid FROM creators WHERE encode(sha256(convert_to(regexp_replace(lower(btrim(display_name)),'[[:space:]]','','g'),'UTF8')),'hex')=$1 LIMIT 6",[target]);
  await db.query('ROLLBACK');return encrypt({read_only:true,production_writes:0,matches:result.rowCount,artists:result.rows},recipient);
 }catch(error){if(db)await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db?.release();await pool.end();}
}
if(require.main===module)lookup({key:process.env.RENDER_API_KEY,target:process.env.LAE_ARTIST_NAME_SHA256,publicKey:process.env.LAE_LOOKUP_PUBLIC_KEY}).then(result=>console.log('ENCRYPTED_ARTIST_LOOKUP='+JSON.stringify(result))).catch(()=>{console.error('Artist lookup did not complete. No private values were logged.');process.exitCode=1;});
module.exports={lookup,encrypt,recipientKey};
