"use strict";
// Executes the existing handler with mocked provider/quota services; never makes a paid request.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const dna = require("../lib/music-dna"),
  fixture = require("./music-dna-fixture.cjs");
const engine = () => dna.createEngine(fixture.catalogue());
const body = {
  musicDnaStyle: "qa-restrained",
  musicDnaLanguages: ["en", "yo"],
  voice: "neutral",
  idea: "An original account of finding hope",
};
const actor = { artistId: 7, requestKey: "qa-music-dna-request-0001" };
async function handler({
  payload = body,
  response,
  engine: providedEngine,
  actor: requestActor = actor,
  voiceReady = false,
  launchPolicy = false,
  transportError = false,
} = {}) {
  const src = fs.readFileSync("server.js", "utf8"),
    start = src.indexOf("if(p==='/api/music/lyrics-generate'"),
    end = src.indexOf("if(p===", start + 10);
  const Fn = Object.getPrototypeOf(async function () {}).constructor,
    load = require("node:module").createRequire(path.resolve("server.js"));
  const e = providedEngine || engine(),
    counts = { reserve: 0, complete: 0, refund: 0, post: 0 },
    context = response ? null : e.prepare(payload, requestActor);
  const selectedModel = payload.model || "gpt-6.1-sol";
  let request;
  const req = {
      method: "POST",
      headers: { "idempotency-key": requestActor.requestKey },
    },
    process = { env: { OPENAI_API_KEY: "qa-mocked-only" } };
  const run = new Fn(
    "req",
    "res",
    "p",
    "validOrigin",
    "process",
    "body",
    "authAdmin",
    "me",
    "pool",
    "json",
    "grantWelcomeCredits",
    "credits",
    "fetch",
    "AbortSignal",
    "ensureCoinTables",
    "require",
    src.slice(start, end),
  );
  let reserved;
  const result = await run(
    req,
    {},
    "/api/music/lyrics-generate",
    () => true,
    process,
    async () => ({
      ...payload,
      model: selectedModel,
      idea: payload.idea || body.idea,
      mood: "Party dance",
    }),
    () => false,
    async () => ({ id: requestActor.artistId }),
    {
      query: async (sql, args) => {
        assert(sql.includes("creator_id=$1"));
        assert.equal(String(args[0]), String(requestActor.artistId));
        return {
          rows: voiceReady ? [{ persona_id: "qa-owned-ready-profile" }] : [],
        };
      },
    },
    (_r, status, data) => ({ status, data }),
    async () => {},
    {
      reserveLyrics: async (_pool, _id, _key, b) => {
        counts.reserve++;
        reserved = b;
        return { reference: "qa-reservation" };
      },
      completeLyrics: async (_pool, _id, _ref, _key, out) => {
        counts.complete++;
        return out;
      },
      refundLyrics: async () => {
        counts.refund++;
      },
    },
    async (url, o) => {
      if (o.method === "GET") return Response.json({ id: selectedModel });
      counts.post++;
      request = JSON.parse(o.body);
      if (transportError) throw Error("ambiguous transport");
      return Response.json({
        output_text: JSON.stringify(response || fixture.output(context)),
      });
    },
    AbortSignal,
    async () => {},
    (name) => {
      if(name === "./lib/music-dna")return {...dna,...e};
      // Archived catalogue contracts use an explicitly injected synthetic engine.
      // Launch-policy tests opt into the real production gate separately.
      if(name === "./lib/studio-launch"&&!launchPolicy)return {assertStyle(id){if(id&&!e.catalogue().styles.some(s=>s.id===id))throw Object.assign(Error('Unavailable style'),{status:400});}};
      return load(name);
    },
  ).catch(error => ({status:error.status||500,data:{error:error.message}})); // Same HTTP error boundary as server.js.

  return { result, counts, request, reserved };
}

module.exports = { handler };
