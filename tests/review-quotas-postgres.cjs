"use strict";
// Runs INSIDE the disposable local review container, never against an external DB.
const assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  fs = require("node:fs");
if (process.env.LAE_REVIEW_QUOTA_TESTS !== "1")
  throw Error("Explicit disposable-container opt-in required");
const { Pool } = require("pg"),
  credits = require("../lib/credits"),
  review = require("../lib/review-testing"),
  { transaction } = require("../lib/transactions");
const pool = new Pool({
  connectionString:
    "postgres://postgres:" +
    fs.readFileSync("/tmp/lae-review-password", "utf8").trim() +
    "@127.0.0.1:55432/lae_music_review",
});
(async () => {
  const identity = (
    await pool.query(
      "SELECT current_database() AS name,host(inet_server_addr()) AS host,inet_server_port() AS port",
    )
  ).rows[0];
  assert.equal(identity.name, "lae_music_review");
  assert.equal(identity.host, "127.0.0.1");
  assert.equal(identity.port, 55432);
  const artists = [];
  for (let i = 0; i < 2; i++) {
    const password = crypto.randomBytes(24).toString("hex");
    const r = await fetch("http://127.0.0.1:10000/api/register", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:10000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Quota test",
        email: crypto.randomUUID() + "@ci.invalid",
        country: "Nigeria",
        plan: "starter",
        password,
        confirmPassword: password,
      }),
    });
    assert.equal(r.status, 201);
    const cookie = r.headers.get("set-cookie").split(";")[0];
    const session = await (
      await fetch("http://127.0.0.1:10000/api/platform/session", {
        headers: { Cookie: cookie },
      })
    ).json();
    artists.push(session.artist.id);
    for (let n = 0; n < 2; n++) {
      const wallet = await (
        await fetch("http://127.0.0.1:10000/api/generation/wallet", {
          headers: { Cookie: cookie },
        })
      ).json();
      assert.equal(wallet.credits, 2);
    }
  }
  for (const id of artists) {
    const keys = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ];
    const results = await Promise.all(
      keys.map((k) =>
        credits
          .reserveLyrics(
            pool,
            id,
            k,
            { idea: "Original QA instructions" },
            { reviewTrial: true },
          )
          .then(
            (value) => ({ value }),
            (error) => ({ error }),
          ),
      ),
    );
    assert.equal(results.filter((x) => x.value).length, 2);
    assert.equal(results.filter((x) => x.error?.status === 402).length, 1);
    const index = results.findIndex((x) => x.value),
      ref = results[index].value.reference;
    await assert.rejects(
      credits.reserveLyrics(
        pool,
        id,
        keys[index],
        { idea: "Original QA instructions" },
        { reviewTrial: true },
      ),
      (e) => e.status === 409,
    );
    await Promise.all([
      credits.refundLyrics(pool, id, ref, keys[index], { reviewTrial: true }),
      credits.refundLyrics(pool, id, ref, keys[index], { reviewTrial: true }),
    ]);
    assert.equal(await review.lyricsRemaining(pool, id), 1);
    assert.equal(
      (
        await pool.query(
          "SELECT credits FROM generation_wallets WHERE creator_id=$1",
          [id],
        )
      ).rows[0].credits,
      1,
    );
    const reserve = (ref) =>
      transaction(pool, async (db) => {
        await db.query("SELECT id FROM creators WHERE id=$1 FOR UPDATE", [id]);
        await review.reserve(db, id, ref);
      });
    const audio = await Promise.all(
      [1, 2, 3].map(() =>
        reserve("sonic-" + crypto.randomBytes(16).toString("hex")).then(
          () => true,
          (e) => e.status,
        ),
      ),
    );
    assert.equal(audio.filter((x) => x === true).length, 2);
    assert.equal(audio.filter((x) => x === 402).length, 1);
  }
  assert.equal(
    (
      await pool.query(
        "SELECT COUNT(*)::int AS n FROM artist_subscriptions WHERE artist_id=ANY($1::bigint[])",
        [artists],
      )
    ).rows[0].n,
    0,
  );
  console.log(
    "PASS: real PostgreSQL two-artist free quotas, concurrent third-request rejection, idempotent retries, once-only failed-lyrics restoration, no paid subscriptions. Provider calls: 0.",
  );
})()
  .catch((e) => {
    console.error("Quota integration check failed:", e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
