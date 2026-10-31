"use strict";
const crypto = require("node:crypto");
const send = (r, n, o) => {
  r.writeHead(n, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  r.end(JSON.stringify(o));
};
async function input(req) {
  let s = "";
  for await (const c of req) {
    s += c;
    if (s.length > 6000) throw Error("Request too large");
  }
  return JSON.parse(s);
}
let ready;
module.exports = async function voice(req, res, p, ctx) {
  if (!p.startsWith("/api/voice/")) return false;
  const { pool, me, validOrigin, storage, presign, headObject } = ctx;
  try {
    const reviewOpen =
      process.env.NODE_ENV === "staging" &&
      process.env.LAE_REVIEW_TEST_OPEN === "1" &&
      require("./lib/review-voice").enabled();
    const local = reviewOpen
      ? require("./lib/review-voice").create(pool)
      : null;
    if (
      local &&
      (await local.handle(
        req,
        res,
        new URL(req.url || p, "https://lae-music-review-sandbox.onrender.com"),
        validOrigin,
      ))
    )
      return true;
    const user = await me(req);
    if (!user)
      return (send(res, 401, { error: "Sign in as an artist first" }), true);
    if (["POST", "PUT"].includes(req.method) && !validOrigin(req))
      return (send(res, 403, { error: "Invalid origin" }), true);
    if (!ready)
      ready = pool
        .query(
          "CREATE TABLE IF NOT EXISTS artist_voice_profiles(creator_id BIGINT PRIMARY KEY REFERENCES creators(id) ON DELETE CASCADE,object_key TEXT NOT NULL,task_id TEXT,persona_id TEXT,status TEXT NOT NULL DEFAULT 'uploading',updated_at TIMESTAMPTZ DEFAULT NOW())",
        )
        .catch((e) => {
          ready = null;
          throw e;
        });
    await ready;
    const get = async () =>
      (
        await pool.query(
          "SELECT object_key,task_id,persona_id,status FROM artist_voice_profiles WHERE creator_id=$1",
          [user.id],
        )
      ).rows[0];
    if (p === "/api/voice/profile" && req.method === "GET") {
      const x = await get();
      return (
        send(res, 200, {
          status: x?.status || "none",
          hasVoice: !!x?.persona_id,
        }),
        true
      );
    }
    if (p === "/api/voice/upload" && req.method === "POST") {
      const b = await input(req),
        ext =
          b.type === "audio/mpeg"
            ? "mp3"
            : b.type === "audio/wav"
              ? "wav"
              : null;
      if (
        !b.consent ||
        !ext ||
        !Number.isInteger(b.bytes) ||
        b.bytes < 10000 ||
        b.bytes > 12000000
      )
        return (
          send(res, 400, {
            error: "Confirm consent and select MP3/WAV under 12 MB",
          }),
          true
        );
      const store = local ? null : storage();
      if (!local && !store)
        return (send(res, 503, { error: "Audio storage unavailable" }), true);
      const key =
        "voice-profiles/" + user.id + "/" + crypto.randomUUID() + "." + ext;
      if (local)
        return (send(res, 200, await local.prepare(user.id, key, b)), true);
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        await db.query("SELECT id FROM creators WHERE id=$1 FOR UPDATE", [
          user.id,
        ]);
        const current = (
          await db.query(
            "SELECT status FROM artist_voice_profiles WHERE creator_id=$1",
            [user.id],
          )
        ).rows[0];
        if (
          ["training", "submitting", "verification_required", "ready"].includes(
            current?.status,
          )
        )
          throw Object.assign(
            Error(
              current.status === "ready"
                ? "Your saved voice profile is ready. Use it for your song; it has not been replaced."
                : "Your previous voice request is processing or needs verification. Check its status instead of resubmitting.",
            ),
            { status: 409 },
          );
        await db.query(
          "INSERT INTO artist_voice_profiles(creator_id,object_key,task_id,persona_id,status) VALUES($1,$2,NULL,NULL,'uploading') ON CONFLICT(creator_id) DO UPDATE SET object_key=$2,task_id=NULL,persona_id=NULL,status='uploading',updated_at=NOW()",
          [user.id, key],
        );
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        db.release();
      }
      // Same-origin transport keeps R2 credentials private and does not depend
      // on a bucket's browser CORS settings. The original R2 signer is reused.
      return (
        send(res, 200, {
          url:
            "/api/voice/sample?reference=" +
            key.split("/").at(-1).split(".")[0],
        }),
        true
      );
    }
    if (p === "/api/voice/sample" && req.method === "PUT") {
      const reference = new URL(
        req.url,
        "https://lae-music.com",
      ).searchParams.get("reference");
      if (local || !/^[a-f0-9-]{36}$/.test(reference || ""))
        return (
          send(res, 400, { error: "Invalid voice sample reference" }),
          true
        );
      const mime = String(req.headers["content-type"] || "").split(";")[0];
      if (!["audio/wav", "audio/mpeg"].includes(mime))
        return (
          send(res, 400, { error: "Select an MP3 or WAV voice sample." }),
          true
        );
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 12000000)
          throw Object.assign(Error("Voice sample exceeds 12 MB."), {
            status: 413,
          });
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (
        size < 10000 ||
        !require("./lib/review-voice").validAudio(bytes, mime)
      )
        return (
          send(res, 400, {
            error:
              "Use a valid MP3 or WAV sample. WAV recordings must contain at least ten seconds of audio.",
          }),
          true
        );
      const store = storage();
      if (!store)
        return (
          send(res, 503, {
            error: "Audio storage unavailable. Your local sample is kept.",
          }),
          true
        );
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        await db.query("SELECT id FROM creators WHERE id=$1 FOR UPDATE", [
          user.id,
        ]);
        const x = (
          await db.query(
            "SELECT object_key,status FROM artist_voice_profiles WHERE creator_id=$1",
            [user.id],
          )
        ).rows[0];
        const ext = mime === "audio/wav" ? "wav" : "mp3";
        if (
          !x ||
          x.status !== "uploading" ||
          x.object_key !==
            "voice-profiles/" + user.id + "/" + reference + "." + ext
        )
          throw Object.assign(
            Error(
              "This voice upload is no longer active for your account. Check your voice profile.",
            ),
            { status: 409 },
          );
        const response = await fetch(
          await presign(store, x.object_key, "put", 300),
          {
            method: "PUT",
            headers: { "Content-Type": mime },
            body: bytes,
            signal: AbortSignal.timeout(45000),
          },
        );
        if (!response.ok)
          throw Object.assign(
            Error(
              "Voice storage could not save the sample. Retry saving; training was not started.",
            ),
            { status: 502 },
          );
        const stored = await headObject(store, x.object_key);
        if (stored.ContentLength !== size)
          throw Object.assign(
            Error(
              "Voice storage verification failed. Training was not started.",
            ),
            { status: 502 },
          );
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        db.release();
      }
      return (send(res, 200, { saved: true }), true);
    }
    if (p === "/api/voice/train" && req.method === "POST") {
      if (!process.env.MUSICAPI_API_KEY)
        return (
          send(res, 503, { error: "Music provider is not configured" }),
          true
        );
      if (local) await require("./lib/review-voice").init(pool);
      const db = await pool.connect();
      let x, reference, store;
      try {
        await db.query("BEGIN");
        await db.query("SELECT id FROM creators WHERE id=$1 FOR UPDATE", [
          user.id,
        ]);
        if(!local)await require('./lib/artist-access').requirePackage(db,user.id,process.env,{lock:true});
        x = (
          await db.query(
            "SELECT object_key,task_id,persona_id,status FROM artist_voice_profiles WHERE creator_id=$1",
            [user.id],
          )
        ).rows[0];
        if (x && ["training", "ready"].includes(x.status)) {
          await db.query("COMMIT");
          return (
            send(res, 200, {
              status: x.status,
              hasVoice: x.status === "ready",
            }),
            true
          );
        }
        if (!x || x.status !== "uploading")
          throw Object.assign(
            Error(
              x
                ? "A previous voice request needs verification. Do not train it again."
                : "Upload your voice sample first.",
            ),
            { status: 409 },
          );
        store = local ? null : storage();
        if (!local && !store)
          throw Object.assign(Error("Audio storage unavailable"), {
            status: 503,
          });
        const info = local
          ? await local.head(x.object_key)
          : await headObject(store, x.object_key);
        if (
          !Number.isSafeInteger(info.ContentLength) ||
          info.ContentLength < 10000 ||
          info.ContentLength > 12000000
        )
          throw Object.assign(
            Error("Voice sample must be valid MP3/WAV under 12 MB"),
            { status: 400 },
          );
        reference = "voice-" + crypto.randomUUID();
        if (local) {
          const count = (
            await db.query(
              "SELECT COUNT(*)::int AS used FROM review_voice_attempts WHERE artist_id=$1 AND status<>'failed'",
              [user.id],
            )
          ).rows[0].used;
          if (count >= 2)
            throw Object.assign(
              Error(
                "Your two free voice training tests have been reserved or used.",
              ),
              { status: 402 },
            );
          await db.query(
            "INSERT INTO review_voice_attempts(reference,artist_id,status) VALUES($1,$2,'submitting')",
            [reference, user.id],
          );
        }
        await db.query(
          "UPDATE artist_voice_profiles SET task_id=$1,status='submitting',updated_at=NOW() WHERE creator_id=$2",
          [reference, user.id],
        );
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        db.release();
      }
      let audio_url;
      try {
        audio_url = local
          ? await local.readURL(x.object_key)
          : await presign(store, x.object_key, "get", 7200);
        if (local)
          require("./lib/review-testing").authorizeProvider(
            user.id,
            reference,
            "musicapi",
          );
      } catch (error) {
        await pool.query(
          "UPDATE artist_voice_profiles SET status='uploading',task_id=NULL WHERE creator_id=$1 AND task_id=$2",
          [user.id, reference],
        );
        if (local)
          await pool.query(
            "UPDATE review_voice_attempts SET status='failed' WHERE reference=$1 AND artist_id=$2",
            [reference, user.id],
          );
        throw error;
      }
      let response, j;
      try {
        response = await fetch(
          "https://api.musicapi.ai/api/v1/sonic/create-voice",
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + process.env.MUSICAPI_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ audio_url }),
            signal: AbortSignal.timeout(45000),
          },
        );
        j = await response.json();
      } catch {
        await pool.query(
          "UPDATE artist_voice_profiles SET status='verification_required' WHERE creator_id=$1 AND task_id=$2",
          [user.id, reference],
        );
        return (
          send(res, 503, {
            status: "verification_required",
            error:
              "The provider response was interrupted. Keep this voice request reserved for verification; do not resubmit.",
          }),
          true
        );
      }
      const task = String(j.task_id || j.data?.task_id || "");
      if (
        !response.ok ||
        (j.code && Number(j.code) !== 200) ||
        !/^[a-zA-Z0-9_-]{8,128}$/.test(task)
      ) {
        const definitive =
          response.headers?.get?.("x-lae-review-rejected") ===
            "before-provider" ||
          (!response.ok &&
            response.status < 500 &&
            ![408, 409, 425].includes(response.status));
        await pool.query(
          "UPDATE artist_voice_profiles SET status=$3 WHERE creator_id=$1 AND task_id=$2",
          [
            user.id,
            reference,
            definitive ? "uploading" : "verification_required",
          ],
        );
        if (local && definitive)
          await pool.query(
            "UPDATE review_voice_attempts SET status='failed' WHERE reference=$1 AND artist_id=$2",
            [reference, user.id],
          );
        return (
          send(res, definitive ? 502 : 503, {
            status: definitive ? "rejected" : "verification_required",
            error: definitive
              ? "Voice provider rejected the sample. Check that it contains clear solo vocals in MP3 or WAV format. No song-generation credit was consumed."
              : "Voice provider acceptance needs verification. Do not submit training again.",
          }),
          true
        );
      }
      await pool.query(
        "UPDATE artist_voice_profiles SET task_id=$1,status='training',updated_at=NOW() WHERE creator_id=$2 AND task_id=$3",
        [task, user.id, reference],
      );
      if (local)
        await pool.query(
          "UPDATE review_voice_attempts SET task_id=$2,status='training' WHERE reference=$1",
          [reference, task],
        );
      return (send(res, 200, { status: "training" }), true);
    }
    if (p === "/api/voice/status" && req.method === "GET") {
      const x = await get();
      if (!x) return (send(res, 404, { error: "No voice sample found" }), true);
      if (x.status === "training" && x.task_id) {
        const response = await fetch(
          "https://api.musicapi.ai/api/v1/sonic/task/" +
            encodeURIComponent(x.task_id),
          {
            headers: {
              Authorization: "Bearer " + process.env.MUSICAPI_API_KEY,
            },
            signal: AbortSignal.timeout(30000),
          },
        );
        const j = await response.json();
        if (!response.ok || (j.code && Number(j.code) !== 200))
          return (
            send(res, 502, {
              error:
                "Voice provider status is temporarily unavailable. Your voice request is preserved.",
            }),
            true
          );
        const id = j.data?.persona_id || j.persona_id;
        if (id) {
          await pool.query(
            "UPDATE artist_voice_profiles SET persona_id=$1,status='ready' WHERE creator_id=$2",
            [id, user.id],
          );
          if (local)
            await pool.query(
              "UPDATE review_voice_attempts SET status='ready' WHERE task_id=$1 AND artist_id=$2",
              [x.task_id, user.id],
            );
          x.status = "ready";
        } else if (j.type === "failed" || j.status === "failed") {
          await pool.query(
            "UPDATE artist_voice_profiles SET status='failed' WHERE creator_id=$1",
            [user.id],
          );
          if (local)
            await pool.query(
              "UPDATE review_voice_attempts SET status='failed' WHERE task_id=$1 AND artist_id=$2",
              [x.task_id, user.id],
            );
          x.status = "failed";
        }
      }
      return (
        send(res, 200, { status: x.status, hasVoice: x.status === "ready" }),
        true
      );
    }
    return (send(res, 404, { error: "Voice route unavailable" }), true);
  } catch (e) {
    console.error("Voice profile request failed", e.status || 502);
    return (
      send(res, e.status || 502, {
        error: e.status
          ? e.message
          : "Voice service is temporarily unavailable. Your existing profile has been preserved.",
      }),
      true
    );
  }
};
