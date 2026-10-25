"use strict";
const { fail } = require("./transactions");
const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    value,
  );
function evidence(value) {
  if (
    typeof value !== "string" ||
    value.trim().length < 10 ||
    value.length > 1000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    throw fail(400, "Record review evidence of 10–1000 characters.");
  return value.trim();
}
function mode(value) {
  if (!["test", "live"].includes(value))
    throw fail(400, "Choose test or live accounting records.");
  return value;
}
module.exports = { uuid, evidence, mode };
