export class ListeningAds {
  constructor({
    api,
    premium = () => false,
    onState = () => {},
    onPlayback = () => {},
    getVolume = () => ({ volume: 0.8, muted: false }),
    makeAudio = () => new Audio(),
  } = {}) {
    Object.assign(this, {
      api,
      premium,
      onState,
      onPlayback,
      getVolume,
      makeAudio,
    });
    this.completed = 0;
    this.active = false;
  }
  async beforeAdvance() {
    if (this.premium()) {
      this.completed = 0;
      return true;
    }
    this.completed++;
    if (this.completed < 3) return true;
    let r;
    try {
      r = await this.api("/api/platform/listening-ad");
    } catch {
      return true;
    }
    if (!r.ad || r.premium || this.premium()) return true;
    let u;
    try {
      u = new URL(r.ad.url);
    } catch {
      return true;
    }
    if (u.protocol !== "https:") return true;
    this.completed = 0;
    this.active = true;
    this.userPaused = false;
    this.audio = this.makeAudio();
    this.audio.src = u.href;
    const volume = this.getVolume();
    this.audio.volume = volume.volume;
    this.audio.muted = volume.muted;
    this.onState(true, r.ad);
    return new Promise((resolve) => {
      let timer;
      const finish = () => {
        if (!this.active) return;
        clearTimeout(timer);
        this.audio.pause();
        this.audio.removeAttribute("src");
        this.active = false;
        this.onState(false);
        this.finish = null;
        resolve(!this.userPaused);
      };
      this.finish = finish;
      const deadline = () => {
        clearTimeout(timer);
        if (!this.userPaused) timer = setTimeout(finish, 15000);
      };
      this.audio.addEventListener("ended", finish, { once: true });
      this.audio.addEventListener("error", finish, { once: true });
      this.audio.addEventListener("playing", () => clearTimeout(timer));
      this.audio.addEventListener("waiting", deadline);
      this.audio.addEventListener("play", () => this.onPlayback(true));
      this.audio.addEventListener("pause", () => {
        clearTimeout(timer);
        this.onPlayback(false);
      });
      this.audio.addEventListener("timeupdate", () => {
        if (this.audio.currentTime >= Math.min(60, r.ad.max_seconds || 60))
          finish();
      });
      deadline();
      this.audio.play().catch(finish);
    });
  }
  toggle() {
    if (!this.audio || !this.active) return;
    if (this.audio.paused) {
      this.userPaused = false;
      this.audio.play().catch(() => this.finish?.());
    } else {
      this.userPaused = true;
      this.audio.pause();
    }
  }
  stop() {
    this.finish?.();
  }
}
