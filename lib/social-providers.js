'use strict';
const crypto=require('node:crypto'),{fail}=require('./transactions');
const NAMES={google:'Google',facebook:'Facebook',tiktok:'TikTok'};
function configuration(env={}){
 let origin='';try{const u=new URL(env.SOCIAL_AUTH_ORIGIN);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.pathname==='/'&&!u.search&&!u.hash)origin=u.origin;}catch{}
 const entries={google:{clientId:env.GOOGLE_OAUTH_CLIENT_ID,secret:env.GOOGLE_OAUTH_CLIENT_SECRET},facebook:{clientId:env.FACEBOOK_APP_ID,secret:env.FACEBOOK_APP_SECRET,version:env.FACEBOOK_GRAPH_VERSION},tiktok:{clientId:env.TIKTOK_CLIENT_KEY,secret:env.TIKTOK_CLIENT_SECRET}};
 return Object.fromEntries(Object.entries(entries).map(([id,c])=>[id,{...c,id,name:NAMES[id],origin,redirect:origin+'/api/platform/social/'+id+'/callback',enabled:!!origin&&env.SOCIAL_AUTH_ENABLED==='true'&&env['SOCIAL_'+id.toUpperCase()+'_ENABLED']==='true'&&typeof c.clientId==='string'&&c.clientId.length>=3&&c.clientId.length<=300&&!/\s/.test(c.clientId)&&typeof c.secret==='string'&&c.secret.length>=8&&(id!=='facebook'||/^v\d{2}\.\d+$/.test(c.version||''))}]));
}
function authorizationUrl(c,{state,verifier,nonce}){
 const url=new URL(c.id==='google'?'https://accounts.google.com/o/oauth2/v2/auth':c.id==='facebook'?'https://www.facebook.com/'+c.version+'/dialog/oauth':'https://www.tiktok.com/v2/auth/authorize/');
 url.search=new URLSearchParams({[c.id==='tiktok'?'client_key':'client_id']:c.clientId,redirect_uri:c.redirect,response_type:'code',scope:c.id==='google'?'openid email profile':c.id==='facebook'?'public_profile,email':'user.info.basic',state}).toString();
 if(c.id==='google'){url.searchParams.set('code_challenge',crypto.createHash('sha256').update(verifier).digest('base64url'));url.searchParams.set('code_challenge_method','S256');url.searchParams.set('nonce',nonce);}
 return url.href;
}
let googleKeys;
async function verifyGoogleIdToken(token,c,nonceHash,{key,now=new Date()}={}){
 if(typeof token!=='string'||token.length>20000)throw fail(502,'Google did not return a valid identity.');
 const {jwtVerify,createRemoteJWKSet}=await import('jose');googleKeys||=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'),{timeoutDuration:10000});
 const {payload}=await jwtVerify(token,key||googleKeys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:c.clientId,algorithms:['RS256'],currentDate:now,requiredClaims:['exp','iat','sub','nonce'],maxTokenAge:'10 minutes',clockTolerance:30});
 if((payload.azp&&payload.azp!==c.clientId)||(Array.isArray(payload.aud)&&payload.aud.length>1&&payload.azp!==c.clientId)||typeof payload.nonce!=='string'||crypto.createHash('sha256').update(payload.nonce).digest('hex')!==nonceHash)throw fail(502,'Google identity binding could not be verified.');
 return {subject:payload.sub,name:payload.name,email:payload.email,email_verified:payload.email_verified===true};
}
function normalizedIdentity(value){
 if(!value||typeof value.subject!=='string'||!value.subject||value.subject.length>300||/[\u0000-\u0020]/.test(value.subject))throw fail(502,'The social account identity could not be verified.');
 const name=typeof value.name==='string'?value.name.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,100):'';
 const email=typeof value.email==='string'?value.email.trim().toLowerCase():'';
 const validEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=254;return {subject:value.subject,name,email:validEmail?email:'',email_verified:validEmail&&value.email_verified===true};
}
async function exchangeIdentity(c,flow,code,{fetcher=fetch,verifyGoogle=verifyGoogleIdToken,now=()=>Date.now()}={}){
 async function request(url,options={}){
  try{const r=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();const text=await r.text();if(text.length>100000)throw Error();const data=JSON.parse(text);if(data.error&&data.error.code!=='ok')throw Error();return data;}catch{throw fail(502,c.name+' sign-in could not be verified. Please try again.');}
 }
 const tokenUrl=c.id==='google'?'https://oauth2.googleapis.com/token':c.id==='facebook'?'https://graph.facebook.com/'+c.version+'/oauth/access_token':'https://open.tiktokapis.com/v2/oauth/token/';
 const form=new URLSearchParams({[c.id==='tiktok'?'client_key':'client_id']:c.clientId,client_secret:c.secret,code,redirect_uri:c.redirect,grant_type:'authorization_code'});if(c.id==='google')form.set('code_verifier',flow.verifier);
 const token=await request(tokenUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
 if(typeof token.access_token!=='string'||!token.access_token||token.access_token.length>16000||/[\r\n]/.test(token.access_token)||(token.token_type&&token.token_type.toLowerCase()!=='bearer'))throw fail(502,'The provider did not return a usable sign-in token.');
 if(c.id==='google'){try{return normalizedIdentity(await verifyGoogle(token.id_token,c,flow.nonce_hash));}catch{throw fail(502,'Google identity could not be verified. Please try again.');}}
 const headers={Authorization:'Bearer '+token.access_token};
 if(c.id==='facebook'){
  const debug=new URL('https://graph.facebook.com/'+c.version+'/debug_token');debug.searchParams.set('input_token',token.access_token);
  const check=(await request(debug.href,{headers:{Authorization:'Bearer '+c.clientId+'|'+c.secret}})).data;
  if(!check?.is_valid||String(check.app_id)!==c.clientId||check.type!=='USER'||!check.user_id||!Number.isFinite(check.expires_at)||check.expires_at<=now()/1000||!Number.isFinite(check.data_access_expires_at)||check.data_access_expires_at<=now()/1000)throw fail(502,'Facebook identity binding could not be verified.');
  const profile=new URL('https://graph.facebook.com/'+c.version+'/me');profile.searchParams.set('fields','id,name,email');profile.searchParams.set('appsecret_proof',crypto.createHmac('sha256',c.secret).update(token.access_token).digest('hex'));
  const user=await request(profile.href,{headers});if(String(user.id)!==String(check.user_id))throw fail(502,'Facebook identity did not match the verified account.');return normalizedIdentity({subject:String(user.id),name:user.name,email:user.email,email_verified:false});
 }
 if(!String(token.scope||'').split(',').includes('user.info.basic')||typeof token.open_id!=='string')throw fail(502,'TikTok did not grant the required sign-in permission.');
 const result=await request('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',{headers}),user=result.data?.user;
 if(!user||user.open_id!==token.open_id)throw fail(502,'TikTok identity did not match the verified account.');
 return normalizedIdentity({subject:user.open_id,name:user.display_name,email:'',email_verified:false});
}
module.exports={NAMES,configuration,authorizationUrl,exchangeIdentity,normalizedIdentity,verifyGoogleIdToken};
