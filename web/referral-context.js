// Tab-scoped purchase context. The server remains authoritative about an
// account's established referrer; browser storage never creates commissions.
const KEY='lae_purchase_referral_v1',TTL=24*60*60*1000;
const artists=new Set(['starter','growth','professional']);
const listeners=new Set(['daily','weekly','monthly','two_month','quarterly','annual']);
export function rememberReferral(url,storage,now=Date.now()){
 try{storage??=globalThis.sessionStorage;}catch{return;}
 let saved=null;try{saved=JSON.parse(storage.getItem(KEY));}catch{}
 if(!saved||!Number.isFinite(saved.at)||now-saved.at>TTL||now<saved.at)saved=null;
 const incoming=url.searchParams.get('ref');
 if(incoming!==null){
  if(!/^[1-9][0-9]{0,15}$/.test(incoming)||!Number.isSafeInteger(Number(incoming)))return;
  saved={...(saved?.ref===incoming?saved:{}),ref:incoming,at:now};
 }
 if(!saved)return;
 const product=url.searchParams.get('product'),plan=url.searchParams.get('plan');
 if(artists.has(product))Object.assign(saved,{kind:'artist',product,plan:null});
 if(url.pathname==='/premium'&&listeners.has(plan)||url.searchParams.get('return')==='premium'&&listeners.has(plan))Object.assign(saved,{kind:'listener',plan,product:null});
 try{storage.setItem(KEY,JSON.stringify(saved));}catch{}
 const path=url.pathname,auth=path==='/join';
 const relevant=auth||['/start','/get-started','/premium'].includes(path)||path==='/account'&&url.searchParams.get('tab')==='roles'||path==='/workspace'&&url.searchParams.get('tab')==='plans';
 if(!relevant||url.searchParams.has('payment')||url.searchParams.has('checkout')||url.searchParams.get('return')==='bank-payment')return;
 if(!url.searchParams.has('ref'))url.searchParams.set('ref',saved.ref);
 if(url.searchParams.has('compare'))return;
 const role=url.searchParams.get('role');
 if(saved.kind==='artist'&&(path==='/start'||path==='/get-started'||path==='/workspace'||path==='/account'||auth&&(!role||role==='artist')&&url.searchParams.get('return')!=='premium')){
  if(!url.searchParams.has('product'))url.searchParams.set('product',saved.product);
  if(auth&&!url.searchParams.has('return')){url.searchParams.set('return','monnify');url.searchParams.set('role','artist');}
 }
 if(saved.kind==='listener'&&(path==='/premium'||auth&&(!role||role==='listener')&&url.searchParams.get('return')!=='monnify')){
  if(!url.searchParams.has('plan'))url.searchParams.set('plan',saved.plan);
  if(auth&&!url.searchParams.has('return')){url.searchParams.set('return','premium');url.searchParams.set('role','listener');url.searchParams.set('checkout_start','1');}
 }
}
export function clearReferral(){try{sessionStorage.removeItem(KEY);}catch{}}
export function checkoutDestination(url,session){
 const q=new URLSearchParams();const ref=url.searchParams.get('ref');if(ref)q.set('ref',ref);
 if(url.searchParams.get('return')==='premium'&&listeners.has(url.searchParams.get('plan'))){
  q.set('plan',url.searchParams.get('plan'));q.set('checkout_start','1');
  if(session.listener)return '/premium?'+q;
  q.set('tab','roles');q.set('role','artist');q.set('return','premium');return '/account?'+q;
 }
 if(url.searchParams.get('return')==='monnify'&&artists.has(url.searchParams.get('product'))){
  q.set('product',url.searchParams.get('product'));
  if(session.artist){q.set('tab','plans');q.set('checkout_start','1');return '/workspace?'+q;}
  q.set('tab','roles');q.set('role','listener');q.set('return','monnify');return '/account?'+q;
 }
 return null;
}
