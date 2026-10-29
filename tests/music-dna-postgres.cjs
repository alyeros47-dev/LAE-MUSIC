"use strict";
// Real disposable PostgreSQL; synthetic catalogue, no provider, storage or production calls.
const assert = require("node:assert/strict"),
  crypto = require("node:crypto");
module.exports = async (t, { pool }) => {
  const credits = require("../lib/credits"),
    dna = require("../lib/music-dna"),
    e = dna.createEngine(require("./music-dna-fixture.cjs").catalogue());
  const artists = [];
  for (let i = 0; i < 2; i++) {
    const a = (
      await pool.query(
        "INSERT INTO creators(display_name,email,password_salt,password_hash,plan,membership_status) VALUES('DNA isolated QA',$1,'qa-salt','qa-hash','starter','pending_payment') RETURNING id",
        ["dna-" + crypto.randomUUID() + "@test.invalid"],
      )
    ).rows[0];
    artists.push(a.id);
    await pool.query(
      "INSERT INTO generation_wallets(creator_id,credits) VALUES($1,1)",
      [a.id],
    );
  }
  const keys = artists.map(() => crypto.randomUUID()),
    payload = {
      musicDnaStyle: "qa-restrained",
      musicDnaLanguages: ["en", "yo"],
      voice: "female",
    };
  const contexts = artists.map((artistId, i) =>
    e.prepare(payload, { artistId, requestKey: keys[i] }),
  );
  let reservations, winner;
  await t.test(
    "DNA uses the existing concurrent credit reservation and cannot reserve twice for a retry",
    async () => {
      reservations = await Promise.all(
        artists.map((id, i) =>
          credits.reserveLyrics(pool, id, keys[i], payload),
        ),
      );
      await assert.rejects(
        credits.reserveLyrics(pool, artists[0], keys[0], payload),
        (x) => x.status === 409,
      );
      assert.deepEqual(
        (
          await pool.query(
            "SELECT credits FROM generation_wallets WHERE creator_id=ANY($1::bigint[]) ORDER BY creator_id",
            [artists],
          )
        ).rows.map((r) => r.credits),
        [0, 0],
      );
    },
  );
  await t.test(
    "identical DNA lyrics across artists complete once; duplicate rollback and once-only refund preserve credits",
    async () => {
      const words =
        "Isolated original lyrical phrase " +
        crypto.randomUUID() +
        " ending in a complete sentence.";
      const results = await Promise.allSettled(
        artists.map((id, i) =>
          credits.completeLyrics(
            pool,
            id,
            reservations[i].reference,
            keys[i],
            {
              title: "DNA concurrency QA",
              lyrics: words,
              style: "Restrained instrumental QA",
              music_dna: contexts[i],
            },
            "gpt-6.1-sol",
          ),
        ),
      );
      assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
      assert.equal(
        results.filter(
          (x) => x.status === "rejected" && x.reason.status === 409,
        ).length,
        1,
      );
      winner = results.findIndex((x) => x.status === "fulfilled");
      const loser = 1 - winner;
      await Promise.all(
        [0, 1].map(() =>
          credits.refundLyrics(
            pool,
            artists[loser],
            reservations[loser].reference,
            keys[loser],
          ),
        ),
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM generation_records WHERE creator_id=ANY($1::bigint[])",
            [artists],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM music_dna_generations WHERE artist_id=ANY($1::bigint[])",
            [artists],
          )
        ).rows[0].n,
        1,
      );
      const balance = (
        await pool.query(
          "SELECT creator_id,credits FROM generation_wallets WHERE creator_id=ANY($1::bigint[])",
          [artists],
        )
      ).rows;
      assert.equal(
        balance.find((x) => String(x.creator_id) === String(artists[winner]))
          .credits,
        0,
      );
      assert.equal(
        balance.find((x) => String(x.creator_id) === String(artists[loser]))
          .credits,
        1,
      );
      const replay = await credits.reserveLyrics(
        pool,
        artists[winner],
        keys[winner],
        payload,
      );
      assert.equal(
        replay.replay.music_dna.variation_id,
        contexts[winner].variation_id,
      );
      assert(/^[A-F0-9]{36}$/.test(replay.replay.uploadCode));
      await assert.rejects(
        credits.reserveLyrics(pool, artists[winner], keys[winner], {
          ...payload,
          voice: "male",
        }),
        (x) => x.status === 409,
      );
    },
  );
  await t.test(
    "provenance is immutable, artist-owned, and never exposes fingerprints or another account history",
    async () => {
      await assert.rejects(
        pool.query(
          "UPDATE music_dna_generations SET voice='male' WHERE artist_id=$1",
          [artists[winner]],
        ),
      );
      const platform = require("../lib/platform").createPlatform({
          pool,
          me: async () => ({ id: artists[winner] }),
          listenerMe: async () => null,
          authAdmin: () => false,
          json: (res, status, data) => {
            res.status = status;
            res.data = data;
          },
        }),
        res = {};
      await platform.handler(
        { method: "GET", headers: {} },
        res,
        new URL(
          "https://qa.invalid/api/platform/studio/dna/history?artist_id=" +
            artists[1 - winner],
        ),
      );
      assert.equal(res.status, 200);
      assert.equal(res.data.records.length, 1);
      assert.equal(
        res.data.records[0].variation_id,
        contexts[winner].variation_id,
      );
      assert(!JSON.stringify(res.data).includes("lyrics_fingerprint"));
      assert(!JSON.stringify(res.data).includes("profile_snapshot"));
    },
  );
};
