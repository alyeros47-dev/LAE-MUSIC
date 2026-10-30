// Customer launch visibility. Server authorization remains authoritative.
export function customerFeatures(capabilities={},browser={}){
 const review=capabilities.review_tools===true;
 return {
  checkout:review||(capabilities.payments===true&&capabilities.payment_mode==='live'),
  payouts:review||capabilities.payouts===true,
  premium_access:review||browser.listenerAccount===true||browser.premiumActive===true||(capabilities.payments===true&&capabilities.payment_mode==='live'),
  offline_library:browser.offline===true&&(capabilities.offline_listening===true||browser.offlineCached===true),
  review,
  email:capabilities.email_delivery_enabled===true,
  music:capabilities.music_provider_configured===true,
  lyrics:capabilities.lyrics_configured===true,
  imports:capabilities.studio_release_import===true,
  voice_upload:capabilities.voice_upload_available===true||capabilities.voice_upload_verified===true,
  offline_save:capabilities.offline_listening===true&&browser.offline===true,
 };
}
export function hideInactiveFeatures(root,features){
 for(const link of root.querySelectorAll('a[href="/premium"]'))if(!link.dataset.feature)link.dataset.feature='premium_access';
 for(const link of root.querySelectorAll('a[href="/offline"]'))if(!link.dataset.feature)link.dataset.feature='offline_library';
 for(const node of root.querySelectorAll('[data-feature]')){
  if(features[node.dataset.feature]===true){if(node.dataset.featurePending==='true'){node.hidden=false;delete node.dataset.featurePending;delete node.dataset.featureInactive;delete node.dataset.featureWasHidden;}else if(node.dataset.featureInactive==='true'){node.hidden=node.dataset.featureWasHidden==='true';delete node.dataset.featureInactive;delete node.dataset.featureWasHidden;}continue;}
  if(node.dataset.featureInactive!=='true')node.dataset.featureWasHidden=node.dataset.featurePending==='true'?'false':String(node.hidden);
  node.hidden=true;
  // Keep stateful workflow elements mounted without letting a later loading,
  // entitlement or form update reveal an unavailable feature.
  node.dataset.featureInactive='true';
 }
}
