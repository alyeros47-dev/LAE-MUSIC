"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  { Readable } = require("node:stream");
const handler = require("../artist-voice"),
  { capabilities } = require("../lib/voice-capabilities");
const env = {
  MUSICAPI_API_KEY: "fixture",
  R2_ACCOUNT_ID: "a".repeat(32),
  R2_ACCESS_KEY_ID: "fixture",
  R2_SECRET_ACCESS_KEY: "fixture",
  R2_BUCKET: "existing-bucket",
};
test("production voice availability follows configured existing integrations without claiming a live upload was verified", () => {
  assert.deepEqual(capabilities(env), {
    voice_upload_available: true,
    voice_upload_verified: false,
    voice_capability: "configured",
  });
  for (const key of Object.keys(env))
    assert.equal(
      capabilities({ ...env, [key]: "" }).voice_upload_available,
      false,
    );
  assert.equal(
    capabilities({ ...env, LAE_REVIEW_R2_MODE: "scoped-temporary-v1" })
      .voice_upload_available,
    false,
  );
});
function fixture() {
  const profiles = new Map(),
    failures = new Map(),
    queries = [];
  let id = 7,
    authorized = true,
    origin = true,
    puts = 0,
    training = 0,
    stored = 0,
    rejectStorage = false,
    taskReply={persona_id:"owned_persona_fixture"},
    taskHttp=200,
    trainingReply=null;
  const pool = {
    async query(sql, args = []) {
      queries.push(sql);
      let rows = [];
      if(sql.includes("FROM artist_subscriptions"))rows=[{id:1,plan:"starter"}];
      if (
        sql.startsWith("SELECT") &&
        sql.includes("FROM artist_voice_profiles")
      )
        rows = profiles.has(args[0]) ? [{ ...profiles.get(args[0]) }] : [];
      if (sql.startsWith("INSERT INTO artist_voice_profiles"))
        profiles.set(args[0], { object_key: args[1], status: "uploading" });
      if (sql.includes("status='submitting'"))
        Object.assign(profiles.get(args[1]), {
          task_id: args[0],
          status: "submitting",
        });
      if (sql.includes("status='training'"))
        Object.assign(profiles.get(args[1]), {
          task_id: args[0],
          status: "training",
        });
      if (sql.includes("persona_id=$1,status='ready'"))
        Object.assign(profiles.get(args[1]), {
          persona_id: args[0],
          status: "ready",
        });
      if(sql.includes("SET status='failed'")){
        const profile=profiles.get(args[0]);
        if(profile?.task_id===args[1])profile.status='failed';
      }
      if(sql.startsWith('INSERT INTO platform_audit'))failures.set(args[0]+':'+args[1],JSON.parse(args[2]));
      if(sql.startsWith('SELECT details FROM platform_audit')){
        const details=failures.get(args[0]+':'+args[1]);rows=details?[{details}]:[];
      }
      return { rows, rowCount:rows.length };
    },
    async connect() {
      return { ...this, release() {} };
    },
  };
  const ctx = {
    pool,
    me: async () => (authorized ? { id } : null),
    validOrigin: () => origin,
    storage: () => ({ bucket: "existing-bucket" }),
    presign: async (_s, key, action) =>
      "https://storage.fixture/" + action + "/" + key,
    headObject: async () => ({
      ContentLength: stored,
      ContentType: "audio/wav",
    }),
  };
  async function request(path, method = "GET", data, headers = {}) {
    const req = Readable.from(
      data === undefined
        ? []
        : [Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data))],
    );
    req.url = path;
    req.method = method;
    req.headers = headers;
    const res = {
      writeHead(status) {
        this.status = status;
      },
      end(bytes) {
        this.data = JSON.parse(bytes);
      },
    };
    assert(
      await handler(req, res, new URL(path, "https://lae.test").pathname, ctx),
    );
    return res;
  }
  const fetcher = async (url, opt) => {
    if (url.startsWith("https://storage.fixture/put/")) {
      puts++;
      stored = opt.body.length;
      assert.match(url, /voice-profiles\/7\/[a-f0-9-]+\.wav$/);
      return new Response("", { status: rejectStorage ? 503 : 200 });
    }
    if (url.endsWith("/create-voice")) {
      training++;
      return Response.json(trainingReply||{ task_id: "voice_task_fixture_123" });
    }
    if (url.endsWith("/task/voice_task_fixture_123"))
      return typeof taskReply==='function'?taskReply():Response.json(taskReply,{status:taskHttp});
    throw Error("Unexpected upstream");
  };
  return {
    profiles,
    failures,
    set taskReply(value){taskReply=value;},
    set taskHttp(value){taskHttp=value;},
    set trainingReply(value){trainingReply=value;},
    queries,
    request,
    fetcher,
    get puts() {
      return puts;
    },
    get training() {
      return training;
    },
    set id(x) {
      id = x;
    },
    set authorized(x) {
      authorized = x;
    },
    set origin(x) {
      origin = x;
    },
    set rejectStorage(x) {
      rejectStorage = x;
    },
  };
}
async function withUpstream(f, fn) {
  const old = global.fetch,
    key = process.env.MUSICAPI_API_KEY;
  global.fetch = f.fetcher;
  process.env.MUSICAPI_API_KEY = "fixture-only";
  try {
    await fn();
  } finally {
    global.fetch = old;
    if (key === undefined) delete process.env.MUSICAPI_API_KEY;
    else process.env.MUSICAPI_API_KEY = key;
  }
}
async function audio() {
  const fs = require("node:fs");
  const { pcmWav } = await import(
    "data:text/javascript;base64," +
      fs.readFileSync("web/studio-workflow.js").toString("base64")
  );
  return Buffer.from(
    await pcmWav(new Float32Array(8000 * 15), 8000).arrayBuffer(),
  );
}
test("owned recorded WAV saves through existing R2 adapter, trains once, becomes selectable and survives a repeated request", async () => {
  const f = fixture(),
    bytes = await audio();
  await withUpstream(f, async () => {
    const prepared = await f.request("/api/voice/upload", "POST", {
      type: "audio/wav",
      bytes: bytes.length,
      consent: true,
    });
    assert.equal(prepared.status, 200);
    assert.match(prepared.data.url, /^\/api\/voice\/sample\?reference=/);
    f.id = 8;
    assert.equal(
      (
        await f.request(prepared.data.url, "PUT", bytes, {
          "content-type": "audio/wav",
        })
      ).status,
      409,
    );
    assert.equal(f.puts, 0);
    f.id = 7;
    assert.equal(
      (
        await f.request(prepared.data.url, "PUT", bytes, {
          "content-type": "audio/wav",
        })
      ).status,
      200,
    );
    assert.equal(f.puts, 1);
    assert.equal(
      (await f.request("/api/voice/train", "POST", {})).data.status,
      "training",
    );
    assert.equal(
      (await f.request("/api/voice/train", "POST", {})).data.status,
      "training",
    );
    assert.equal(f.training, 1);
    assert.equal(
      (
        await f.request("/api/voice/upload", "POST", {
          type: "audio/wav",
          bytes: bytes.length,
          consent: true,
        })
      ).status,
      409,
    );
    assert.deepEqual((await f.request("/api/voice/status")).data, {
      status: "ready",
      hasVoice: true,
    });
    const profile = { ...f.profiles.get(7) };
    assert.equal(
      (
        await f.request("/api/voice/upload", "POST", {
          type: "audio/wav",
          bytes: bytes.length,
          consent: true,
        })
      ).status,
      409,
    );
    assert.deepEqual(f.profiles.get(7), profile);
    assert.equal(
      (
        await f.request(prepared.data.url, "PUT", bytes, {
          "content-type": "audio/wav",
        })
      ).status,
      409,
    );
    assert.equal(f.puts, 1);
    assert.deepEqual((await f.request("/api/voice/profile")).data, {
      status: "ready",
      hasVoice: true,
    });
  });
});
test("voice saving rejects missing consent, foreign origins, inactive sessions, oversized or disguised files before storage or provider calls", async () => {
  const f = fixture();
  await withUpstream(f, async () => {
    const bytes = await audio();
    assert.equal(
      (
        await f.request("/api/voice/upload", "POST", {
          type: "audio/wav",
          bytes: bytes.length,
          consent: false,
        })
      ).status,
      400,
    );
    f.authorized = false;
    assert.equal(
      (await f.request("/api/voice/upload", "POST", {})).status,
      401,
    );
    f.authorized = true;
    f.origin = false;
    assert.equal(
      (
        await f.request(
          "/api/voice/sample?reference=" + "a".repeat(36),
          "PUT",
          bytes,
          { "content-type": "audio/wav" },
        )
      ).status,
      403,
    );
    f.origin = true;
    for (const bytes of [
      Buffer.from("<html>not audio</html>"),
      Buffer.alloc(12000001),
    ])
      assert(
        [400, 413].includes(
          (
            await f.request(
              "/api/voice/sample?reference=" + "a".repeat(36),
              "PUT",
              bytes,
              { "content-type": "audio/wav" },
            )
          ).status,
        ),
      );
    assert.equal(f.puts, 0);
    assert.equal(f.training, 0);
  });
});
test("failed R2 save preserves the upload and never starts provider training", async () => {
  const f = fixture(),
    bytes = await audio();
  await withUpstream(f, async () => {
    const prepared = await f.request("/api/voice/upload", "POST", {
      type: "audio/wav",
      bytes: bytes.length,
      consent: true,
    });
    f.rejectStorage = true;
    assert.equal(
      (
        await f.request(prepared.data.url, "PUT", bytes, {
          "content-type": "audio/wav",
        })
      ).status,
      502,
    );
    assert.equal(f.training, 0);
    assert.equal(f.profiles.get(7).status, "uploading");
  });
});

