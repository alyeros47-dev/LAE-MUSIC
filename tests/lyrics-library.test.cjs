"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { lyricsLibrary } = require("../lib/lyrics-library");
test("lyrics library returns only the signed-in artist drafts and no upload secrets", async () => {
  let called = 0;
  const r = await lyricsLibrary(
    {
      query: async (sql, params) => {
        called++;
        assert.match(sql, /WHERE creator_id=\$1 ORDER BY id DESC LIMIT 50/);
        assert.deepEqual(params, [7]);
        assert(!sql.includes("code_hash"));
        return {
          rows: [
            {
              id: 4,
              title: "Original",
              lyrics: "My original lyrics",
              style: "Highlife",
              model: "verified-model",
              code_hash: "never-return",
              creator_id: 99,
            },
          ],
        };
      },
    },
    7,
  );
  assert.equal(called, 1);
  assert.equal(r.records[0].lyrics, "My original lyrics");
  assert(!JSON.stringify(r).includes("never-return"));
  assert(!Object.hasOwn(r.records[0], "creator_id"));
});
test("lyrics library rejects missing database and invalid artist identity before reading records", async () => {
  await assert.rejects(lyricsLibrary(null, 7), (e) => e.status === 503);
  for (const id of [undefined, null, 0, -1, "7 OR true", ""])
    await assert.rejects(
      lyricsLibrary(
        {
          query: () => {
            throw Error("Must not query");
          },
        },
        id,
      ),
      (e) => e.status === 401,
    );
});
test("reopening saved lyrics is read-only and needs no generation credit", async () => {
  let reads = 0;
  const pool = {
    query: async (sql) => {
      assert(sql.startsWith("SELECT"));
      assert(!sql.includes("wallet"));
      reads++;
      return { rows: [] };
    },
  };
  assert.deepEqual(await lyricsLibrary(pool, 7), { records: [] });
  await lyricsLibrary(pool, 7);
  assert.equal(reads, 2);
});
