'use strict';
(()=>{
 const box=document.getElementById('ad-consent');if(!box)return;
 const pixel=box.dataset.pixel;if(!/^\d{5,25}$/.test(pixel))return;
 // Respect browser privacy choices; no third-party requests before opt-in.
 if(navigator.globalPrivacyControl||navigator.doNotTrack==='1'||window.doNotTrack==='1')return;
 const storageKey='lae_community_meta_consent_v1';let enabled=false;
 function store(value){try{localStorage.setItem(storageKey,value);}catch{}}
 function enable(){
  if(enabled)return;enabled=true;box.hidden=true;
  // Do not send unknown URL parameters, fbclid or click tokens to Meta.
  const url=new URL(location.href),clean=new URL(url.origin+url.pathname);
  for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']){const value=url.searchParams.get(key)||'';if(/^[a-zA-Z0-9 _.-]{1,80}$/.test(value))clean.searchParams.set(key,value);}
  history.replaceState(history.state,'',clean.pathname+clean.search);
  const fb=window.fbq=function(){fb.callMethod?fb.callMethod.apply(fb,arguments):fb.queue.push(arguments);};
  fb.push=fb;fb.loaded=true;fb.version='2.0';fb.queue=[];
  const script=document.createElement('script');script.async=true;script.src='https://connect.facebook.net/en_US/fbevents.js';document.head.append(script);
  fb('consent','grant');fb('init',pixel);fb('track','PageView');
  document.getElementById('community-join')?.addEventListener('click',()=>fb('trackCustom','WhatsAppButtonClick',{campaign:location.pathname.split('/').filter(Boolean).pop()}));
 }
 document.getElementById('allow-ads').addEventListener('click',()=>{store('yes');enable();});
 document.getElementById('decline-ads').addEventListener('click',()=>{store('no');box.hidden=true;});
 let choice;try{choice=localStorage.getItem(storageKey);}catch{}
 if(choice==='yes')enable();else if(choice!=='no')box.hidden=false;
})();