const verificationFailure={type:'failed',error:'didnt_say_verification_phrase',reason_code:'voice_verification_failed',retriable:false,data:{type:'api_error',message:'didnt_say_verification_phrase',retriable:false,refund_processed:true}};
test('actual verification-phrase rejection is explained, retained and blocks another paid training or destructive upload',async()=>{
 const f=fixture();f.profiles.set(7,{object_key:'voice-profiles/7/preserved-sample.wav',task_id:'voice_task_fixture_123',status:'training'});f.taskReply=verificationFailure;
 await withUpstream(f,async()=>{
  const first=await f.request('/api/voice/status');assert.equal(first.status,200);assert.equal(first.data.status,'failed');assert.equal(first.data.hasVoice,false);assert.equal(first.data.failure.code,'voice_verification_required');assert.equal(first.data.failure.retry_allowed,false);assert.equal(first.data.failure.provider_refund_processed,true);assert.match(first.data.failure.message,/separate spoken verification phrase/);
  const before={...f.profiles.get(7)};
  const second=await f.request('/api/voice/profile');assert.deepEqual(second.data.failure,first.data.failure);assert.equal(f.failures.size,1);
  const upload=await f.request('/api/voice/upload','POST',{type:'audio/wav',bytes:11520044,consent:true});assert.equal(upload.status,409);assert.equal(upload.data.code,'voice_verification_required');
  const train=await f.request('/api/voice/train','POST',{});assert.equal(train.status,409);assert.equal(train.data.code,'voice_verification_required');
  assert.deepEqual(f.profiles.get(7),before);assert.equal(f.training,0);assert.equal(f.puts,0);assert(!f.queries.some(q=>/generation_wallets|studio_purchased_credits/.test(q)));
 });
});
test('a previously failed profile recovers its reason through read-only existing-task lookup, without retraining',async()=>{
 const f=fixture();f.profiles.set(7,{object_key:'voice-profiles/7/preserved-sample.wav',task_id:'voice_task_fixture_123',status:'failed'});f.taskReply=verificationFailure;
 await withUpstream(f,async()=>{const r=await f.request('/api/voice/profile');assert.equal(r.data.failure.code,'voice_verification_required');assert.equal(f.training,0);assert.equal(f.failures.size,1);assert.equal(f.profiles.get(7).object_key,'voice-profiles/7/preserved-sample.wav');});
});
test('nested failure cannot be marked ready by a stale persona, while provider outages preserve training',async()=>{
 const f=fixture();f.profiles.set(7,{object_key:'voice-profiles/7/preserved-sample.wav',task_id:'voice_task_fixture_123',status:'training'});f.taskReply={status:'running',data:{status:'failed',message:'didnt_say_verification_phrase',persona_id:'stale_persona'}};
 await withUpstream(f,async()=>{const r=await f.request('/api/voice/status');assert.equal(r.data.status,'failed');assert.equal(r.data.hasVoice,false);});
 const g=fixture();g.profiles.set(7,{object_key:'voice-profiles/7/preserved-sample.wav',task_id:'voice_task_fixture_123',status:'training'});g.taskReply={error:'Temporary outage'};g.taskHttp=503;
 await withUpstream(g,async()=>{assert.equal((await g.request('/api/voice/status')).status,502);assert.equal(g.profiles.get(7).status,'training');assert.equal(g.failures.size,0);assert.equal(g.training,0);});
});
test('a slow poll cannot replace a newer task or newer saved recording',async()=>{
 const f=fixture();f.profiles.set(7,{object_key:'voice-profiles/7/original.wav',task_id:'voice_task_fixture_123',status:'training'});
 f.taskReply=()=>{f.profiles.set(7,{object_key:'voice-profiles/7/newer.wav',task_id:'newer_voice_task_123',status:'training'});return Response.json(verificationFailure);};
 await withUpstream(f,async()=>{const r=await f.request('/api/voice/status');assert.equal(r.data.status,'training');assert.equal(f.profiles.get(7).task_id,'newer_voice_task_123');assert.equal(f.failures.size,0);assert.equal(f.training,0);});
});
test('an immediate verification rejection is also retained and cannot be retried blindly',async()=>{
 const f=fixture(),bytes=await audio();f.trainingReply=verificationFailure;
 await withUpstream(f,async()=>{const upload=await f.request('/api/voice/upload','POST',{type:'audio/wav',bytes:bytes.length,consent:true});await f.request(upload.data.url,'PUT',bytes,{'content-type':'audio/wav'});const train=await f.request('/api/voice/train','POST',{});assert.equal(train.status,502);assert.equal(train.data.failure.code,'voice_verification_required');assert.equal(f.training,1);assert.equal((await f.request('/api/voice/train','POST',{})).status,409);assert.equal(f.training,1);});
});
