"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const modulePromise = import(
  "data:text/javascript;base64," +
    fs.readFileSync("web/studio-workflow.js").toString("base64")
);
test("microphone capture produces real mono PCM WAV accepted by the original voice format contract", async () => {
  const { pcmWav } = await modulePromise;
  const data = new Float32Array(16000 * 15);
  data[0] = -2;
  data[1] = 2;
  const blob = pcmWav(data, 16000),
    bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(blob.type, "audio/wav");
  assert.equal(bytes.length, 44 + data.length * 2);
  assert.equal(bytes.subarray(0, 4).toString(), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString(), "WAVE");
  assert.equal(bytes.readUInt32LE(24), 16000);
  assert.equal(bytes.readUInt16LE(22), 1);
  assert.equal(bytes.readInt16LE(44), -32768);
  assert.equal(bytes.readInt16LE(46), 32767);
  assert.equal(bytes.subarray(12, 16).toString(), "fmt ");
  assert.equal(bytes.readUInt16LE(20), 1);
  assert.equal(bytes.subarray(36, 40).toString(), "data");
  assert.equal(bytes.readUInt32LE(40), data.length * 2);
  assert.throws(() => pcmWav(data, 0));
  assert.throws(() => pcmWav(new Float32Array(192000 * 40), 192000));
  assert.throws(() => pcmWav(new Float32Array(8000 * 61), 8000));
});
test("studio workflow is served by the actual application without a second backend", async () => {
  const { runtime } = require("./runtime.cjs");
  const app = await runtime();
  const r = await app.request("/web/studio-workflow.js");
  assert.equal(r.status, 200);
  assert(r.text.includes("export function bindStudioWorkflow"));
  assert.equal(r.text, fs.readFileSync("web/studio-workflow.js", "utf8"));
  assert(!r.text.includes("api.openai.com"));
  const shell = await app.request("/studio");
  assert.equal(shell.status, 200);
  assert(shell.headers["permissions-policy"].includes("microphone=(self)"));
  assert(shell.headers["permissions-policy"].includes("camera=()"));
});
