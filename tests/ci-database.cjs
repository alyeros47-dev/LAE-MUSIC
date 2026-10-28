"use strict";
function ciDatabase(env = process.env) {
  const refused = () =>
    Error(
      "Refusing database tests outside the explicit disposable local lae_music_ci database; URL options and fragments are forbidden.",
    );
  let target;
  try {
    target = new URL(env.DATABASE_URL || "");
  } catch {
    throw refused();
  }
  if (
    env.LAE_DB_TESTS !== "true" ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.pathname !== "/lae_music_ci" ||
    target.search ||
    target.hash
  )
    throw refused();
  return target;
}
module.exports = { ciDatabase };
