import {refundConditions} from './financial-policy.js';
import {openBankPayment} from './manual-bank-payments.js';

export async function guestBankCheckoutPage(view,url,ctx){
 const {api,e,heading,notice,buttonLink,bindForm,keyFor,clearKey,navigate,session,refreshSession,route}=ctx;
 const state=await api('/api/platform/guest-payments');if(!view.active())return;
 const purchase=state.purchase;
 if(purchase?.payment){
  const p=purchase.payment,user=session[purchase.role];
  const activate=async()=>{const input={};await api('/api/platform/guest-payments/claim','POST',input,{headers:{'Idempotency-Key':keyFor('guest-payment-claim',input)}});clearKey('guest-payment-claim');await refreshSession();navigate(purchase.role==='artist'?'/workspace?tab=membership':'/premium');};
  const ready=p.status==='approved',matching=user&&user.email?.toLowerCase()===purchase.email;
  if(ready&&matching&&!purchase.claimed){
   view.set(heading('PAYMENT VERIFIED','Activating your purchased package…','Your account and verified payment are being connected.'));
   try{await activate();}catch(error){if(view.active())view.set(heading('PAYMENT VERIFIED','Your payment is safe.',error.message)+'<button class="button" id="retry-activation">Try activation again</button>');const retry=document.getElementById('retry-activation');if(retry)retry.onclick=()=>route();}return;
  }
  const closed=['cancelled','rejected'].includes(p.status);
  const join='/join?role='+purchase.role+'&mode=register&return=bank-payment';
  if(!view.set(heading('YOUR BANK PAYMENT',purchase.claimed?'Your purchased package is active.':ready?'Payment verified. Finish your account setup.':'Your payment instructions and status.',p.product_label)+
   `<section class="panel"><h2>${e(p.amount)} · ${e(p.product_label)}</h2><p>Account email: ${e(purchase.email)}</p><p>Payment reference: <strong>${e(p.reference)}</strong></p><p role="status">${e(p.notice)}</p>${p.status==='awaiting_transfer'?`<p>Bank: ${e(p.bank_account.bank_name)}</p><p>Account name: ${e(p.bank_account.account_name)}</p><p>Account number: <strong>${e(p.bank_account.account_number)}</strong></p><p>Send exactly ${e(p.amount)}, then submit your confirmation.</p>`:''}`+
   (closed?'<button class="button" id="guest-bank-reset">Choose another package</button>':!ready?'<button class="button" id="guest-bank-details">'+(p.status==='awaiting_transfer'?'Confirm my bank transfer':'View payment confirmation')+'</button><button class="button secondary" id="guest-bank-refresh">Check payment status</button>':purchase.claimed?buttonLink(purchase.role==='artist'?'/workspace':'/premium','Open my account'):matching?'<button class="button" id="guest-bank-activate">Activate my purchased package</button>':buttonLink(join,'Finish account setup')+buttonLink('/join?role='+purchase.role+'&mode=signin&return=bank-payment','I already finished registration',true))+'</section>'))return;
  const reset=document.getElementById('guest-bank-reset');if(reset)reset.onclick=async()=>{await api('/api/platform/guest-payments/reset','POST',{});navigate('/pay?kind='+purchase.kind+'&plan='+purchase.plan);};
  const details=document.getElementById('guest-bank-details');if(details)details.onclick=()=>openBankPayment(ctx,{role:'guest',paymentId:p.id});
  const refresh=document.getElementById('guest-bank-refresh');if(refresh)refresh.onclick=()=>route();
  const activateButton=document.getElementById('guest-bank-activate');if(activateButton)activateButton.onclick=activate;
  if(p.status==='submitted')setTimeout(()=>{if(view.active()&&!document.hidden)route();},15000);
  if(url.searchParams.get('details')==='1'&&details)await openBankPayment(ctx,{role:'guest',paymentId:p.id});
  return;
 }
 if(!state.capabilities?.enabled){view.set(heading('BANK PAYMENT','Bank checkout is temporarily unavailable.','Please return shortly or sign in to review an existing purchase.')+buttonLink('/join','Sign in',true));return;}
 const kind=url.searchParams.get('kind')==='premium_listener'?'premium_listener':'artist_subscription',role=kind==='premium_listener'?'listener':'artist',plan=url.searchParams.get('plan')||(role==='artist'?'starter':'quarterly');
 if(session.artist||session.listener){view.set(heading('YOUR EXISTING ACCOUNT','Continue in your account.','Use your existing email and password. You do not need another registration.')+buttonLink(role==='artist'?(session.artist?'/workspace?tab=plans&product='+encodeURIComponent(plan):'/account?tab=roles&role=listener'):(session.listener?'/premium?plan='+encodeURIComponent(plan):'/account?tab=roles&role=artist'),'Continue with my account'));return;}
 const catalog=await api(role==='artist'?'/api/plans':'/api/platform/premium/plans'),product=role==='artist'?catalog.plans?.[plan]:catalog.plans?.find(p=>p.code===plan);
 if(!product)throw Error('Choose an available package.');
 const price=role==='artist'?'$'+product.usd+' USD / year':'$'+(product.amount_minor/100).toFixed(2)+' USD',label=product.name;
 const policy=await api('/api/platform/financial-policy');
 if(!view.set(heading('PAY BEFORE ACCOUNT SETUP',label+' · '+price,'Your exact Naira amount and official bank details will appear before you transfer. Create your account after the administrator confirms receipt.')+
  `<section class="panel"><form id="guest-bank-start"><label>Account email<input type="email" name="email" autocomplete="email" maxlength="254" required></label><p>Use the email you want for your LAE-MUSIC account. Your password and full account details come after payment verification.</p>${refundConditions(policy,e,role)}<button class="button" type="submit">Show official bank instructions</button><p class="form-status" role="status"></p></form>${buttonLink('/join?role='+role+'&mode=signin'+(role==='artist'?'&product='+encodeURIComponent(plan):'&return=premium&plan='+encodeURIComponent(plan))+(url.searchParams.get('ref')?'&ref='+encodeURIComponent(url.searchParams.get('ref')):''),'Already registered? Sign in',true)}</section>`))return;
 bindForm(document.getElementById('guest-bank-start'),async b=>{
  const data={email:b.email,kind,plan,ref:url.searchParams.get('ref')||'',policy_revision:policy.revision,policy_accepted:document.querySelector('#guest-bank-start [name="policy_accepted"]').checked};
  await api('/api/platform/guest-payments','POST',data,{headers:{'Idempotency-Key':keyFor('guest-bank-start',data)}});clearKey('guest-bank-start');navigate('/pay?details=1');
 });
}
