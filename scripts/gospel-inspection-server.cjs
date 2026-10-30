'use strict';
// A temporary read-only presentation of the real studio assets. No production engine,
// credentials, databases, provider SDKs or mutation routes are started by this server.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),launch=require('../lib/studio-launch');
const notice='READ-ONLY STUDIO INSPECTION — Current PR #12 interface. Sample workspace, not a real account or credit balance. Select groups/styles and inspect both creation methods. Generation, uploads, recording, payment and account changes are unavailable; no paid API calls are possible.';
const viewer=`const style=document.createElement('style');style.textContent='form button[type="submit"],#studio-record-voice,#studio-save-voice,#studio-refresh-voice,#copy-studio-code,.player,#global-search,#header-signin,#header-workspace,#currency-trigger{display:none!important}#inspection-banner{margin:16px;padding:20px;border:2px solid #c9fb75;border-radius:12px;background:#151b18;color:#fff}#inspection-banner a{color:#c9fb75}';document.head.append(style);const banner=document.createElement('section');banner.id='inspection-banner';banner.setAttribute('aria-label','Read-only inspection notice');banner.innerHTML='<strong>READ-ONLY STUDIO INSPECTION</strong><p>'+${JSON.stringify(notice)}+'</p><a href="/inspection-list" target="_blank" rel="noopener">Open the exact current groups and styles list ↗</a>';document.body.prepend(banner);document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();},true);document.addEventListener('click',e=>{const a=e.target.closest('a');if(a&&a.pathname!=='/studio'&&a.pathname!=='/inspection-list'&&a.origin===location.origin){e.preventDefault();e.stopImmediatePropagation();}},true);`;
function fixture(p){
 switch(p){
 case '/api/platform/session':return {artist:{id:1,display_name:'Read-only inspection workspace',country:'NG'},listener:null,admin:false};
 case '/api/platform/capabilities':return {inspection_only:true,music_provider_configured:true,lyrics_configured:true,studio_release_import:false,voice_upload_available:false,payments:false,payouts:false,payment_mode:'disabled',review_tools:false,offline_listening:false,email_delivery_enabled:false};
 case '/api/platform/currencies':return require('../lib/currency').options();
 case '/api/platform/pricing':return {country:'NG',currency:'USD',base_currency:'USD',plans:[]};
 case '/api/artist/studio-allowance':return {active:true,included_generations:2,remaining_generations:2,inspection_sample:true};
 case '/api/generation/wallet':return {credits:2,inspection_sample:true};
 case '/api/generation/history':return {records:[]};
 case '/api/artist/studio-history':return {generations:[]};
 case '/api/voice/profile':return {hasVoice:false,status:'none'};
 case '/api/platform/studio/catalog':return launch.legacyCatalogue();
 case '/api/platform/studio/dna/catalog':return launch.catalogue();
 case '/api/platform/account/capabilities':return {email_delivery_enabled:false};
 default:return null;
 }
}
function createServer(){return http.createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'; worker-src 'none'");
 const send=(status,body,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type});res.end(req.method==='HEAD'?undefined:body);};
 if(!['GET','HEAD'].includes(req.method))return send(405,JSON.stringify({error:'Read-only inspection: generation, uploads and account changes are not connected.'}));
 let p;try{p=decodeURIComponent(new URL(req.url,'http://inspection.invalid').pathname);}catch{return send(400,'{}');}
 if(p==='/health')return send(200,JSON.stringify({status:'ok',inspection_only:true,groups:14,styles:70,lyrics_types:launch.catalogue().lyrics_types.length,paid_calls_possible:false,source_commit:process.env.RENDER_GIT_COMMIT||null}));
 if(p==='/inspection-viewer.js')return send(200,viewer,'text/javascript; charset=utf-8');
 if(p==='/inspection-list'){const text=fs.readFileSync(path.join(root,'docs/GOSPEL-STUDIO-INSPECTION-LIST.md'),'utf8'),escaped=text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');return send(200,'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Current Gospel studio list</title><body style="background:#111713;color:#f5f5f5;font:16px/1.6 system-ui;padding:20px;max-width:900px;margin:auto"><a href="/studio" style="color:#c9fb75">Back to studio</a><pre style="white-space:pre-wrap;font:inherit">'+escaped+'</pre></body></html>','text/html; charset=utf-8');}
 if(p.startsWith('/api/')){const f=fixture(p);return send(f?200:404,JSON.stringify(f||{error:'This route is outside the read-only studio inspection.'}));}
 if(p==='/'||p==='/studio')return send(200,fs.readFileSync(path.join(root,'web/index.html'),'utf8').replace('</head>','<script src="/inspection-viewer.js" defer></script></head>'),'text/html; charset=utf-8');
 if(p.startsWith('/web/')){const file=path.resolve(root,'.'+p);if(!file.startsWith(path.join(root,'web')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return send(404,'{}');const ext=path.extname(file),types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.webmanifest':'application/manifest+json'};return send(200,fs.readFileSync(file),types[ext]||'application/octet-stream');}
 return send(404,JSON.stringify({error:'Open /studio for read-only inspection.'}));
 });}
module.exports={createServer,fixture};
if(require.main===module)createServer().listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Read-only Gospel interface inspection ready; no database or provider connections.'));
