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
  await t.test(
    "all supplied G1 profiles retain owned immutable provenance and the existing upload-code/credit contract",
    async () => {
      const a = (
        await pool.query(
          "INSERT INTO creators(display_name,email,password_salt,password_hash,plan,membership_status) VALUES('G1 isolated QA',$1,'qa-salt','qa-hash','starter','pending_payment') RETURNING id",
          ["g1-" + crypto.randomUUID() + "@test.invalid"],
        )
      ).rows[0];
      await pool.query(
        "INSERT INTO generation_wallets(creator_id,credits) VALUES($1,5)",
        [a.id],
      );
      const profiles = dna.catalogue().styles;
      assert.equal(profiles.length, 5);
      for (const profile of profiles) {
        const key = crypto.randomUUID(),
          payload = {
            musicDnaStyle: profile.id,
            musicDnaLanguages: ["en", "yo"],
            voice: "female",
          },
          context = dna.prepare(payload, { artistId: a.id, requestKey: key });
        const reservation = await credits.reserveLyrics(
          pool,
          a.id,
          key,
          payload,
        );
        const candidate = require("./music-dna-g1-output.cjs").g1Output(
          context,
        );
        candidate.title = profile.name;
        candidate.lyrics =
          "Original isolated G1 lyrics " +
          profile.id +
          " " +
          crypto.randomUUID() +
          " with a complete ending.";
        dna.validateOutput(candidate, context);
        const complete = await credits.completeLyrics(
          pool,
          a.id,
          reservation.reference,
          key,
          {
            title: candidate.title,
            lyrics: candidate.lyrics,
            style: candidate.style,
            music_dna: context,
          },
          "gpt-6.1-sol",
        );
        assert(/^[A-F0-9]{36}$/.test(complete.uploadCode));
        assert.equal(
          (await credits.reserveLyrics(pool, a.id, key, payload)).replay
            .uploadCode,
          complete.uploadCode,
        );
        const row = (
          await pool.query(
            "SELECT d.*,g.code_hash FROM music_dna_generations d JOIN generation_records g ON g.id=d.generation_id WHERE d.artist_id=$1 AND d.style_id=$2",
            [a.id, profile.id],
          )
        ).rows[0];
        assert.equal(row.catalogue_revision, "music-dna-g1-v1");
        assert.equal(row.profile_snapshot.profile.id, profile.id);
        assert.deepEqual(row.languages, ["en", "yo"]);
        assert.equal(row.voice, "female");
        assert.equal(
          row.code_hash,
          crypto.createHash("sha256").update(complete.uploadCode).digest("hex"),
        );
        assert(
          !JSON.stringify(row.profile_snapshot).includes("research_references"),
        );
      }
      assert.equal(
        (
          await pool.query(
            "SELECT credits FROM generation_wallets WHERE creator_id=$1",
            [a.id],
          )
        ).rows[0].credits,
        0,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM generation_ledger WHERE creator_id=$1 AND reason='lyrics_generation'",
            [a.id],
          )
        ).rows[0].n,
        5,
      );
    },
  );
};
