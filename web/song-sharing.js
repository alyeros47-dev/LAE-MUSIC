// Share public listening pages, never audio files, private drafts or signed storage URLs.
export function songShareData(track,origin){
 if(!track||!/^[1-9][0-9]{0,15}$/.test(String(track.id))||(track.status&&track.status!=='published'))throw Error('Only published songs can be shared.');
 const base=new URL(origin);if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw Error('A valid website address is required.');
 const clean=(value,max)=>String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
 const title=clean(track.title,140)||'Listen on LAE-MUSIC',artist=clean(track.artist||track.display_name,100);
 const url=new URL('/discover',base.origin);url.searchParams.set('track',String(track.id));
 const text='Listen to '+title+(artist?' by '+artist:'')+' on LAE-MUSIC.';
 return {title,text,url:url.href};
}
export function whatsappSongLink(data){return 'https://wa.me/?text='+encodeURIComponent(data.text+'\n'+data.url);}
export function openSongShare(track,{actionDialog,e,origin=location.origin,nav=navigator}){
 const data=songShareData(track,origin);let native=typeof nav.share==='function';
 if(native&&typeof nav.canShare==='function'){try{native=nav.canShare(data);}catch{native=false;}}
 actionDialog(`<span class="eyebrow">HELP THE MUSIC TRAVEL</span><h2>Share this song</h2><p>${e(data.title)}</p><p>Send this song to a friend or share it with your group.</p><div class="row-actions"><a class="button" href="${e(whatsappSongLink(data))}" target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>${native?'<button class="button secondary" type="button" id="share-song-device">More sharing options</button>':''}<button class="button secondary" type="button" id="share-song-copy">Copy song link</button></div><label for="share-song-url">Public song link<input id="share-song-url" readonly value="${e(data.url)}" autocomplete="off"></label><p id="share-song-status" role="status" aria-live="polite"></p><p class="muted">Share the listening link. Your account details and audio files are not included.</p>`,root=>{
  const status=root.querySelector('#share-song-status'),field=root.querySelector('#share-song-url');
  root.querySelector('#share-song-copy').onclick=async()=>{
   try{if(typeof nav.clipboard?.writeText!=='function')throw Error();await nav.clipboard.writeText(data.url);status.textContent='Song link copied. Paste it into your message or social post.';}
   catch{field.focus();field.select();status.textContent='Copy the selected link, or press and hold it on your phone to copy.';}
  };
  const device=root.querySelector('#share-song-device');if(device)device.onclick=async()=>{
   device.disabled=true;
   try{await nav.share(data);status.textContent='Sharing options completed on your device.';}
   catch(error){status.textContent=error?.name==='AbortError'?'Sharing cancelled. You can still copy the link.':'Sharing is unavailable on this device. Use WhatsApp or copy the link.';}
   finally{device.disabled=false;}
  };
 });
}
