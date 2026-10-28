"use strict";
// Configuration availability is distinct from end-to-end provider verification.
function capabilities(env = process.env) {
  const provider = !!env.MUSICAPI_API_KEY;
  const temporary = require("./review-voice").enabled(env);
  const configured = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ].every((key) => !!env[key]);
  const store =
    configured &&
    require("./review-storage").configuration(
      {
        account: env.R2_ACCOUNT_ID,
        key: env.R2_ACCESS_KEY_ID,
        secret: env.R2_SECRET_ACCESS_KEY,
        bucket: env.R2_BUCKET,
      },
      env,
    );
  return {
    voice_upload_available: provider && !!(temporary || store),
    voice_upload_verified: provider && temporary,
    voice_capability:
      !provider || !(temporary || store)
        ? "unavailable"
        : temporary
          ? "sandbox_testing"
          : "configured",
  };
}
module.exports = { capabilities };
