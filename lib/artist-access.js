'use strict';
// A shared login identifies the customer; only a verified active package unlocks
// artist production. Legacy free-test flags, stored plan names and wallet credits
// are not entitlement evidence.
const {fail}=require('./transactions');
const MODE='paid_packages_only';
const ACTIVE="SELECT id,plan,starts_at,expires_at FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' AND starts_at<=NOW() AND expires_at>NOW() AND NOT payment_hold ORDER BY expires_at DESC LIMIT 1";
function review(env){return env.NODE_ENV==='staging'&&require('./review-testing').enabled(env);}
async function status(db,artistId,env=process.env,{lock=false}={}){
 let grant=null;
 if(db){
 grant=await require('./artist-launch-access').state(db,artistId);
 if(grant.owner_unlimited)return {active:true,owner_unlimited:true,review_only:false,mode:'owner_unlimited',subscription:null};
 }

 if((require('./artist-test-access').enabled(env)||review(env))&&db&&(await db.query("SELECT 1 FROM artist_subscriptions WHERE artist_id=$1 AND status='paid' AND expires_at<=NOW() AND NOT EXISTS(SELECT 1 FROM artist_subscriptions a WHERE a.artist_id=$1 AND a.status='paid' AND a.starts_at<=NOW() AND a.expires_at>NOW() AND NOT a.payment_hold) LIMIT 1",[artistId])).rowCount)return {active:false,review_only:false,mode:MODE,subscription:null};
 if(require('./artist-test-access').enabled(env))return {active:true,artist_test_access:true,review_only:false,mode:'complimentary_testing',subscription:null};
 if(review(env))return {active:true,review_only:true,mode:MODE,subscription:null};
 if(!db)throw fail(503,'The artist subscription database is unavailable.');
 const result=await db.query(ACTIVE+(lock?' FOR UPDATE':''),[artistId]);
 if(!result.rowCount&&grant?.promotion)return {active:true,promotion:true,review_only:false,mode:'artist_launch_promotion',subscription:null};
 return {active:result.rowCount>0,review_only:false,mode:MODE,subscription:result.rows[0]||null};
}
async function requirePackage(db,artistId,env=process.env,options){const result=await status(db,artistId,env,options);if(!result.active)throw fail(402,'An active, verified paid artist package is required. Choosing a package, joining as a partner or holding lyrics credits does not activate artist tools.');return result;}
function protectedOperation(method,path){
 if(path==='/api/music/description/start')return method==='POST';
 if(path==='/api/music/lyrics-generate')return method==='POST';
 if(path.startsWith('/api/music/sonic/')&&method==='POST'||path==='/api/music/sonic/wav')return true;
 if(path.startsWith('/api/music/upload/'))return true;
 if(path.startsWith('/api/voice/'))return ['POST','PUT'].includes(method);
 if(path.startsWith('/api/platform/studio/releases'))return !['GET','HEAD'].includes(method);
 if(path==='/api/generation/code/check')return method==='POST';
 if(path==='/api/platform/track')return !['GET','HEAD'].includes(method);
 return false;
}
async function guard(req,res,url,{pool,me,json,env=process.env}){if(!protectedOperation(req.method,url.pathname))return false;if(url.pathname==='/api/music/description/start'&&req.adminPrincipal?.role==='owner')return false;const user=await me(req);if(!user){json(res,401,{error:'Sign in to your LAE-MUSIC account first.'});return true;}try{await requirePackage(pool,user.id,env);await require('./creator-agreement').requireAcceptance(pool,user.id);return false;}catch(error){if(error.status!==402&&error.status!==503&&error.status!==428)throw error;json(res,error.status,{error:error.message,artist_access_mode:MODE,package_required:error.status===402,agreement_required:error.status===428});return true;}}
module.exports={MODE,ACTIVE,review,status,requirePackage,protectedOperation,guard};
