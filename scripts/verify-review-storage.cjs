"use strict";
const crypto = require("node:crypto");
const {
  configuration,
  ticket,
  signS3,
  BUCKET,
} = require("../lib/review-storage");
async function verifyStorage(
  environment,
  { source = {}, fetchImpl = fetch } = {},
) {
  const raw = {
    account: environment.R2_ACCOUNT_ID,
    key: environment.R2_ACCESS_KEY_ID,
    secret: environment.R2_SECRET_ACCESS_KEY,
    bucket: environment.R2_BUCKET,
  };
  if (raw.bucket !== BUCKET || raw.bucket === source.R2_BUCKET)
    return { verified: false, reason: "storage_isolation_required" };
  const config = configuration(raw, environment);
  if (!config) return { verified: false, reason: "storage_lease_invalid" };
  const key = "__lae_review_checks__/" + crypto.randomUUID() + ".wav";
  const body = Buffer.alloc(44 + 16000);
  body.write("RIFF");
  body.writeUInt32LE(body.length - 8, 4);
  body.write("WAVEfmt ", 8);
  body.writeUInt32LE(16, 16);
  body.writeUInt16LE(1, 20);
  body.writeUInt16LE(1, 22);
  body.writeUInt32LE(8000, 24);
  body.writeUInt32LE(16000, 28);
  body.writeUInt16LE(2, 32);
  body.writeUInt16LE(16, 34);
  body.write("data", 36);
  body.writeUInt32LE(16000, 40);
  const address = (action) =>
    config.reviewProxy
      ? ticket(config, key, action)
      : signS3(
          config,
          key,
          { get: "GET", put: "PUT", head: "HEAD" }[action],
          120,
        );
  let written = false;
  try {
    const put = await fetchImpl(address("put"), {
      method: "PUT",
      redirect: "error",
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(body.length),
      },
      body,
      signal: AbortSignal.timeout(30000),
    });
    if (!put.ok)
      return {
        verified: false,
        reason: "sandbox_upload_failed",
        http_status: put.status,
      };
    written = true;
    const head = await fetchImpl(address("head"), {
      method: "HEAD",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (
      !head.ok ||
      Number(head.headers.get("content-length")) !== body.length ||
      head.headers.get("content-type") !== "audio/wav"
    )
      return { verified: false, reason: "sandbox_head_failed" };
    const get = await fetchImpl(address("get"), {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!get.ok || !Buffer.from(await get.arrayBuffer()).equals(body))
      return { verified: false, reason: "sandbox_read_failed" };
    const range = await fetchImpl(address("get"), {
      headers: { Range: "bytes=0-43" },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (
      range.status !== 206 ||
      !Buffer.from(await range.arrayBuffer()).equals(body.subarray(0, 44))
    )
      return { verified: false, reason: "sandbox_range_failed" };
    return {
      verified: true,
      proxy: !!config.reviewProxy,
      upload_head_read_range_verified: true,
      credential_free_object_tickets: !!config.reviewProxy,
      test_audio_fixture: true,
      artist_upload_verified: false,
      music_generation_verified: false,
    };
  } catch {
    return { verified: false, reason: "sandbox_storage_transport_failed" };
  } finally {
    if (written) {
      const cleanup = config.reviewProxy
        ? {
            account: source.R2_ACCOUNT_ID,
            key: source.R2_ACCESS_KEY_ID,
            secret: source.R2_SECRET_ACCESS_KEY,
            bucket: BUCKET,
          }
        : config;
      try {
        const r = await fetchImpl(signS3(cleanup, key, "DELETE", 120), {
          method: "DELETE",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
        await r.body?.cancel();
      } catch {}
    }
  }
}
module.exports = { verifyStorage };
