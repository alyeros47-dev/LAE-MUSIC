'use strict';
const crypto=require('node:crypto');
const {fail,transaction,audit}=require('./transactions');
const definitions=require('../config/community-campaigns.json');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const UTM=['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
function attribution(params){
 const result={};
 for(const key of UTM){const value=params.get(key)||'';if(/^[a-zA-Z0-9 _.-]{1,80}$/.test(value)&&!/[\w.-]+@[\w.-]+/.test(value))result[key]=value;}
 return result;
}
function invitation(value){
 if(value==='')return '';
 if(typeof value!=='string')throw fail(400,'Enter a WhatsApp group invitation link.');
 let url;try{url=new URL(value.trim());}catch{throw fail(400,'Enter a WhatsApp group invitation link.');}
 if(url.protocol!=='https:'||url.hostname!=='chat.whatsapp.com'||url.port||url.username||url.password||!/^\/[a-zA-Z0-9_-]{16,64}\/?$/.test(url.pathname)||url.hash)throw fail(400,'Use the group invitation link from chat.whatsapp.com.');
 // WhatsApp share parameters are unnecessary; retain only the actual invite.
 return url.origin+url.pathname.replace(/\/$/,'');
}
function createCampaigns({pool,env=process.env,now=Date.now}={}){
 const key=crypto.createHmac('sha256',env.CAMPAIGN_TOKEN_KEY||env.ADMIN_KEY||crypto.randomBytes(32)).update('lae-community-click-v1').digest();
 const known=slug=>definitions.find(c=>c.slug===slug);
 let cached=null,until=0,loading;
 async function settings(){
  if(!pool)return new Map();
  if(cached&&now()<until)return cached;
  if(!loading)loading=(async()=>{const rows=(await pool.query('SELECT slug,invitation_url,pixel_id FROM community_campaign_settings')).rows;cached=new Map(rows.map(r=>[r.slug,r]));until=now()+60000;return cached;})().finally(()=>{loading=null;});
  return loading;
 }
 async function ensure(db){for(const c of definitions)await db.query('INSERT INTO community_campaign_settings(slug) VALUES($1) ON CONFLICT DO NOTHING',[c.slug]);}
 async function save(input,actor){
  if(!pool)throw fail(503,'The database is unavailable.');
  if(!known(input?.slug))throw fail(404,'Community not found.');
  const link=invitation(input.invitation_url),pixel=String(input.pixel_id||'');
  if(pixel&&!/^\d{5,25}$/.test(pixel))throw fail(400,'Enter a valid Meta Pixel ID or leave it blank.');
  await transaction(pool,async db=>{
   await db.query('INSERT INTO community_campaign_settings(slug,invitation_url,pixel_id) VALUES($1,$2,$3) ON CONFLICT(slug) DO UPDATE SET invitation_url=EXCLUDED.invitation_url,pixel_id=EXCLUDED.pixel_id,updated_at=NOW()',[input.slug,link,pixel]);
   await audit(db,{type:'admin',id:actor||'session'},'campaign.settings',input.slug,{invitation_configured:!!link,pixel_configured:!!pixel});
  });cached=null;until=0;
  return {ok:true};
 }
 async function record(db,slug,utm,kind){
  await db.query(`INSERT INTO community_campaign_daily(slug,attribution,visits,clicks) VALUES($1,$2,$3,$4) ON CONFLICT(slug,day,attribution) DO UPDATE SET visits=community_campaign_daily.visits+EXCLUDED.visits,clicks=community_campaign_daily.clicks+EXCLUDED.clicks`,[slug,JSON.stringify(utm),kind==='visit'?1:0,kind==='click'?1:0]);
 }
 function token(slug,utm){
  const data=Buffer.from(JSON.stringify({slug,utm,nonce:crypto.randomBytes(16).toString('hex'),expires:now()+1800000})).toString('base64url');
  return data+'.'+crypto.createHmac('sha256',key).update(data).digest('base64url');
 }
 function readToken(value,slug){
  if(typeof value!=='string'||value.length>1800)return null;
  const [data,mac,...rest]=value.split('.'),expected=crypto.createHmac('sha256',key).update(data||'').digest('base64url');
  if(rest.length||!mac||mac.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))return null;
  try{const decoded=JSON.parse(Buffer.from(data,'base64url'));return decoded.slug===slug&&decoded.expires>now()?decoded:null;}catch{return null;}
 }
 async function report(){
  if(!pool)throw fail(503,'The database is unavailable.');
  await ensure(pool);
  // Remove only expired click-deduplication tokens; daily totals remain intact.
  await pool.query('DELETE FROM community_campaign_clicks WHERE expires_at<NOW()');
  const config=await settings(),rows=(await pool.query("SELECT slug,day,attribution,visits,clicks FROM community_campaign_daily WHERE day >= (NOW() AT TIME ZONE 'UTC')::date-89 ORDER BY day DESC,slug,attribution LIMIT 5001")).rows;
  const totals=(await pool.query('SELECT slug,COALESCE(SUM(visits),0)::text AS visits,COALESCE(SUM(clicks),0)::text AS clicks FROM community_campaign_daily GROUP BY slug')).rows;
  return {campaigns:definitions.map(c=>({...c,...config.get(c.slug),invitation_url:config.get(c.slug)?.invitation_url||'',pixel_id:config.get(c.slug)?.pixel_id||'',warning:config.get(c.slug)?.invitation_url?'':'Add the correct WhatsApp group invitation link before advertising.',...(totals.find(r=>r.slug===c.slug)||{visits:'0',clicks:'0'})})),daily:rows.slice(0,5000),truncated:rows.length>5000,period:'Last 90 days; totals cover all recorded days. Times are UTC.',notice:'Visits are page loads. Clicks are WhatsApp button clicks, not confirmed group members. Bots, blockers and connection failures can affect counts. Do not put personal details in UTM campaign names.'};
 }
 function html(c,config,click){
  const ready=!!config?.invitation_url;
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>'+escape(c.identity)+' | LAE-MUSIC</title><meta name="description" content="'+escape(c.description)+'"><link rel="icon" href="/web/campaign-logo.webp"><link rel="stylesheet" href="/web/ui.css"><link rel="stylesheet" href="/web/community-campaigns.css"><script defer src="/web/community-campaigns.js"></script></head><body class="community-landing"><main class="community-card"><img class="community-logo" src="/web/campaign-logo.webp" width="320" height="107" alt="LAE-MUSIC"><p class="community-eyebrow">'+escape(c.identity)+'</p><span class="community-tag">CREATE · CONNECT · GROW</span><h1>'+escape(c.headline)+'</h1><p class="community-description">'+escape(c.description)+'</p>'+(ready?'<a class="community-join" id="community-join" href="/join/'+c.slug+'/whatsapp?t='+escape(click)+'">Join WhatsApp Group <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 18 18 6M6 6h12v12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>':'<button class="community-join" disabled>Join WhatsApp Group</button><p class="community-unavailable" role="status">Invitations are not open yet. Please check back soon.</p>')+'<p class="community-note">Free to join. No LAE-MUSIC registration or payment needed.</p>'+(config?.pixel_id?'<div class="community-consent" id="ad-consent" data-pixel="'+escape(config.pixel_id)+'" hidden><p>Allow Meta ad measurement on this page? Meta may use cookies.</p><div><button id="allow-ads">Allow</button><button id="decline-ads">Not now</button></div></div>':'')+'<footer>LAE-MUSIC · Music brings us together.</footer></main></body></html>';
 }
 async function handle(req,res,url,{admin,body,json}){
  const p=url.pathname;
  if(p==='/api/platform/admin/campaigns'){
   admin(req);
   if(req.method==='GET')json(res,200,await report());
   else if(req.method==='POST')json(res,200,await save(await body(req,4000),req.adminPrincipal?.id));
   else json(res,405,{error:'Method not allowed'});
   return true;
  }
  const match=/^\/join\/([a-z0-9-]+)(\/whatsapp)?\/?$/.exec(p);if(!match||!known(match[1]))return false;
  if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'Method not allowed'});return true;}
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex,follow');
  const c=known(match[1]);let config;
  try{config=(await settings()).get(c.slug);}catch{json(res,503,{error:'Invitations are temporarily unavailable. Please try again shortly.'});return true;}
  const bot=/bot|crawler|spider|facebookexternalhit|preview|whatsapp/i.test(req.headers['user-agent']||'');
  if(match[2]){
   if(!config?.invitation_url){json(res,503,{error:'Invitations are not open yet.'});return true;}
   const data=readToken(url.searchParams.get('t'),c.slug);
   if(!data){res.writeHead(303,{Location:'/join/'+c.slug});res.end();return true;}
   if(req.method==='GET'&&!bot)try{
    await transaction(pool,async db=>{
     const claimed=await db.query('INSERT INTO community_campaign_clicks(token_hash,expires_at) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING token_hash',[crypto.createHash('sha256').update(url.searchParams.get('t')).digest('hex'),new Date(data.expires)]);
     if(claimed.rowCount)await record(db,c.slug,data.utm,'click');
    });
   }catch{console.error('Community click measurement unavailable.');}
   res.writeHead(303,{Location:config.invitation_url});res.end();return true;
  }
  const utm=attribution(url.searchParams);
  if(pool&&req.method==='GET'&&!bot)try{await pool.query('INSERT INTO community_campaign_settings(slug) VALUES($1) ON CONFLICT DO NOTHING',[c.slug]);await record(pool,c.slug,utm,'visit');}catch{console.error('Community visit measurement unavailable.');}
  const meta=config?.pixel_id?" https://connect.facebook.net https://www.facebook.com":'';
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'"+meta+"; style-src 'self'; img-src 'self' data:"+meta+"; connect-src 'self'"+meta+"; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'");
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?'':html(c,config,token(c.slug,utm)));return true;
 }
 return {handle,save,report,settings,readToken};
}
module.exports={createCampaigns,attribution,invitation,definitions};
