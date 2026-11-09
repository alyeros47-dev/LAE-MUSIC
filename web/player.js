const $ = id => document.getElementById(id);
export const time = seconds => Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0') : '0:00';
const cover = track => track?.id ? `/api/music/tracks/${encodeURIComponent(track.id)}/cover-image` : '/web/artwork.svg';
const safeTrack = t => ({ id: String(t.id), title: String(t.title || 'Untitled'), artist: String(t.artist || 'Independent artist'), artist_id: t.artist_id ? String(t.artist_id) : '', genre: String(t.genre || ''),...(t.offline===true?{offline:true}:{}) });
// Keep normal listening levels unchanged; reserve 1.4 dB of native output
// headroom at the top of the slider for decoded MP3 inter-sample peaks.
const outputCeiling=.85;
const outputVolume=level=>level<=.8?level:.8+(level-.8)*.25;
const controlVolume=level=>Math.round((level<=.8?level:.8+(level-.8)*4)*100)/100;
export class PlaybackQueue {
  constructor() { this.tracks = []; this.index = -1; this.shuffle = false; this.repeat = 'off'; this.history = []; }
  set(tracks, index = 0) { this.tracks = tracks.map(safeTrack); this.index = this.tracks.length ? Math.max(0, Math.min(index, this.tracks.length - 1)) : -1; this.history = []; }
  get current() { return this.tracks[this.index]; }
  next(ended = false, random = Math.random) {
    if (!this.tracks.length) return -1;
    if (ended && this.repeat === 'one') return this.index;
    let next;
    if (this.shuffle && this.tracks.length > 1) { const n = Math.floor(random() * (this.tracks.length - 1)); next = n >= this.index ? n + 1 : n; }
    else if (this.index + 1 < this.tracks.length) next = this.index + 1;
    else if (this.repeat === 'all' || !ended) next = 0;
    else return -1;
    if (this.index >= 0) this.history.push(this.index);
    this.index = next;
    return this.index;
  }
  previous() { if (this.history.length) this.index = this.history.pop(); else if (this.tracks.length) this.index = (this.index - 1 + this.tracks.length) % this.tracks.length; return this.index; }
  remove(index) { if (index === this.index || index < 0 || index >= this.tracks.length) return false; this.tracks.splice(index, 1); if (index < this.index) this.index--; this.history = []; return true; }
  moveUp(index) { if (index <= 0 || index >= this.tracks.length) return; [this.tracks[index - 1], this.tracks[index]] = [this.tracks[index], this.tracks[index - 1]]; if (this.index === index) this.index--; else if (this.index === index - 1) this.index++; this.history = []; }
}
export class MusicPlayer {
  constructor({ api, toast, onLike, onDetail }) {
    this.api = api; this.toast = toast; this.onLike = onLike; this.onDetail = onDetail;
    this.queue = new PlaybackQueue(); this.audio = $('audio'); this.request = 0; this.controller = null; this.counted = false; this.playRecordKey=null; this.listened = 0; this.lastTime = 0; this.resumeAt = 0;
    this.lastAudibleVolume = 0.8; this.audio.volume = 0.8; this.audio.preload = 'auto';
    $('play-toggle').onclick = () => this.toggle(); $('expanded-toggle').onclick = () => this.toggle();
    $('expanded-previous').onclick=()=>$('previous').click(); $('expanded-next').onclick=()=>$('next').click();
    $('next').onclick = () => this.advance(); $('previous').onclick = () => this.playIndex(this.queue.previous());
    $('shuffle').onclick = () => { this.queue.shuffle = !this.queue.shuffle; $('shuffle').setAttribute('aria-pressed', this.queue.shuffle); this.save(); };
    $('repeat').onclick = () => { this.queue.repeat = { off: 'all', all: 'one', one: 'off' }[this.queue.repeat]; $('repeat').textContent = this.queue.repeat === 'one' ? '↻¹' : '↻'; $('repeat').setAttribute('aria-pressed', this.queue.repeat !== 'off'); $('repeat').setAttribute('aria-label', 'Repeat ' + this.queue.repeat); this.save(); };
    $('expanded-volume').oninput=e=>this.setVolume(e.target.value);
    $('expanded-seek').oninput=e=>{if(Number.isFinite(this.audio.duration)&&this.audio.duration>0){this.audio.currentTime=this.audio.duration*Number(e.target.value)/1000;this.lastTime=this.audio.currentTime;}};
    $('volume').oninput = e => this.setVolume(e.target.value);
    $('mute').onclick = () => this.toggleMute();
    $('seek').oninput = e => { if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) { this.audio.currentTime = this.audio.duration * Number(e.target.value) / 1000; this.lastTime = this.audio.currentTime; } };
    for (const id of ['expand', 'player-art-button']) $(id).onclick = () => $('expanded-player').showModal();
    $('player-title').onclick = () => this.queue.current && this.onDetail(this.queue.current);
    $('queue-toggle').onclick = () => this.openQueue(); $('expanded-queue').onclick = () => { $('expanded-player').close(); this.openQueue(); };
    $('player-like').onclick = () => this.queue.current && this.onLike(this.queue.current);
    $('queue-clear').onclick = () => { const t = this.queue.current; if (t) this.queue.set([t]); this.renderQueue(); this.save(); };
    this.audio.addEventListener('play', () => { this.userPaused=false; this.playState(true); this.message(''); });
    this.audio.addEventListener('pause', () => { if (!this.audio.ended || !this.nextPrepared()) this.playState(false); this.save(); });
    this.audio.addEventListener('waiting', () => this.message('Buffering…'));
    this.audio.addEventListener('playing', () => { this.message(''); this.prepareNext(); });
    this.audio.addEventListener('error', () => { this.playState(false); this.message('Audio unavailable. Press play to retry.'); this.streamFailed = true; });
    this.audio.addEventListener('loadedmetadata', () => { $('duration').textContent = time(this.audio.duration);$('expanded-duration').textContent=time(this.audio.duration);$('expanded-seek').disabled=!Number.isFinite(this.audio.duration)||this.audio.duration<=0; $('seek').disabled = !Number.isFinite(this.audio.duration) || this.audio.duration <= 0; if (this.resumeAt && Number.isFinite(this.audio.duration)) this.audio.currentTime = Math.min(this.resumeAt, Math.max(0, this.audio.duration - 1)); this.resumeAt = 0; this.prepareNext(); });
    this.audio.addEventListener('timeupdate', () => this.timeUpdate());
    this.audio.addEventListener('ended', () => this.advance(true));
    this.audio.addEventListener('volumechange', () => { this.updateMute(); this.save(); });
    document.addEventListener('visibilitychange', () => { this.save(); if (!this.audio.paused) this.prepareNext(); });
    window.addEventListener('pagehide', () => this.save());
    this.restore(); this.updateMute(); this.setupMediaSession(); this.setupAudioFocus();
  }
  setupAudioFocus() {
    if (typeof HTMLMediaElement === 'undefined' || !document.querySelectorAll) return;
    this.focusId=crypto.randomUUID(); this.focusStamp=0;
    document.addEventListener('play',event=>{
      const media=event.target;
      // Silent decorative video must not interrupt a listener's music.
      if(media instanceof HTMLMediaElement && !(media.tagName==='VIDEO'&&media.muted))this.focusPlayback(media);
    },true);
    const receive=data=>{
      if(data?.owner===this.focusId || typeof data?.owner!=='string' || !Number.isFinite(data?.at) || data.at<=this.focusStamp)return;
      this.focusStamp=data.at; this.pauseOtherMedia(null);
    };
    try { this.focusChannel=new BroadcastChannel('lae-audio-focus-v1'); this.focusChannel.onmessage=event=>receive(event.data); } catch {}
    window.addEventListener('storage',event=>{
      if(event.key==='lae_audio_focus_v1'&&event.newValue)try{receive(JSON.parse(event.newValue));}catch{}
    });
  }
  pauseOtherMedia(keep) {
    const ad=this.advertiser?.active?this.advertiser.audio:null;
    if(keep!==this.audio){
      // An advertisement is part of the current queue transition. Preserve its
      // request so the next song still starts when the advertisement finishes.
      if(keep===ad && keep){if(!this.audio.paused)this.audio.pause();}
      else this.pause();
    }
    // Remember the active preview even if navigation removed its HTML element.
    if(ad&&ad!==keep&&!ad.paused){this.advertiser.userPaused=true;ad.pause();}
    const mediaSources=new Set([this.focusMedia,...document.querySelectorAll('audio,video')]);
    for(const media of mediaSources)if(media&&media!==keep&&media!==this.audio&&!media.paused)media.pause();
    this.focusMedia=keep;
  }
  focusPlayback(media, starting=false) {
    if(!this.focusId || !media || (media.paused&&!starting))return;
    this.pauseOtherMedia(media);
    const at=Math.max(this.focusStamp+.001,performance.timeOrigin+performance.now());
    this.focusStamp=at;
    const claim={owner:this.focusId,at};
    try{this.focusChannel?.postMessage(claim);}catch{}
    // Storage events also cover browsers without BroadcastChannel. No song,
    // account, recording or signed media address is shared between tabs.
    try{localStorage.setItem('lae_audio_focus_v1',JSON.stringify(claim));}catch{}
  }
  message(value) { $('playback-status').textContent = value; $('playback-status').title = value; }
  playState(playing) { $('play-toggle').textContent = playing ? 'Ⅱ' : '▶'; $('play-toggle').setAttribute('aria-label', playing ? 'Pause' : 'Play'); $('expanded-toggle').textContent = playing ? 'Pause' : 'Play'; if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; }
  setVolume(value) {
    const volume = Number(value); if (!Number.isFinite(volume)) return;
    this.audio.volume = outputVolume(Math.max(0, Math.min(1, volume))); this.audio.muted = false;
    this.updateMute(); this.save();
  }
  toggleMute() {
    if (this.audio.muted || this.audio.volume === 0) {
      if (this.audio.volume === 0) this.audio.volume = this.lastAudibleVolume;
      this.audio.muted = false;
    } else this.audio.muted = true;
    this.updateMute(); this.save();
  }
  updateMute() {
    if(this.audio.volume>outputCeiling)this.audio.volume=outputCeiling;
    if (this.audio.volume > 0) this.lastAudibleVolume = this.audio.volume;
    const off = this.audio.muted || this.audio.volume === 0;
    const button = $('mute'); button.classList.remove('optional'); button.setAttribute('aria-label', off ? 'Unmute' : 'Mute');
    button.setAttribute('aria-pressed', off); button.title = off ? 'Turn sound on' : 'Mute sound'; button.textContent = off ? '🔇' : '🔊';
    $('volume').value = $('expanded-volume').value = controlVolume(this.audio.volume);
    const status = $('playback-sound-status'); if (status) { status.hidden = !off; status.textContent = off ? 'Sound off · Tap the speaker' : ''; }
  }
  async setTracks(tracks, index = 0) { if(this.advertiser?.active){this.toast('Your music resumes after the advertisement');return;}this.resumeAt = 0; this.queue.set(tracks, index); return this.playIndex(this.queue.index); }
  add(track) { this.queue.tracks.push(safeTrack(track)); this.toast('Added to your queue'); this.renderQueue(); this.save(); }
  async playIndex(index, autoplay = true, continuous = false, planned = null) {
    if (this.advertiser?.active){this.toast('Your music resumes after the advertisement');return;}if (index < 0 || index >= this.queue.tracks.length) return;
    const prepared=planned?.index===index?planned:this.nextPrepared(index), request = ++this.request; this.clearPrepared(prepared); this.loading=request; this.controller?.abort(); this.controller = new AbortController();
    this.currentSourceOffline=false;this.queue.index = index; if (!continuous) { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); } this.streamFailed = false; this.counted = false; this.playRecordKey=crypto.randomUUID(); this.listened = 0; this.lastTime = 0;
    const track = this.queue.current; this.renderTrack(track); this.renderQueue(); this.message('Preparing your music…'); this.save();
    try {
      const online=()=>this.api(`/api/music/tracks/${encodeURIComponent(track.id)}/stream`, 'GET', undefined, { signal: this.controller.signal });const data = prepared ? prepared.data : this.sourceProvider?await this.sourceProvider(track,online):await online();
      if (request !== this.request) { data.release?.(); return; }
      data.validate?.();
      const url = new URL(data.url); if (!(data.offline===true&&url.protocol==='blob:'&&url.origin===location.origin)&&url.protocol !== 'https:' && !(url.origin === location.origin && url.protocol === 'http:')) throw Error('The stream address is unavailable.');
      this.currentSourceOffline=data.offline===true;document.dispatchEvent(new CustomEvent('playbacksource',{detail:{offline:this.currentSourceOffline,grant:data.grant,track}}));this.audio.src = url.href; const previous=this.currentSource; this.currentSource=data; if(previous!==data)previous?.release?.(); this.message(autoplay ? 'Loading audio…' : 'Ready when you are');
      if (autoplay) { this.focusPlayback(this.audio,true); await this.audio.play(); }
    } catch (error) {
      if (request !== this.request || error.name === 'AbortError') return;
      if(error.name!=='NotAllowedError'){this.audio.pause();this.audio.removeAttribute('src');this.audio.load();this.currentSource?.release?.();this.currentSource=null;prepared?.data.release?.();}
      this.playState(false); this.streamFailed = error.name !== 'NotAllowedError';
      this.message(error.name === 'NotAllowedError' ? 'Press play to start listening' : 'Unable to play. Press play to retry.'); this.toast(error.message || 'Playback unavailable', true);
    } finally { if(this.loading===request)this.loading=null; }
  }
  async toggle() {
    if(this.advertiser?.active)return this.advertiser.toggle();
    if (!this.queue.current) return;
    if(this.loading){this.pause();return;}
    if (!this.audio.paused) { this.pause(); return; }
    if (this.streamFailed || !this.audio.getAttribute('src')) { this.resumeAt = this.audio.currentTime || this.resumeAt; await this.playIndex(this.queue.index); return; }
    try { if(this.beforeResume)await this.beforeResume();this.focusPlayback(this.audio,true);await this.audio.play(); } catch (error) { this.message('Press play to retry'); this.toast(error.message, true); }
  }
  async advance(ended = false) { if(this.advertiser?.active||this.advancing||(ended&&this.userPaused))return;this.advancing=true;try{const request=this.request;let autoplay=true;if(ended&&this.advertiser){const decision=this.advertiser.beforeAdvance();autoplay=(decision&&typeof decision.then==='function'?await decision:decision)!==false;}if(request!==this.request)return;const planned=this.nextPrepared(), index = this.queue.next(ended, planned?()=>planned.random:Math.random); if (index < 0) { this.playState(false); this.message('You’ve reached the end of your queue'); this.save(); } else await this.playIndex(index,autoplay,ended,planned);}finally{this.advancing=false;} }
  pause() { const loading=this.loading;this.loading=null;this.userPaused=true; this.request++; this.controller?.abort(); this.audio.pause();if(loading){this.audio.removeAttribute('src');this.audio.load();this.currentSource?.release?.();this.currentSource=null;this.streamFailed=true;} this.playState(false); }
  queueIdentity() { return JSON.stringify([this.queue.index,this.queue.shuffle,this.queue.repeat,this.queue.tracks.map(t=>[t.id,t.offline===true])]); }
  nextPrepared(index) {
    const p=this.prepared;
    if(!p?.data || p.identity!==this.queueIdentity() || (index!==undefined&&p.index!==index) || Date.now()-p.created>120000)return null;
    try { p.data.validate?.(); return p; } catch { this.clearPrepared(); return null; }
  }
  clearPrepared(keep=null) {
    const old=this.prepared; this.prepared=null;
    if(old&&old!==keep){old.controller.abort();old.data?.release?.();}
  }
  prepareNext() {
    if(this.audio.paused || !Number.isFinite(this.audio.duration) || this.audio.duration-this.audio.currentTime>90)return;
    this.advertiser?.prepare?.();
    const identity=this.queueIdentity();
    if(this.prepareRetry?.identity===identity && Date.now()<this.prepareRetry.until)return;
    if(this.prepared?.identity===identity && Date.now()-this.prepared.created<120000)return;
    this.clearPrepared();
    const random=Math.random(),copy=new PlaybackQueue();copy.set(this.queue.tracks,this.queue.index);copy.shuffle=this.queue.shuffle;copy.repeat=this.queue.repeat;
    const index=copy.next(true,()=>random); if(index<0)return;
    const track=this.queue.tracks[index],controller=new AbortController(),p={identity,index,random,controller,created:Date.now(),data:null};this.prepared=p;
    const online=()=>this.api(`/api/music/tracks/${encodeURIComponent(track.id)}/stream`,'GET',undefined,{signal:controller.signal});
    Promise.resolve().then(()=>this.sourceProvider?this.sourceProvider(track,online,{preparing:true}):online()).then(data=>{
      if(this.prepared!==p || controller.signal.aborted){data.release?.();return;}p.data=data;
    }).catch(()=>{if(this.prepared===p){this.clearPrepared();this.prepareRetry={identity,until:Date.now()+10000};}});
  }
  renderTrack(track) {
    $('player').hidden = false; document.body.classList.add('has-player');
    $('player-title').textContent = track.title; $('player-artist').textContent = track.artist; $('player-artist').href = track.artist_id ? '/artists?id=' + track.artist_id : '/artists';
    $('expanded-title').textContent = track.title; $('expanded-artist').textContent = track.artist;
    for (const id of ['player-art', 'expanded-art']) { $(id).onerror = () => { $(id).onerror = null; $(id).src = '/web/artwork.svg'; }; $(id).src = cover(track); }
    $('elapsed').textContent = '0:00'; $('duration').textContent = '0:00'; $('seek').value = 0; $('seek').disabled = true; $('expanded-elapsed').textContent='0:00';$('expanded-duration').textContent='0:00';$('expanded-seek').value=0;$('expanded-seek').disabled=true;
    $('player-like').setAttribute('aria-pressed', 'false');
    document.dispatchEvent(new CustomEvent('trackchange', { detail: {...track,playbackPending:true} }));
    if ('mediaSession' in navigator && 'MediaMetadata' in window) navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: 'LAE-MUSIC', artwork: [{ src: new URL(cover(track), location.origin).href }] });
  }
  timeUpdate() {
    this.prepareNext();
    $('expanded-elapsed').textContent=time(this.audio.currentTime);$('expanded-seek').value=this.audio.duration?Math.round(this.audio.currentTime/this.audio.duration*1000):0;
    $('elapsed').textContent = time(this.audio.currentTime); $('seek').value = this.audio.duration ? Math.round(this.audio.currentTime / this.audio.duration * 1000) : 0;
    const delta = this.audio.currentTime - this.lastTime; if (!this.audio.paused && delta > 0 && delta < 2) this.listened += delta; this.lastTime = this.audio.currentTime;
    if (!this.counted && this.listened >= Math.min(30, Number.isFinite(this.audio.duration) ? this.audio.duration * .5 : 30)) {
      this.counted = true; const id = this.queue.current?.id;
      if (id) { this.recordPlay(id,this.playRecordKey); }
    }
    if (!this.savedAt || Date.now() - this.savedAt > 5000) { this.savedAt = Date.now(); this.save(); }
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && Number.isFinite(this.audio.duration) && this.audio.duration > 0) { try { navigator.mediaSession.setPositionState({ duration: this.audio.duration, playbackRate: this.audio.playbackRate, position: Math.min(this.audio.currentTime, this.audio.duration) }); } catch {} }
  }
  async recordPlay(id,key){if(this.currentSourceOffline)return;try{await this.api(`/api/music/tracks/${id}/play`,'POST',{}, {headers:{'Idempotency-Key':key}});}catch{setTimeout(()=>{this.api(`/api/music/tracks/${id}/play`,'POST',{}, {headers:{'Idempotency-Key':key}}).catch(()=>{});},1500);}}
  openQueue() { this.renderQueue(); if (!$('queue-dialog').open) $('queue-dialog').showModal(); }
  renderQueue() {
    const box = $('queue-list'); box.replaceChildren();
    this.queue.tracks.forEach((track, index) => {
      const row = document.createElement('div'); row.className = 'song-row';
      const title = document.createElement('button'); title.className = 'text-button'; title.textContent = (index === this.queue.index ? '● ' : (index + 1) + '. ') + track.title; title.onclick = () => this.playIndex(index);
      const text = document.createElement('div'), by = document.createElement('small'); by.textContent = track.artist; text.append(title, by); row.append(text);
      for (const [label, symbol, fn, disabled] of [['Move up', '↑', () => this.queue.moveUp(index), index === 0], ['Remove', '×', () => this.queue.remove(index), index === this.queue.index]]) { const button = document.createElement('button'); button.className = 'icon-button'; button.textContent = symbol; button.setAttribute('aria-label', label + ' ' + track.title); button.disabled = disabled; button.onclick = () => { fn(); this.renderQueue(); this.save(); }; row.append(button); }
      box.append(row);
    });
    if (!this.queue.tracks.length) box.textContent = 'Play a song or add one to start your queue.';
  }
  save() { try { localStorage.setItem('lae_playback_v2', JSON.stringify({ tracks: this.queue.tracks.slice(0, 200), index: this.queue.index, position: this.audio.currentTime || this.resumeAt, volume: this.audio.volume, muted: this.audio.muted, lastAudibleVolume: this.lastAudibleVolume, shuffle: this.queue.shuffle, repeat: this.queue.repeat })); } catch {} }
  restore() {
    try { const data = JSON.parse(localStorage.getItem('lae_playback_v2')); if (!data || !Array.isArray(data.tracks)) return;
      const tracks = data.tracks.filter(t => t && /^[1-9]\d{0,15}$/.test(String(t.id))).slice(0, 200);
      this.queue.set(tracks, Number.isInteger(data.index) ? data.index : 0); this.queue.shuffle = data.shuffle === true; this.queue.repeat = ['off', 'all', 'one'].includes(data.repeat) ? data.repeat : 'off';
      this.lastAudibleVolume = typeof data.lastAudibleVolume === 'number' && data.lastAudibleVolume > 0 && data.lastAudibleVolume <= 1 ? Math.min(data.lastAudibleVolume,outputCeiling) : .8;
      this.audio.muted = data.muted === true;
      this.audio.volume = typeof data.volume === 'number' && data.volume >= 0 && data.volume <= 1 ? Math.min(data.volume,outputCeiling) : .8; $('shuffle').setAttribute('aria-pressed', this.queue.shuffle); $('repeat').setAttribute('aria-pressed', this.queue.repeat !== 'off'); $('repeat').setAttribute('aria-label', 'Repeat ' + this.queue.repeat); $('repeat').textContent = this.queue.repeat === 'one' ? '↻¹' : '↻';
      if (this.queue.current) { this.resumeAt = Math.max(0, Number(data.position) || 0); this.renderTrack(this.queue.current); this.message('Press play to resume'); }
    } catch { /* A stale/corrupt browser preference must never prevent public listening. */ }
  }
  setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    for (const [action, handler] of Object.entries({ play: () => { if(this.audio.paused)this.toggle(); }, pause: () => this.pause(), nexttrack: () => this.advance(), previoustrack: () => this.playIndex(this.queue.previous()), seekto: event => { if (Number.isFinite(event.seekTime)) this.audio.currentTime = event.seekTime; }, seekbackward: event => { this.audio.currentTime = Math.max(0, this.audio.currentTime - (event.seekOffset || 10)); }, seekforward: event => { if (Number.isFinite(this.audio.duration)) this.audio.currentTime = Math.min(this.audio.duration, this.audio.currentTime + (event.seekOffset || 10)); } })) { try { navigator.mediaSession.setActionHandler(action, handler); } catch {} }
  }
}
