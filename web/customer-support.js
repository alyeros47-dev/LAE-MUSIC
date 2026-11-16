// Independent from the music player and route rendering. No account data is read.
const root=document.createElement('aside');
root.id='customer-support';root.setAttribute('aria-label','LAE-MUSIC support');
root.innerHTML=`<button class="support-launch button" aria-label="Open customer support" aria-expanded="false">Help</button>
<section class="support-window" role="dialog" aria-label="Customer support" hidden>
<header><div><strong>LAE-MUSIC support</strong><small>AI guide · Human help available</small></div><button type="button" class="support-min" aria-label="Minimize support">−</button><button type="button" class="support-close" aria-label="Close support">×</button></header>
<div class="support-messages" role="log" aria-live="polite" aria-label="Support conversation"></div>
<div class="support-suggestions" aria-label="Suggested questions"></div>
<form class="support-form"><label for="support-question">How can we help?</label><textarea id="support-question" rows="2" maxlength="1000" placeholder="Type your question…" required></textarea><div><span class="support-status" role="status"></span><button class="button" type="submit">Send</button></div></form>
<footer><button class="support-human" type="button">Talk to a person</button><button class="support-new" type="button">New chat</button><div class="support-handoff" hidden><p>Would you like to contact our customer support representative on WhatsApp?</p><label><input type="checkbox" class="support-consent"> Include a short description of the issue</label><p class="support-summary" hidden></p><a class="button" target="_blank" rel="noopener noreferrer">Open WhatsApp</a></div></footer>
</section>`;
document.body.append(root);
const $=s=>root.querySelector(s),launch=$('.support-launch'),panel=$('.support-window'),log=$('.support-messages'),form=$('form'),field=$('textarea'),send=$('button[type="submit"]'),status=$('.support-status'),handoff=$('.support-handoff');
let conversation='',busy=false,number='',summary='I need help using LAE-MUSIC.',request=null,prior='';
function text(tag,value,className=''){const n=document.createElement(tag);n.textContent=value;if(className)n.className=className;return n;}
function message(value,kind){log.append(text('p',value,'support-message '+kind));log.scrollTop=log.scrollHeight;}
function open(){panel.hidden=false;launch.hidden=true;launch.setAttribute('aria-expanded','true');field.focus();}
function close(){panel.hidden=true;launch.hidden=false;launch.setAttribute('aria-expanded','false');launch.focus();}
launch.onclick=open;$('.support-min').onclick=close;$('.support-close').onclick=close;
root.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
function handoffLink(){const include=$('.support-consent').checked;$('.support-summary').hidden=!include;$('.support-summary').textContent=summary;handoff.querySelector('a').href='https://wa.me/'+number+'?text='+encodeURIComponent('Hello LAE-MUSIC support.'+(include?' '+summary:''));}
function human(){handoff.hidden=false;if(!number){handoff.querySelector('p').textContent='WhatsApp support is temporarily unavailable. Please try again shortly.';handoff.querySelector('label').hidden=true;handoff.querySelector('a').hidden=true;}else{handoffLink();}handoff.scrollIntoView({block:'nearest'});}
$('.support-consent').onchange=handoffLink;$('.support-human').onclick=human;
$('.support-new').onclick=()=>{if(busy)return;conversation='';request=null;prior='';log.replaceChildren();message('How can I help? Please keep passwords and private details out of chat.','assistant');handoff.hidden=true;$('.support-consent').checked=false;};
async function submit(question){
 if(busy||!question.trim())return;busy=true;send.disabled=true;field.disabled=true;status.textContent='Checking…';$('.support-suggestions').hidden=true;
 // An uncertain network response retries the same key, avoiding a second AI charge.
 if(prior!==question||!request)request=crypto.randomUUID();prior=question;
 message(question,'user');field.value='';
 try{
  const r=await fetch('/api/support/chat',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':request},body:JSON.stringify({message:question,conversation}),signal:AbortSignal.timeout(60000)});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Please try again.');
  message(data.answer,'assistant');conversation=data.conversation||conversation;number=data.whatsapp_number||number;summary=data.summary||summary;
  if(data.guide){const detail=document.createElement('details');detail.append(text('summary',data.guide.title||'Help guide'),text('p',data.guide.text||''));log.append(detail);}
  const links=document.createElement('div');links.className='support-links';
  for(const item of data.links||[]){if(!/^\/(?:[a-z-]*)$/.test(item.path))continue;const a=text('a',item.label);a.href=item.path;a.setAttribute('data-nav','');links.append(a);}log.append(links);
  if(data.escalate)human();request=null;status.textContent='';log.scrollTop=log.scrollHeight;
 }catch(error){message(error.name==='TimeoutError'?'The reply is taking longer than expected. You can retry the same question or contact a person.':error.message==='Failed to fetch'?'The connection was interrupted. Please check your connection or contact a person.':error.message,'assistant');status.textContent='Could not get a reply.';human();}
 finally{busy=false;send.disabled=false;field.disabled=false;if(!panel.hidden)field.focus();}
}
form.onsubmit=e=>{e.preventDefault();submit(field.value);};
try{
 const r=await fetch('/api/support/config');if(!r.ok)throw Error();const data=await r.json();number=data.whatsapp_number||'';message(data.greeting,'assistant');
 for(const q of data.suggestions||[]){const b=text('button',q);b.type='button';b.onclick=()=>submit(q);$('.support-suggestions').append(b);}
}catch{message('Hi! Ask about using LAE-MUSIC. Live replies are temporarily unavailable.','assistant');}
