"use strict";
const { fail } = require("./transactions");
function currency(value = "USD") {
  if (!["USD", "NGN"].includes(value))
    throw fail(400, "Choose USD accounting or the separate legacy NGN book.");
  return value;
}
// Existing NGN account identifiers are historical evidence and must not be renamed.
function platform(name, mode, book) {
  currency(book);
  return (
    "platform:premium_" + name + ":" + mode + (book === "USD" ? ":USD" : "")
  );
}
function undistributed(mode, book) {
  currency(book);
  return (
    "platform:royalty_undistributed:" + mode + (book === "USD" ? ":USD" : "")
  );
}
module.exports = { currency, platform, undistributed };
