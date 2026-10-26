"use strict";
const { fail } = require("./transactions");
// Authenticate an existing identity; never merge records or grant another role.
async function signInAccount(accounts, input, userAgent, ip) {
  if (
    !input ||
    typeof input.email !== "string" ||
    typeof input.password !== "string"
  )
    throw fail(401, "Incorrect email or password.");
  const first = ["artist", "partner"].includes(input.role)
    ? "artist"
    : "listener";
  for (const role of [first, first === "artist" ? "listener" : "artist"]) {
    try {
      return {
        ...(await accounts.login(
          role,
          input.email,
          input.password,
          userAgent,
          ip,
        )),
        role,
      };
    } catch (error) {
      if (error.status !== 401) throw error;
    }
  }
  throw fail(
    401,
    "Incorrect email or password. Check your email and use the eye button to check your password.",
  );
}
module.exports = { signInAccount };
