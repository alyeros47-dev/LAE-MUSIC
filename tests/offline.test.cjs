"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { canonical, message, LIMITS } = require("../web/offline-protocol"),
  { signing, deviceKey, createOffline } = require("../lib/offline-listening");
test("offline protocol is deterministic across key order and rejects ambiguous values", () => {
  assert.equal(
    canonical({ z: 1, a: ["x", true] }),
    canonical({ a: ["x", true], z: 1 }),
  );
  assert.equal(
    message("d", "n", "sync", { a: 1 }),
    '{"action":"sync","device_id":"d","nonce":"n","payload":{"a":1},"v":1}',
  );
  for (const x of [undefined, NaN, 1.5, new Date(), () => {}])
    assert.throws(() => canonical(x));
  assert.equal(LIMITS.leaseMs, 86400000);
  assert.equal(LIMITS.syncMs, 172800000);
});
test("offline licenses require a configured P-256 server key; private device material is never accepted", async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    }),
    s = signing(privateKey);
  assert(s);
  assert.equal(s.jwk.d, undefined);
  assert.equal(signing("unconfigured"), null);
  assert.equal(
    signing(
      crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey,
    ),
    null,
  );
  assert.throws(() => deviceKey(privateKey.export({ format: "jwk" })));
  assert(deviceKey(publicKey.export({ format: "jwk" })));
  const api = createOffline({
    pool: {},
    signingKey: "",
    mediaSource: async () => {
      throw Error("Must not contact media");
    },
  });
  assert.equal(api.capabilities().enabled, false);
  await assert.rejects(
    api.register(1, "unavailable-key", { device_id: crypto.randomUUID() }),
    (e) => e.status === 503,
  );
});
test("server ECDSA license signatures verify with actual browser-compatible Web Crypto and reject tampering", async () => {
  const { privateKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    }),
    s = signing(privateKey),
    payload = Buffer.from(canonical({ v: 1, until_ms: 1000 })).toString(
      "base64url",
    ),
    sig = crypto.sign("sha256", Buffer.from(payload), {
      key: s.key,
      dsaEncoding: "ieee-p1363",
    }),
    pub = await crypto.webcrypto.subtle.importKey(
      "jwk",
      s.jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  assert.equal(
    await crypto.webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pub,
      sig,
      Buffer.from(payload),
    ),
    true,
  );
  assert.equal(
    await crypto.webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pub,
      sig,
      Buffer.from(payload + "A"),
    ),
    false,
  );
});
test("offline proxy streams only a verified object and rejects MIME, oversize and incomplete media", async () => {
  const { createOfflineMedia } = require("../lib/offline-media");
  assert.equal(createOfflineMedia({ storage: () => null }), undefined);
  const track = {
    audio_key: "owned/audio",
    audio_bytes: 3,
    audio_mime: "audio/mpeg",
  };
  for (const [bytes, mime] of [
    [Buffer.from([1, 2]), "audio/mpeg"],
    [Buffer.from([1, 2, 3, 4]), "audio/mpeg"],
    [Buffer.from([1, 2, 3]), "text/html"],
  ]) {
    const media = createOfflineMedia({
      storage: () => ({}),
      presign: () => "https://r2.example.test/signed",
      fetcher: async (_url, options) => {
        assert.equal(options.redirect, "error");
        return new Response(bytes, { headers: { "Content-Type": mime } });
      },
    });
    await assert.rejects(media(track), (e) => e.status === 502);
  }
  const media = createOfflineMedia({
    storage: () => ({}),
    presign: () => "https://r2.example.test/signed",
    fetcher: async () =>
      new Response(Buffer.from([1, 2, 3]), {
        headers: { "Content-Type": "audio/mpeg" },
      }),
  });
  assert.deepEqual((await media(track)).bytes, Buffer.from([1, 2, 3]));
});
test("free listening advertisements require reviewed creative and never apply to active Premium", async () => {
  const { createListeningAds } = require("../lib/listening-ads");
  let calls = 0;
  const settings = {
      enabled: true,
      creative: {
        reviewed: true,
        id: "approved",
        sponsor: "Fixture",
        audio_key: "platform/ads/approved.mp3",
      },
    },
    source = async () => {
      calls++;
      return "https://r2.example.test/ad";
    };
  const svc = createListeningAds({
    settings,
    source,
    premium: { active: async (id) => id === 7 },
  });
  assert.equal((await svc.next(7)).ad, null);
  assert.equal(calls, 0);
  assert.equal((await svc.next(null)).ad.sponsor, "Fixture");
  assert.equal(calls, 1);
  const unsafe = createListeningAds({
    settings: {
      ...settings,
      creative: { ...settings.creative, audio_key: "artist/private.mp3" },
    },
    source,
    premium: { active: async () => false },
  });
  assert.equal((await unsafe.next(null)).ad, null);
  assert.equal(calls, 1);
});

test("free ad breaks respect Premium, volume and user pause without generating playback or money events", async () => {
  const fs = require("node:fs"),
    { ListeningAds } = await import(
      "data:text/javascript;base64," +
        fs.readFileSync("web/listening-ads.js").toString("base64")
    );
  class AudioFixture extends EventTarget {
    constructor() {
      super();
      this.paused = true;
      this.currentTime = 0;
    }
    async play() {
      this.paused = false;
      this.dispatchEvent(new Event("play"));
      this.dispatchEvent(new Event("playing"));
    }
    pause() {
      this.paused = true;
      this.dispatchEvent(new Event("pause"));
    }
    removeAttribute() {}
  }
  let calls = 0;
  const audio = new AudioFixture(),
    ads = new ListeningAds({
      api: async () => {
        calls++;
        return {
          ad: {
            url: "https://owned.example.test/ad",
            sponsor: "Fixture",
            max_seconds: 30,
          },
        };
      },
      getVolume: () => ({ volume: 0.2, muted: true }),
      makeAudio: () => audio,
    });
  await ads.beforeAdvance();
  await ads.beforeAdvance();
  assert.equal(calls, 0);
  const pending = ads.beforeAdvance();
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 1);
  assert.equal(ads.active, true);
  assert.equal(audio.volume, 0.2);
  assert.equal(audio.muted, true);
  ads.toggle();
  ads.stop();
  assert.equal(await pending, false);
  assert.equal(ads.active, false);
  const premium = new ListeningAds({
    premium: () => true,
    api: async () => {
      throw Error("Premium must not request an advertisement");
    },
  });
  for (let i = 0; i < 5; i++) assert.equal(await premium.beforeAdvance(), true);
});
