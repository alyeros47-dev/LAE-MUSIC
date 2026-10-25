const $ = id => document.getElementById(id);
export const time = seconds => Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0') : '0:00';
const cover = track => track?.id ? `/api/music/tracks/${encodeURIComponent(track.id)}/cover-image` : '/web/artwork.svg';
const safeTrack = t => ({ id: String(t.id), title: String(t.title || 'Untitled'), artist: String(t.artist || 'Independent artist'), artist_id: t.artist_id ? String(t.artist_id) : '', genre: String(t.genre || '') });
export class PlaybackQueue {
  constructor() { this.tracks = []; this.index = -1; this.shuffle = false; this.repeat = 'off'; this.history = []; }
  set(tracks, index = 0) { this.tracks = tracks.map(safeTrack); this.index = this.tracks.length ? Math.max(0, Math.min(index, this.tracks.length - 1)) : -1; this.history = []; }
  get current() { return this.tracks[this.index]; }
  next(ended = false, random = Math.random) {
    if (!this.tracks.length) return -1;
    if (ended && this.repeat === 'one') return this.index;
    if (this.index >= 0) this.history.push(this.index);
    if (this.shuffle && this.tracks.length > 1) { const n = Math.floor(random() * (this.tracks.length - 1)); this.index = n >= this.index ? n + 1 : n; }
    else if (this.index + 1 < this.tracks.length) this.index++;
    else if (this.repeat === 'all' || !ended) this.index = 0;
    else return -1;
    return this.index;
  }
  previous() { if (this.history.length) this.index = this.history.pop(); else if (this.tracks.length) this.index = (this.index - 1 + this.tracks.length) % this.tracks.length; return this.index; }
  remove(index) { if (index === this.index || index < 0 || index >= this.tracks.length) return false; this.tracks.splice(index, 1); if (index < this.index) this.index--; this.history = []; return true; }
  moveUp(index) { if (index <= 0 || index >= this.tracks.length) return; [this.tracks[index - 1], this.tracks[index]] = [this.tracks[index], this.tracks[index - 1]]; if (this.index === index) this.index--; else if (this.index === index - 1) this.index++; this.history = []; }
}
export class MusicPlayer {
  constructor({ api, toast, onLike, onDetail }) {
    this.api = api; this.toast = toast; this.onLike = onLike; this.onDetail = onDetail;
    this.queue = new PlaybackQueue(); this.audio = $('audio'); this.request = 0; this.controller = null; this.counted = false; this.listened = 0; this.lastTime = 0; this.resumeAt = 0;
    this.audio.volume = 0.8;
    $('play-toggle').onclick = () => this.toggle(); $('expanded-toggle').onclick = () => this.toggle();
    $('expanded-previous').onclick=()=>$('previous').click(); $('expanded-next').onclick=()=>$('next').click();
    $('next').onclick = () => this.advance(); $('previous').onclick = () => { if (this.audio.currentTime > 3) this.audio.currentTime = 0; else this.playIndex(this.queue.previous()); };
    $('shuffle').onclick = () => { this.queue.shuffle = !this.queue.shuffle; $('shuffle').setAttribute('aria-pressed', this.queue.shuffle); this.save(); };
    $('repeat').onclick = () => { this.queue.repeat = { off: 'all', all: 'one', one: 'off' }[this.queue.repeat]; $('repeat').textContent = this.queue.repeat === 'one' ? '↻¹' : '↻'; $('repeat').setAttribute('aria-pressed', this.queue.repeat !== 'off'); $('repeat').setAttribute('aria-label', 'Repeat ' + this.queue.repeat); this.save(); };
    $('expanded-volume').oninput=e=>{this.audio.volume=Number(e.target.value);this.audio.muted=false;$('volume').value=this.audio.volume;this.save();};
    $('expanded-seek').oninput=e=>{if(Number.isFinite(this.audio.duration)&&this.audio.duration>0){this.audio.currentTime=this.audio.duration*Number(e.target.value)/1000;this.lastTime=this.audio.currentTime;}};
    $('volume').oninput = e => { this.audio.volume = Number(e.target.value); this.audio.muted = false; $ ('expanded-volume').value=this.audio.volume; this.updateMute(); this.save(); };
    $('mute').onclick = () => { this.audio.muted = !this.audio.muted; this.updateMute(); };
    $('seek').oninput = e => { if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) { this.audio.currentTime = this.audio.duration * Number(e.target.value) / 1000; this.lastTime = this.audio.currentTime; } };
    for (const id of ['expand', 'player-art-button']) $(id).onclick = () => $('expanded-player').showModal();
    $('player-title').onclick = () => this.queue.current && this.onDetail(this.queue.current);
    $('queue-toggle').onclick = () => this.openQueue(); $('expanded-queue').onclick = () => { $('expanded-player').close(); this.openQueue(); };
    $('player-like').onclick = () => this.queue.current && this.onLike(this.queue.current);
    $('queue-clear').onclick = () => { const t = this.queue.current; if (t) this.queue.set([t]); this.renderQueue(); this.save(); };
    this.audio.addEventListener('play', () => { this.playState(true); this.message(''); });
    this.audio.addEventListener('pause', () => { this.playState(false); this.save(); });
    this.audio.addEventListener('waiting', () => this.message('Buffering…'));
    this.audio.addEventListener('playing', () => this.message(''));
    this.audio.addEventListener('error', () => { this.playState(false); this.message('Audio unavailable. Press play to retry.'); this.streamFailed = true; });
    this.audio.addEventListener('loadedmetadata', () => { $('duration').textContent = time(this.audio.duration);$('expanded-duration').textContent=time(this.audio.duration);$('expanded-seek').disabled=!Number.isFinite(this.audio.duration)||this.audio.duration<=0; $('seek').disabled = !Number.isFinite(this.audio.duration) || this.audio.duration <= 0; if (this.resumeAt && Number.isFinite(this.audio.duration)) this.audio.currentTime = Math.min(this.resumeAt, Math.max(0, this.audio.duration - 1)); this.resumeAt = 0; });
    this.audio.addEventListener('timeupdate', () => this.timeUpdate());
    this.audio.addEventListener('ended', () => this.advance(true));
    this.audio.addEventListener('volumechange', () => this.updateMute());
    document.addEventListener('visibilitychange', () => this.save());
    window.addEventListener('pagehide', () => this.save());
    this.restore(); this.setupMediaSession();
  }
  message(value) { $('playback-status').textContent = value; $('playback-status').title = value; }
  playState(playing) { $('play-toggle').textContent = playing ? 'Ⅱ' : '▶'; $('play-toggle').setAttribute('aria-label', playing ? 'Pause' : 'Play'); $('expanded-toggle').textContent = playing ? 'Pause' : 'Play'; if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; }
  updateMute() { $('mute').setAttribute('aria-label', this.audio.muted ? 'Unmute' : 'Mute'); $('mute').textContent = this.audio.muted || !this.audio.volume ? '⊘' : '◖'; }
  async setTracks(tracks, index = 0) { this.resumeAt = 0; this.queue.set(tracks, index); return this.playIndex(this.queue.index); }
  add(track) { this.queue.tracks.push(safeTrack(track)); this.toast('Added to your queue'); this.renderQueue(); this.save(); }
  async playIndex(index, autoplay = true) {
    if (index < 0 || index >= this.queue.tracks.length) return;
    const request = ++this.request; this.controller?.abort(); this.controller = new AbortController();
    this.queue.index = index; this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); this.streamFailed = false; this.counted = false; this.listened = 0; this.lastTime = 0;
    const track = this.queue.current; this.renderTrack(track); this.renderQueue(); this.message('Preparing your music…'); this.save();
    try {
      const data = await this.api(`/api/music/tracks/${encodeURIComponent(track.id)}/stream`, 'GET', undefined, { signal: this.controller.signal });
      if (request !== this.request) return;
      const url = new URL(data.url); if (url.protocol !== 'https:' && !(url.origin === location.origin && url.protocol === 'http:')) throw Error('The stream address is unavailable.');
      this.audio.src = url.href; this.audio.load(); this.message(autoplay ? 'Loading audio…' : 'Ready when you are');
      if (autoplay) await this.audio.play();
    } catch (error) {
      if (request !== this.request || error.name === 'AbortError') return;
      this.playState(false); this.streamFailed = error.name !== 'NotAllowedError';
      this.message(error.name === 'NotAllowedError' ? 'Press play to start listening' : 'Unable to play. Press play to retry.'); this.toast(error.message || 'Playback unavailable', true);
    }
  }
  async toggle() {
    if (!this.queue.current) return;
    if (!this.audio.paused) { this.audio.pause(); return; }
    if (this.streamFailed || !this.audio.getAttribute('src')) { this.resumeAt = this.audio.currentTime || this.resumeAt; await this.playIndex(this.queue.index); return; }
    try { await this.audio.play(); } catch (error) { this.message('Press play to retry'); this.toast(error.message, true); }
  }
  advance(ended = false) { const index = this.queue.next(ended); if (index < 0) { this.playState(false); this.message('You’ve reached the end of your queue'); this.save(); } else this.playIndex(index); }
  renderTrack(track) {
    $('player').hidden = false; document.body.classList.add('has-player');
    $('player-title').textContent = track.title; $('player-artist').textContent = track.artist; $('player-artist').href = track.artist_id ? '/artists?id=' + track.artist_id : '/artists';
    $('expanded-title').textContent = track.title; $('expanded-artist').textContent = track.artist;
    for (const id of ['player-art', 'expanded-art']) { $(id).onerror = () => { $(id).onerror = null; $(id).src = '/web/artwork.svg'; }; $(id).src = cover(track); }
    $('elapsed').textContent = '0:00'; $('duration').textContent = '0:00'; $('seek').value = 0; $('seek').disabled = true; $('expanded-elapsed').textContent='0:00';$('expanded-duration').textContent='0:00';$('expanded-seek').value=0;$('expanded-seek').disabled=true;
    $('player-like').setAttribute('aria-pressed', 'false');
    document.dispatchEvent(new CustomEvent('trackchange', { detail: track }));
    if ('mediaSession' in navigator && 'MediaMetadata' in window) navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: 'LAE-MUSIC', artwork: [{ src: new URL(cover(track), location.origin).href }] });
  }
  timeUpdate() {
    $('expanded-elapsed').textContent=time(this.audio.currentTime);$('expanded-seek').value=this.audio.duration?Math.round(this.audio.currentTime/this.audio.duration*1000):0;
    $('elapsed').textContent = time(this.audio.currentTime); $('seek').value = this.audio.duration ? Math.round(this.audio.currentTime / this.audio.duration * 1000) : 0;
    const delta = this.audio.currentTime - this.lastTime; if (!this.audio.paused && delta > 0 && delta < 2) this.listened += delta; this.lastTime = this.audio.currentTime;
    if (!this.counted && this.listened >= Math.min(30, Number.isFinite(this.audio.duration) ? this.audio.duration * .5 : 30)) {
      this.counted = true; const id = this.queue.current?.id;
      if (id) { this.api(`/api/music/tracks/${id}/play`, 'POST', {}).catch(() => {}); this.api('/api/listener/history', 'POST', { trackId: id }).catch(() => {}); }
    }
    if (!this.savedAt || Date.now() - this.savedAt > 5000) { this.savedAt = Date.now(); this.save(); }
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && Number.isFinite(this.audio.duration) && this.audio.duration > 0) { try { navigator.mediaSession.setPositionState({ duration: this.audio.duration, playbackRate: this.audio.playbackRate, position: Math.min(this.audio.currentTime, this.audio.duration) }); } catch {} }
  }
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
  save() { try { localStorage.setItem('lae_playback_v2', JSON.stringify({ tracks: this.queue.tracks.slice(0, 200), index: this.queue.index, position: this.audio.currentTime || this.resumeAt, volume: this.audio.volume, shuffle: this.queue.shuffle, repeat: this.queue.repeat })); } catch {} }
  restore() {
    try { const data = JSON.parse(localStorage.getItem('lae_playback_v2')); if (!data || !Array.isArray(data.tracks)) return;
      const tracks = data.tracks.filter(t => t && /^[1-9]\d{0,15}$/.test(String(t.id))).slice(0, 200);
      this.queue.set(tracks, Number.isInteger(data.index) ? data.index : 0); this.queue.shuffle = data.shuffle === true; this.queue.repeat = ['off', 'all', 'one'].includes(data.repeat) ? data.repeat : 'off';
      this.audio.volume = typeof data.volume === 'number' && data.volume >= 0 && data.volume <= 1 ? data.volume : .8; $('volume').value = this.audio.volume; $('shuffle').setAttribute('aria-pressed', this.queue.shuffle); $('repeat').setAttribute('aria-pressed', this.queue.repeat !== 'off'); $('repeat').setAttribute('aria-label', 'Repeat ' + this.queue.repeat); $('repeat').textContent = this.queue.repeat === 'one' ? '↻¹' : '↻';
      if (this.queue.current) { this.resumeAt = Math.max(0, Number(data.position) || 0); this.renderTrack(this.queue.current); this.message('Press play to resume'); }
    } catch { /* A stale/corrupt browser preference must never prevent public listening. */ }
  }
  setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    for (const [action, handler] of Object.entries({ play: () => { if(this.audio.paused)this.toggle(); }, pause: () => this.audio.pause(), nexttrack: () => this.advance(), previoustrack: () => this.playIndex(this.queue.previous()), seekto: event => { if (Number.isFinite(event.seekTime)) this.audio.currentTime = event.seekTime; }, seekbackward: event => { this.audio.currentTime = Math.max(0, this.audio.currentTime - (event.seekOffset || 10)); }, seekforward: event => { if (Number.isFinite(this.audio.duration)) this.audio.currentTime = Math.min(this.audio.duration, this.audio.currentTime + (event.seekOffset || 10)); } })) { try { navigator.mediaSession.setActionHandler(action, handler); } catch {} }
  }
}
