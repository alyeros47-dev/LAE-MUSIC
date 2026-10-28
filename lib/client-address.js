"use strict";
const { isIP, BlockList } = require("node:net");
function normalizeIP(value) {
  if (typeof value !== "string" || value.length > 100 || value.includes("%"))
    return null;
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6) return null;
  const normalized = new URL("http://[" + value + "]/").hostname
      .slice(1, -1)
      .toLowerCase(),
    mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
  if (mapped) {
    const n = BigInt("0x" + mapped[1]) * 65536n + BigInt("0x" + mapped[2]);
    return [24n, 16n, 8n, 0n]
      .map((shift) => String((n >> shift) & 255n))
      .join(".");
  }
  return normalized;
}
function createAddressResolver(raw = "") {
  const list = new BlockList();
  let entries = 0,
    invalid = false;
  try {
    if (typeof raw !== "string" || raw.length > 4000) throw Error();
    const values = raw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (values.length > 32) throw Error();
    for (const value of values) {
      const parts = value.split("/"),
        ip = normalizeIP(parts[0]),
        family = isIP(ip || "");
      if (!family || parts.length > 2) throw Error();
      const prefix =
        parts.length === 1 ? (family === 4 ? 32 : 128) : Number(parts[1]);
      if (
        !/^\d+$/.test(parts[1] || String(prefix)) ||
        !Number.isSafeInteger(prefix) ||
        prefix < 1 ||
        prefix > (family === 4 ? 32 : 128)
      )
        throw Error();
      list.addSubnet(ip, prefix, family === 4 ? "ipv4" : "ipv6");
      entries++;
    }
  } catch {
    invalid = true;
    entries = 0;
  }
  const trusted = (ip) =>
    !invalid &&
    entries > 0 &&
    !!ip &&
    list.check(ip, isIP(ip) === 4 ? "ipv4" : "ipv6");
  return {
    status: () => ({
      state: invalid ? "invalid" : entries ? "configured" : "socket_only",
      trusted_proxy_ranges: entries,
      forwarded_header: "X-Forwarded-For",
      other_client_headers_ignored: true,
    }),
    resolve(req) {
      const peer = normalizeIP(req.socket?.remoteAddress),
        fallback = { address: peer || "unavailable", source: "socket" };
      if (!peer || !trusted(peer)) return fallback;
      const header = req.headers?.["x-forwarded-for"];
      if (typeof header !== "string" || header.length > 2048)
        return { ...fallback, source: "invalid_forwarded" };
      const chain = header.split(",").map((x) => normalizeIP(x.trim()));
      if (!chain.length || chain.length > 16 || chain.some((x) => !x))
        return { ...fallback, source: "invalid_forwarded" };
      // Walk from the authenticated TCP peer toward the client. Never trust the leftmost value blindly.
      for (let i = chain.length - 1; i >= 0; i--)
        if (!trusted(chain[i]))
          return { address: chain[i], source: "trusted_forwarded" };
      return { ...fallback, source: "invalid_forwarded" };
    },
  };
}
module.exports = { normalizeIP, createAddressResolver };
