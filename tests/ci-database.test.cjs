"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { Client } = require("pg"),
  { ciDatabase } = require("./ci-database.cjs");
test("CI database guard permits only explicit local disposable targets", () => {
  for (const protocol of ["postgres", "postgresql"])
    for (const hostname of ["localhost", "127.0.0.1"]) {
      const target = ciDatabase({
        LAE_DB_TESTS: "true",
        DATABASE_URL: `${protocol}://fixture:fixture@${hostname}:5432/lae_music_ci`,
      });
      const parsed = new Client({ connectionString: target.href })
        .connectionParameters;
      assert.equal(parsed.host, hostname);
      assert.equal(parsed.database, "lae_music_ci");
    }
});
test("CI database guard refuses pg host overrides and all ambiguous targets before connecting", () => {
  const base = "postgres://fixture:fixture-secret@127.0.0.1/lae_music_ci";
  // Demonstrate the real driver's override without opening a network connection.
  assert.equal(
    new Client({ connectionString: base + "?host=other-host.invalid" })
      .connectionParameters.host,
    "other-host.invalid",
  );
  for (const url of [
    "",
    "not-a-url",
    base + "?host=other-host.invalid",
    base + "?sslmode=disable",
    base + "?host=%2Ftmp",
    base + "#fragment",
    base.replace("postgres:", "https:"),
    base.replace("127.0.0.1", "production.invalid"),
    base.replace("lae_music_ci", "production"),
    base.replace("lae_music_ci", "lae_music_ci%00"),
    base.replace("127.0.0.1", "127.0.0.2"),
  ]) {
    assert.throws(
      () => ciDatabase({ LAE_DB_TESTS: "true", DATABASE_URL: url }),
      (error) =>
        error.message.startsWith("Refusing database tests") &&
        !error.message.includes("fixture-secret"),
    );
  }
  assert.throws(
    () => ciDatabase({ LAE_DB_TESTS: "false", DATABASE_URL: base }),
    /Refusing database tests/,
  );
});
