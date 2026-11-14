'use strict';
// Owner-requested SMTP check and a single live recovery round-trip. All secrets
// remain inside this runner. No raw errors, recipients, links or passwords logged.
const crypto=require('node:crypto'),{spawn}=require('node:child_process'),path=require('node:path');
const {inventory}=require('./audit-existing-service.cjs');
const ORIGIN='https://lae-music.com',SERVICE='srv-db84s7m89jmc73c7l9rg';
function checkedLink(value){const u=new URL(value);if(u.origin!==ORIGIN||u.pathname!=='/recover'||u.search||u.username||u.password||!/^#token=[a-f0-9]{64}&role=listener$/.test(u.hash))throw Error('Unexpected reset link');return u;}
function readMailbox(data){return new Promise(resolve=>{const child=spawn('python3',[path.join(__dirname,'read-gmail-reset.py')],{stdio:['pipe','pipe','ignore']}),parts=[];const timer=setTimeout(()=>{child.kill();resolve({received:false,reason:'mailbox_check_timeout'});},110000);child.stdout.on('data',p=>parts.push(p));child.on('error',()=>{clearTimeout(timer);resolve({received:false,reason:'mailbox_check_unavailable'});});child.on('close',()=>{clearTimeout(timer);try{resolve(JSON.parse(Buffer.concat(parts).toString()));}catch{resolve({received:false,reason:'mailbox_check_unavailable'});}});child.stdin.end(JSON.stringify(data));});}
async function roundtrip(env,report){
 const {chromium}=require('playwright'),browser=await chromium.launch({headless:true});let stage='test_account_registration';
 const email='laemusic067+lae-reset-'+crypto.randomBytes(8).toString('hex')+'@gmail.com',original=crypto.randomBytes(24).toString('base64url'),updated=crypto.randomBytes(24).toString('base64url');
 async function post(p,body){const r=await fetch(ORIGIN+p,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(25000)});return {status:r.status,data:await r.json()};}
 try{
  const created=await post('/api/listener/register',{name:'LAE Password Reset Test',email,password:original,confirmPassword:original});if(created.status!==201)throw Error('Test account could not be created');report.test_listener_created=true;
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(20000);
  stage='reset_request';await page.goto(ORIGIN+'/join');await page.getByRole('link',{name:'Forgot your password?',exact:true}).click();await page.getByLabel('Email address',{exact:true}).fill(email);const requested=page.waitForResponse(r=>r.url().endsWith('/api/platform/account/reset-request'));const notBefore=Date.now()/1000;await page.getByRole('button',{name:'Request reset link',exact:true}).click();if((await requested).status()!==202)throw Error('Reset request not accepted');report.reset_requested_through_live_ui=true;
  stage='inbox_receipt';const mail=await readMailbox({user:env.SMTP_USER,password:env.SMTP_PASSWORD,recipient:email,not_before:notBefore});if(!mail.received){report.mailbox_error=mail.reason;throw Error('Inbox receipt not verified');}report.actual_inbox_receipt=true;const link=checkedLink(mail.url);
  stage='reset_page';await page.goto(link.href);await page.getByRole('heading',{name:'Choose a new password.',exact:true}).waitFor();if(page.url().includes('token='))throw Error('Reset link not removed from address');report.reset_page_opened=true;
  await page.getByLabel('New password',{exact:true}).fill(updated);await page.getByLabel('Confirm new password',{exact:true}).fill(updated);stage='password_reset';await page.getByRole('button',{name:'Save new password',exact:true}).click();await page.getByRole('heading',{name:'Password updated.',exact:true}).waitFor();report.password_reset=true;
  stage='new_password_login';await page.getByRole('link',{name:'Sign in securely ↗',exact:true}).click();await page.locator('#auth-form [name=email]').fill(email);await page.locator('#auth-form [name=password]').fill(updated);const loggedIn=page.waitForResponse(r=>r.url().endsWith('/api/platform/account/login'));await page.locator('#auth-form button[type=submit]').click();if((await loggedIn).status()!==200)throw Error('New-password login failed');const session=await(await page.request.get(ORIGIN+'/api/platform/session')).json();if(String(session.listener?.id)!==String(created.data.user.id))throw Error('Session mismatch');report.new_password_login=true;
  stage='replay_and_old_password';const fragment=new URLSearchParams(link.hash.slice(1));if((await post('/api/platform/account/reset-password',{role:'listener',token:fragment.get('token'),newPassword:updated})).status!==400)throw Error('Reset link reused');report.used_link_rejected=true;
  if((await post('/api/platform/account/login',{role:'listener',email,password:original})).status!==401)throw Error('Old password accepted');report.old_password_rejected=true;
  stage='sign_out';if((await page.request.post(ORIGIN+'/api/listener/logout',{data:{},headers:{Origin:ORIGIN}})).status()!==200)throw Error('Test-session signout failed');report.test_session_signed_out=true;report.success=true;
 }catch{report.failed_stage=stage;report.success=false;}finally{await browser.close();}
 return report;
}
async function verify({key,mode,fetcher=fetch,createTransport,runRoundtrip=roundtrip}={}){
 if(!['smtp','roundtrip'].includes(mode)||!key)throw Error('Explicit SMTP verification mode required');
 const report={mode,success:false,existing_customer_passwords_changed:0,paid_provider_calls:0};
 async function get(suffix){const r=await fetcher('https://api.render.com/v1/services/'+SERVICE+suffix,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Render read unavailable');return r.json();}
 const service=await get('');if(service.id!==SERVICE||service.repo?.replace(/\.git$/,'')!=='https://github.com/alyeros47-dev/LAE-MUSIC'||service.serviceDetails?.url!=='https://lae-music.onrender.com')throw Error('Unexpected service');
 const env=inventory(await get('/env-vars'));report.saved_app_password_present=!!env.SMTP_PASSWORD;
 if(env.SMTP_HOST!=='smtp.gmail.com'||String(env.SMTP_PORT)!=='465'||env.SMTP_USER!=='laemusic067@gmail.com'||env.SMTP_FROM!==env.SMTP_USER||env.ACCOUNT_EMAIL_ORIGIN!==ORIGIN)throw Error('Gmail sender settings mismatch');
 let transport;const mailer=require('../lib/account-email').emailRuntime({env:{...env,ACCOUNT_EMAIL_ENABLED:'true'},createTransport:options=>{transport=(createTransport||require('nodemailer').createTransport)(options);return transport;}});if(!mailer.enabled())throw Error('Email configuration incomplete');
 try{await transport.verify();report.smtp_authenticated=true;}catch(e){report.smtp_authenticated=false;report.smtp_error=['EAUTH','ETIMEDOUT','ECONNECTION','ESOCKET','EDNS'].includes(e.code)?e.code:'SMTP_CONNECTION_FAILED';return report;}
 finally{transport?.close?.();}
 if(mode==='smtp'){report.success=true;return report;}
 const live=await fetcher(ORIGIN+'/api/platform/account/capabilities',{redirect:'error',signal:AbortSignal.timeout(20000)});if(!live.ok||(await live.json()).email_delivery_enabled!==true){report.failed_stage='live_recovery_disabled';return report;}
 return runRoundtrip(env,report);
}
if(require.main===module)verify({key:process.env.RENDER_API_KEY,mode:process.env.LAE_GMAIL_VERIFY_MODE}).then(r=>{console.log(JSON.stringify(r,null,2));if(!r.success)process.exitCode=1;}).catch(()=>{console.error('Gmail recovery verification could not complete. No secret values are shown.');process.exitCode=1;});
module.exports={verify,checkedLink};
