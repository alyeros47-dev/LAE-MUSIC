"use strict";
// Runs existing application handlers with isolated quota/DB/provider fixtures only.
const fs = require("node:fs"),
  path = require("node:path");
const dna = require("../lib/music-dna");
const { handler } = require("./lyrics-handler-fixture.cjs");
function fixture(context) {
  const group = context.style_id.split("-")[0].toLowerCase();
  return require("./music-dna-" + group + "-output.cjs")[group + "Output"](
    context,
  );
}
async function adapters() {
  const load = (p) =>
    import(
      "data:text/javascript;base64," + fs.readFileSync(p).toString("base64")
    );
  return load("web/studio-engine.js");
}
function sonicFixture() {
  const source = fs.readFileSync("scripts/test-sonic-handler.cjs", "utf8");
  const prefix = source.slice(0, source.indexOf("(async()=>{"));
  const start = source.indexOf(" const preflight="),
    end = source.indexOf(" x=await run(", start);
  return new Function(
    "require",
    prefix + source.slice(start, end) + ";return {run,preflight,reserve};",
  )(require);
}
async function lyricFlow(
  id,
  {
    voice = "neutral",
    languages = ["en"],
    requestKey = "qa-dna-final-audit-request-0001",
  } = {},
) {
  const ui = await adapters(),
    payload = ui.lyricsRequest({
      musicDnaStyle: id,
      musicDnaLanguages: languages,
      voice,
      lyricsModel: "gpt-6.1-sol",
      duration: "3 minutes",
      idea: "An original song about finding hope through friendship",
      mood: "stale unrelated mood",
      beat: "stale unrelated percussion",
    });
  const actor = { artistId: 7, requestKey },
    context = dna.prepare(payload, actor),
    response = fixture(context);
  const flow = await handler({
    payload,
    engine: dna,
    actor,
    response,
    voiceReady: voice === "custom",
  });
  return { payload, context, response, ...flow };
}
async function sonicFlow(song) {
  const { run, preflight, reserve } = sonicFixture();
  let sent;
  const r = await run({
    method: "POST",
    path: "/api/music/sonic/create",
    requestBody: JSON.stringify(song),
    queries: preflight().concat(
      song.useVoice
        ? [
            {
              match: "SELECT persona_id FROM artist_voice_profiles",
              result: {
                rowCount: 1,
                rows: [{ persona_id: "owned-audit-persona" }],
              },
            },
          ]
        : [],
    ),
    transactions: reserve().concat([
      { match: "BEGIN" },
      {
        match: "UPDATE sonic_test_tasks",
        result: { rowCount: 1, rows: [{ task_id: "provider_audit_123456" }] },
      },
      {
        match: "UPDATE artist_studio_usage",
        result: { rowCount: 1, rows: [{ id: 1 }] },
      },
      { match: "COMMIT" },
    ]),
    fetchImpl: async (_url, o) => {
      sent = JSON.parse(o.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ task_id: "provider_audit_123456" }),
      };
    },
  });
  return { ...r, sent };
}
module.exports = { fixture, adapters, lyricFlow, sonicFlow };
