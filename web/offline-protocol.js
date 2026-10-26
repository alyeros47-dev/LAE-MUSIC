/* Shared protocol; no private keys, access tokens or audio are stored in the shell cache. */
(function (root) {
  "use strict";
  const LIMITS = Object.freeze({
    leaseMs: 86400000,
    syncMs: 172800000,
    maxBytes: 20971520,
    maxLibraryBytes: 262144000,
    maxSongs: 100,
    maxDevices: 3,
    maxBatch: 100,
    minListenMs: 30000,
  });
  function canonical(value) {
    if (
      value === null ||
      typeof value === "boolean" ||
      typeof value === "string"
    )
      return JSON.stringify(value);
    if (typeof value === "number" && Number.isSafeInteger(value))
      return String(value);
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && Object.prototype.toString.call(value) === "[object Object]")
      return (
        "{" +
        Object.keys(value)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
          .join(",") +
        "}"
      );
    throw Error("Invalid offline protocol value");
  }
  const api = {
    LIMITS,
    canonical,
    message: (device, nonce, action, payload) =>
      canonical({ v: 1, device_id: device, nonce, action, payload }),
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LaeOfflineProtocol = Object.freeze(api);
})(globalThis);
