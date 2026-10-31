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
  assert.throws(() => pcmWav(new Float32Array(8000 * 241), 8000));
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

test("four-minute microphone WAV keeps the complete recording below the existing upload ceiling", async () => {
 const {pcmWav,VOICE_RECORDING_SECONDS,VOICE_RECORDING_RATE}=await modulePromise;
 assert.equal(VOICE_RECORDING_SECONDS,240);assert.equal(VOICE_RECORDING_RATE,24000);
 const samples=new Float32Array(VOICE_RECORDING_SECONDS*VOICE_RECORDING_RATE);samples[samples.length-1]=0.5;
 const bytes=Buffer.from(await pcmWav(samples,VOICE_RECORDING_RATE).arrayBuffer());
 assert.equal(bytes.length,11520044);assert(bytes.length<12000000);assert.equal(bytes.readUInt32LE(40)/bytes.readUInt32LE(28),240);assert.equal(bytes.readInt16LE(bytes.length-2),16383);
 assert.throws(()=>pcmWav(new Float32Array(VOICE_RECORDING_RATE*241),VOICE_RECORDING_RATE));
});
