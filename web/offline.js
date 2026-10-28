import "./offline-protocol.js";
const { LIMITS, canonical, message } = globalThis.LaeOfflineProtocol;
const bytes = (value) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
const b64 = (value) =>
  btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
const encoded = (value) => new TextEncoder().encode(value),
  safe = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
export class OfflineLibrary {
  constructor({ api, toast = () => {}, now = () => Date.now() } = {}) {
    this.api = api;
    this.toast = toast;
    this.now = now;
    this.urls = new Set();
    this.owner = null;
    this.allowed = false;
    this.supported = !!(
      globalThis.isSecureContext &&
      globalThis.indexedDB &&
      globalThis.crypto?.subtle &&
      navigator.serviceWorker
    );
    this.channel =
      typeof BroadcastChannel === "function"
        ? new BroadcastChannel("lae-offline-library")
        : null;
    this.channel?.addEventListener("message", (e) => {
      if (e.data.owner === this.owner) {
        this.halt();
        if (e.data.type === "clear") {
          this.owner = null;
          this.device = null;
          this.allowed = false;
        }
        this.onchange?.();
      }
    });
    window.addEventListener("online", () => {
      if (this.owner) this.sync().catch(() => {});
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.checkPlayback();
    });
  }
  async db() {
    if (!this.supported)
      throw Error(
        "Offline listening requires HTTPS, service workers, IndexedDB and Web Crypto. Use online streaming in this browser.",
      );
    if (!this.database)
      this.database = new Promise((resolve, reject) => {
        const r = indexedDB.open("lae-music-offline", 1);
        r.onupgradeneeded = () => {
          for (const name of ["devices", "tracks", "audio", "events", "meta"])
            r.result.createObjectStore(name, { keyPath: "id" });
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () =>
          reject(Error("Your browser could not open offline storage."));
      });
    return this.database;
  }
  async get(store, id) {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const r = db.transaction(store).objectStore(store).get(id);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async all(store) {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const r = db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async write(store, value) {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, "readwrite");
      t.objectStore(store).put(value);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || Error("Browser storage is full."));
    });
  }
  async erase(stores, id) {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, "readwrite");
      for (const name of stores) t.objectStore(name).delete(id);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  }
  async lock(name, fn) {
    if (navigator.locks)
      return navigator.locks.request("lae-offline-" + name, fn);
    const holder = crypto.randomUUID(),
      id = "lease:" + name,
      db = await this.db();
    await new Promise((resolve, reject) => {
      const t = db.transaction("meta", "readwrite"),
        s = t.objectStore("meta"),
        r = s.get(id);
      r.onsuccess = () => {
        if (r.result && r.result.until > this.now()) {
          t.abort();
          return;
        }
        s.put({ id, holder, until: this.now() + 60000 });
      };
      t.oncomplete = resolve;
      t.onabort = () =>
        reject(
          Error("Offline storage is busy in another tab. Try again shortly."),
        );
      t.onerror = () => reject(t.error);
    });
    try {
      return await fn();
    } finally {
      const v = await this.get("meta", id);
      if (v?.holder === holder) await this.erase(["meta"], id);
    }
  }
  async worker() {
    await this.db();
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (navigator.onLine || !existing?.active)
      await navigator.serviceWorker.register("/service-worker.js", {
        scope: "/",
      });
    await navigator.serviceWorker.ready;
  }
  async updateDevice(changes) {
    const owner = this.owner,
      deviceId = this.device?.device_id;
    if (!owner) return;
    const db = await this.db();
    await new Promise((resolve, reject) => {
      const t = db.transaction("devices", "readwrite"),
        s = t.objectStore("devices"),
        r = s.get(owner);
      r.onsuccess = () => {
        if (
          r.result &&
          this.owner === owner &&
          this.device?.device_id === deviceId
        ) {
          this.device = { ...r.result, ...changes };
          s.put(this.device);
        }
      };
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  }
  anchor(server) {
    this.anchorServer = server;
    this.anchorWall = this.now();
    this.anchorPerf = performance.now();
    this.peak = server;
    void this.updateDevice({
      server_ms: server,
      wall_ms: this.anchorWall,
      peak_ms: server,
    }).catch(() => {});
  }
  clock() {
    if (!this.device) throw Error("Reconnect to verify your offline library.");
    if (this.anchorServer === undefined) {
      this.anchorServer = this.device.server_ms;
      this.anchorWall = this.device.wall_ms;
      this.anchorPerf = performance.now();
      this.peak = this.device.peak_ms || 0;
    }
    const wall = this.now(),
      current =
        this.anchorServer +
        Math.max(
          0,
          wall - this.anchorWall,
          performance.now() - this.anchorPerf,
        );
    if (wall < this.anchorWall - 1000 || current < this.peak - 1000)
      throw Error(
        "Your device clock changed. Reconnect to verify offline access.",
      );
    this.peak = Math.max(current, this.peak || 0);
    if (!this.lastClockSave || performance.now() - this.lastClockSave > 5000) {
      this.lastClockSave = performance.now();
      void this.updateDevice({ peak_ms: this.peak }).catch(() => {});
    }
    return this.peak;
  }
  async boot() {
    if (!this.supported) return;
    await this.worker();
    const last = await this.get("meta", "owner");
    if (last) {
      this.owner = last.owner;
      this.device = await this.get("devices", this.owner);
      this.allowed = this.device?.allowed === true;
    }
    if (!this.device) this.owner = null;
  }
  async activate(listener) {
    this.account = listener;
    if (!this.supported) return;
    const last = await this.get("meta", "owner");
    if (last?.owner && String(listener?.id || "") !== last.owner)
      await this.forget(last.owner);
    if (!listener) {
      this.owner = null;
      this.allowed = false;
      return;
    }
    this.owner = String(listener.id);
    this.allowed =
      !!listener.premium &&
      new Date(listener.premium.expires_at).getTime() > this.now();
    this.capabilities = await this.api("/api/platform/offline/capabilities");
    await this.lock("identity:" + this.owner, async () => {
      this.device = await this.get("devices", this.owner);
      if (!this.device && this.allowed && this.capabilities.enabled) {
        const sign = await crypto.subtle.generateKey(
            { name: "ECDSA", namedCurve: "P-256" },
            false,
            ["sign", "verify"],
          ),
          aes = await crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"],
          ),
          jwk = await crypto.subtle.exportKey("jwk", sign.publicKey);
        this.device = {
          id: this.owner,
          device_id: crypto.randomUUID(),
          private_key: sign.privateKey,
          public_jwk: jwk,
          aes,
          sequence: 0,
          name: listener.display_name || "Music listener",
          allowed: true,
          server_ms: this.now(),
          wall_ms: this.now(),
          peak_ms: this.now(),
        };
        await this.write("devices", this.device);
      }
      if (this.device && this.allowed && this.capabilities.enabled) {
        try {
          await this.api(
            "/api/platform/offline/register",
            "POST",
            {
              device_id: this.device.device_id,
              public_jwk: this.device.public_jwk,
              label: "This browser",
            },
            { headers: { "Idempotency-Key": crypto.randomUUID() } },
          );
        } catch (e) {
          if (e.status === 409) {
            await this.forget(this.owner);
            throw e;
          }
          if (e.status < 500) throw e;
        }
      }
    });
    if (this.device) {
      await this.write("meta", { id: "owner", owner: this.owner });
      await this.sync().catch(() => {});
      await this.updateDevice({
        allowed: this.allowed,
        name: listener.display_name || this.device.name,
      });
      if (!this.allowed) {
        this.halt();
      } else if (this.capabilities.enabled) {
        await this.worker();
        await this.revalidate().catch(() => {});
      }
    }
  }
  async signed(action, payload) {
    if (!this.device)
      throw Error("Connect and sign in to Premium before saving songs.");
    const c = await this.api("/api/platform/offline/challenge", "POST", {
      device_id: this.device.device_id,
      action,
    });
    this.anchor(c.server_ms);
    const proof = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      this.device.private_key,
      encoded(message(this.device.device_id, c.nonce, action, payload)),
    );
    return {
      device_id: this.device.device_id,
      nonce: c.nonce,
      payload,
      signature: b64(proof),
    };
  }
  async verify(token, key) {
    if (!token || token.kid !== key.kid)
      throw Error("Offline license verification failed. Reconnect.");
    const pub = await crypto.subtle.importKey(
      "jwk",
      key.public_key,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    if (
      !(await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        pub,
        bytes(token.signature),
        encoded(token.payload),
      ))
    )
      throw Error("Offline license verification failed.");
    const p = JSON.parse(new TextDecoder().decode(bytes(token.payload)));
    if (
      p.listener_id !== this.owner ||
      p.device_id !== this.device.device_id ||
      p.kid !== key.kid ||
      this.clock() >= p.until_ms ||
      this.device.allowed === false ||
      !this.allowed
    )
      throw Error("Reconnect to renew or verify your Premium offline access.");
    return p;
  }
  async rows() {
    if (!this.owner || !this.supported) return [];
    return (await this.all("tracks")).filter((t) => t.owner === this.owner);
  }
  async save(track) {
    if (!navigator.onLine)
      throw Error("Connect to save a song for offline listening.");
    if (!this.allowed || !this.capabilities?.enabled)
      throw Error(
        "Offline saving needs active Premium and an available offline service.",
      );
    return this.lock("cache", async () => {
      const owner = this.owner,
        device = this.device;
      if (!owner || !device || !this.allowed)
        throw Error("Reconnect to verify offline access.");
      await this.worker();
      const old = await this.get("tracks", this.owner + ":" + track.id),
        proof = await this.signed("grant", {
          track_id: String(track.id),
          include_media: !old,
        }),
        grant = await this.api("/api/platform/offline/grant", "POST", proof, {
          headers: { "Idempotency-Key": crypto.randomUUID() },
        });
      this.anchor(grant.server_ms);
      const trust = { kid: grant.token.kid, public_key: grant.public_key },
        payload = await this.verify(grant.token, trust),
        id = this.owner + ":" + payload.track_id;
      if (old && old.asset_hash === payload.asset_hash) {
        await this.write("tracks", {
          ...old,
          token: grant.token,
          trust,
          payload,
        });
        return;
      }
      if (old) {
        await this.erase(["tracks", "audio"], id);
        throw Error(
          "This song was updated. Select Save offline again to save its new audio.",
        );
      }
      const rows = await this.all("tracks");
      if (
        rows.length >= LIMITS.maxSongs ||
        rows.reduce((n, t) => n + t.size, 0) + payload.audio_bytes >
          LIMITS.maxLibraryBytes
      )
        throw Error("Your offline library is full. Remove a saved song first.");
      const controller = new AbortController(),
        deadline = setTimeout(() => controller.abort(), 30000);
      let r;
      try {
        r = await fetch("/api/platform/offline/media", {
          method: "POST",
          credentials: "same-origin",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_id: payload.grant_id,
            media_ticket: grant.media_ticket,
          }),
          cache: "no-store",
        });
      } catch (e) {
        clearTimeout(deadline);
        throw e;
      }
      if (!r.ok) {
        clearTimeout(deadline);
        throw Error("The song could not be saved. Reconnect and try again.");
      }
      const reader = r.body.getReader(),
        parts = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > LIMITS.maxBytes || size > payload.audio_bytes)
            throw Error("Offline media exceeds its allowed size.");
          parts.push(value);
        }
      } finally {
        clearTimeout(deadline);
        reader.releaseLock();
      }
      if (size !== payload.audio_bytes)
        throw Error("The song was incomplete. Save it again while online.");
      const plain = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) {
        plain.set(part, offset);
        offset += part.byteLength;
      }
      const iv = crypto.getRandomValues(new Uint8Array(12)),
        cipher = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          this.device.aes,
          plain,
        );
      plain.fill(0);
      for (const part of parts) part.fill(0);
      if (
        this.owner !== owner ||
        this.device?.device_id !== device?.device_id ||
        !this.allowed
      )
        throw Error(
          "Your offline account changed. Save again after signing in.",
        );
      const db = await this.db();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["tracks", "audio"], "readwrite");
        tx.objectStore("tracks").put({
          id,
          owner: this.owner,
          track_id: payload.track_id,
          title: payload.title,
          artist: payload.artist,
          artist_id: payload.artist_id,
          genre: payload.genre,
          asset_hash: payload.asset_hash,
          size,
          token: grant.token,
          trust,
          payload,
        });
        tx.objectStore("audio").put({ id, iv, cipher });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(Error("Browser storage is full."));
      });
      if (navigator.storage?.persist)
        void navigator.storage.persist().catch(() => {});
      this.toast("Saved in your LAE-MUSIC offline library");
    });
  }
  async revalidate() {
    return this.lock("cache", async () => {
      if (
        !navigator.onLine ||
        !this.device ||
        !this.allowed ||
        !this.capabilities?.enabled
      )
        return;
      for (const row of await this.rows()) {
        try {
          const proof = await this.signed("grant", {
              track_id: row.track_id,
              include_media: false,
            }),
            r = await this.api("/api/platform/offline/grant", "POST", proof, {
              headers: { "Idempotency-Key": crypto.randomUUID() },
            });
          this.anchor(r.server_ms);
          const trust = { kid: r.token.kid, public_key: r.public_key },
            payload = await this.verify(r.token, trust);
          if (payload.asset_hash !== row.asset_hash) {
            await this.remove(row.track_id, false);
            continue;
          }
          await this.write("tracks", {
            ...row,
            payload,
            trust,
            token: r.token,
          });
        } catch (e) {
          if ([403, 404, 409].includes(e.status)) {
            await this.remove(row.track_id, false);
          } else break;
        }
      }
    });
  }
  async media(track) {
    const owner = this.owner,
      device = this.device;
    const row = await this.get("tracks", this.owner + ":" + track.id);
    if (!row) throw Error("This song is not saved in your offline library.");
    const p = await this.verify(row.token, row.trust),
      data = await this.get("audio", row.id);
    if (!data)
      throw Error(
        "Your browser removed this saved song. Save it again while online.",
      );
    let plain;
    try {
      plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: data.iv },
        this.device.aes,
        data.cipher,
      );
    } catch {
      throw Error(
        "Saved audio could not be opened. Remove and save the song again.",
      );
    }
    if (
      this.owner !== owner ||
      this.device?.device_id !== device?.device_id ||
      !this.allowed
    ) {
      new Uint8Array(plain).fill(0);
      throw Error("Offline access changed. Reconnect to verify Premium.");
    }
    const blob = new Blob([plain], { type: p.audio_mime });
    new Uint8Array(plain).fill(0);
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    return { url, offline: true, grant: p };
  }
  async source(track, online) {
    this.release();
    if (track.offline || !navigator.onLine) return this.media(track);
    try {
      return await online();
    } catch (error) {
      if (this.owner && (await this.get("tracks", this.owner + ":" + track.id)))
        return this.media(track);
      throw error;
    }
  }
  halt() {
    this.play = null;
    if (this.player?.currentSourceOffline) {
      this.player.audio.pause();
      this.player.audio.removeAttribute("src");
      this.player.audio.load();
      this.player.streamFailed = true;
    }
    this.release();
  }
  release() {
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
  }
  async remove(track, notify = true) {
    if (!this.owner) return;
    if (navigator.onLine && this.device)
      await this.api("/api/platform/offline/remove", "POST", {
        device_id: this.device.device_id,
        track_id: String(track),
      }).catch(() => {});
    await this.erase(["tracks", "audio"], this.owner + ":" + track);
    this.channel?.postMessage({ type: "remove", owner: this.owner, track });
    if (this.player?.queue.current?.id === String(track)) {
      this.halt();
    }
    if (notify) this.onchange?.();
  }
  async forget(owner = this.owner) {
    if (!owner || !this.supported) return;
    if (this.owner === owner) {
      this.allowed = false;
      this.halt();
    }
    return this.lock("cache", async () => {
      if (navigator.onLine && this.device && this.owner === owner)
        await this.api("/api/platform/offline/revoke", "POST", {
          device_id: this.device.device_id,
        }).catch(() => {});
      for (const row of (await this.all("tracks")).filter(
        (t) => t.owner === owner,
      ))
        await this.erase(["tracks", "audio"], row.id);
      for (const row of (await this.all("events")).filter(
        (t) => t.owner === owner,
      ))
        await this.erase(["events"], row.id);
      await this.erase(["devices"], owner);
      await this.erase(["meta"], "owner");
      if (this.owner === owner) {
        this.halt();
        this.owner = null;
        this.device = null;
        this.allowed = false;
      }
      this.channel?.postMessage({ type: "clear", owner });
    });
  }
  async enqueue(event) {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["devices", "events"], "readwrite"),
        s = tx.objectStore("devices"),
        r = s.get(this.owner);
      r.onsuccess = () => {
        if (!r.result) {
          tx.abort();
          return;
        }
        const d = r.result;
        d.sequence++;
        s.put(d);
        tx.objectStore("events").put({
          ...event,
          owner: this.owner,
          sequence: d.sequence,
        });
      };
      tx.oncomplete = resolve;
      tx.onabort = () => reject(Error("Offline play could not be stored."));
      tx.onerror = () => reject(tx.error);
    });
  }
  async sync() {
    if (!navigator.onLine || !this.device || this.syncing) return;
    this.syncing = true;
    try {
      await this.lock("sync:" + this.owner, async () => {
        const all = (await this.all("events"))
          .filter((e) => e.owner === this.owner)
          .sort((a, b) => a.sequence - b.sequence);
        for (let start = 0; start < all.length; start += LIMITS.maxBatch) {
          const events = all
              .slice(start, start + LIMITS.maxBatch)
              .map(({ owner, ...e }) => e),
            proof = await this.signed("sync", { events }),
            r = await this.api("/api/platform/offline/sync", "POST", proof, {
              headers: { "Idempotency-Key": crypto.randomUUID() },
            });
          this.anchor(r.server_ms);
          for (const ack of r.results) await this.erase(["events"], ack.id);
        }
      });
    } finally {
      this.syncing = false;
    }
  }
  bind(player) {
    this.player = player;
    player.beforeResume = async () => {
      if (player.currentSourceOffline) {
        const row = await this.get(
          "tracks",
          this.owner + ":" + player.queue.current.id,
        );
        if (!row) throw Error("This offline song is no longer available.");
        await this.verify(row.token, row.trust);
      }
    };
    document.addEventListener("trackchange", () => {
      this.play = null;
    });
    document.addEventListener("playbacksource", (event) => {
      if (event.detail.offline) {
        this.play = {
          id: crypto.randomUUID(),
          grant: event.detail.grant,
          started: this.clock(),
          last: performance.now(),
          pos: player.audio.currentTime,
          ms: 0,
          done: false,
        };
      }
    });
    player.audio.addEventListener("timeupdate", () => this.trackTime());
    this.expiryTimer = setInterval(() => this.checkPlayback(), 1000);
  }
  checkPlayback() {
    if (!this.play) return;
    try {
      if (this.clock() >= this.play.grant.until_ms || !this.allowed)
        throw Error("Offline access expired. Reconnect to verify Premium.");
    } catch (e) {
      this.halt();
      this.play = null;
      this.toast(e.message, true);
    }
  }
  trackTime() {
    const p = this.play;
    if (!p) return;
    this.checkPlayback();
    if (!this.play) return;
    const clock = performance.now(),
      position = this.player.audio.currentTime,
      elapsed = clock - p.last,
      progress = (position - p.pos) * 1000;
    p.last = clock;
    p.pos = position;
    if (this.player.audio.paused || p.done) return;
    if (elapsed > 25000 || progress < 0 || progress > elapsed * 1.15 + 1000) {
      p.ms = 0;
      p.started = this.clock();
      return;
    }
    p.ms += Math.max(0, Math.min(elapsed, progress, 15000));
    if (
      p.ms >= LIMITS.minListenMs &&
      this.clock() - p.started >= LIMITS.minListenMs
    ) {
      p.done = true;
      void this.enqueue({
        id: p.id,
        grant_id: p.grant.grant_id,
        started_ms: Math.floor(p.started),
        ended_ms: Math.floor(this.clock()),
        listened_ms: Math.floor(p.ms),
      })
        .then(() => this.sync())
        .catch((e) => this.toast(e.message, true));
    }
  }
}
export async function offlinePage(view, ctx) {
  const { offline, player } = ctx;
  let rows = [];
  try {
    rows = await offline.rows();
  } catch {}
  const total = rows.reduce((n, t) => n + t.size, 0),
    pending = offline.owner
      ? (await offline.all("events")).filter((e) => e.owner === offline.owner)
          .length
      : 0;
  const devices =
    navigator.onLine && (offline.owner || offline.account)
      ? (
          await offline
            .api("/api/platform/offline/devices")
            .catch(() => ({ devices: [] }))
        ).devices
      : [];
  const html = `<div class="page-heading"><div><span class="eyebrow">YOUR MUSIC, WITH YOU</span><h1>Your offline library.</h1><p>Premium songs saved inside LAE-MUSIC. No separate song purchase or MP3 export.</p></div></div><div class="notice">Reconnect at least every 24 hours and before your Premium expires. Your browser may remove saved data; private browsing and some mobile browsers offer limited storage.</div>${!offline.supported ? '<div class="notice warning">This browser cannot provide offline listening. Use online streaming.</div>' : !offline.owner ? '<section class="panel"><h2>Set up your listening space.</h2><p>Connect, sign in to Premium and save songs from their song pages.</p><a class="button" href="/join?role=listener" data-nav>Sign in online</a></section>' : `<section class="panel"><h2>Saved for ${safe(offline.device?.name || "you")}</h2><p>${rows.length} songs · ${(total / 1048576).toFixed(1)} MB · ${pending} listening reports waiting to sync</p><div class="row-actions"><button class="button secondary" id="offline-sync">Verify & sync online</button><button class="button secondary" id="offline-clear">Clear this offline library</button></div><p>Offline listening supports artists after eligible reports sync. Estimates are not payable cash.</p></section>`}<div class="track-grid">${rows.map((t) => `<article class="panel"><span class="eyebrow">PREMIUM OFFLINE</span><h2>${safe(t.title)}</h2><p>${safe(t.artist)}</p><p>Verify by ${safe(new Date(t.payload.until_ms).toLocaleString())}</p><div class="row-actions"><button class="button" data-offline-play="${safe(t.track_id)}">Play saved song</button><button class="button secondary" data-offline-remove="${safe(t.track_id)}">Remove</button></div></article>`).join("")}</div>`;
  const unavailable =
    navigator.onLine && offline.capabilities?.enabled === false
      ? '<div class="notice warning">Offline listening is temporarily unavailable. Online streaming remains available.</div>'
      : "";
  const devicePanel = devices.length
    ? `<section class="panel"><h2>Your offline devices</h2><p>Revocation applies at the next online check or when the current offline grant expires, within 24 hours.</p>${devices.map((d) => `<div class="row-actions"><span>${safe(d.label)} ${d.id === offline.device?.device_id ? "· This browser" : ""}${d.revoked_at ? " · Revoked" : ""}</span>${d.revoked_at ? "" : `<button class="button secondary" data-offline-revoke="${safe(d.id)}">Revoke device</button>`}</div>`).join("")}</section>`
    : "";
  if (!view.set(unavailable + html + devicePanel)) return;
  document.querySelectorAll("[data-offline-revoke]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await offline.api("/api/platform/offline/revoke", "POST", {
            device_id: b.dataset.offlineRevoke,
          });
          if (offline.device?.device_id === b.dataset.offlineRevoke)
            await offline.forget();
          if (offline.account)
            await offline.activate(offline.account).catch(() => {});
          ctx.route?.();
        } catch (e) {
          ctx.toast(e.message, true);
        }
      }),
  );

  document.querySelectorAll("[data-offline-play]").forEach(
    (b) =>
      (b.onclick = () => {
        const list = rows.map((t) => ({
          id: t.track_id,
          title: t.title,
          artist: t.artist,
          artist_id: t.artist_id,
          genre: t.genre,
          offline: true,
        }));
        void player.setTracks(
          list,
          list.findIndex((t) => t.id === b.dataset.offlinePlay),
        );
      }),
  );
  document.querySelectorAll("[data-offline-remove]").forEach(
    (b) =>
      (b.onclick = async () => {
        await offline.remove(b.dataset.offlineRemove);
        ctx.route?.();
      }),
  );
  const sync = document.getElementById("offline-sync");
  if (sync)
    sync.onclick = async () => {
      sync.disabled = true;
      try {
        if (!navigator.onLine)
          throw Error("Connect to verify and sync your library.");
        await ctx.refresh?.();
        if (!offline.capabilities?.enabled)
          throw Error(
            "Offline verification is temporarily unavailable. Your current saves remain subject to their expiry.",
          );
        await offline.sync();
        await offline.revalidate();
        ctx.toast("Offline library verification completed");
        ctx.route?.();
      } catch (e) {
        ctx.toast(e.message, true);
      } finally {
        sync.disabled = false;
      }
    };
  const clear = document.getElementById("offline-clear");
  if (clear)
    clear.onclick = async () => {
      await offline.sync().catch(() => {});
      await offline.forget();
      ctx.route?.();
    };
}
