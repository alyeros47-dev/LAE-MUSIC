"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { createBudget } = require("../deploy/review-provider-budget.cjs");
function fake() {
  let text = null,
    calls = 0;
  const fileSystem = {
    readFileSync() {
      if (text === null)
        throw Object.assign(Error("absent"), { code: "ENOENT" });
      return text;
    },
    writeFileSync(p, s, o) {
      assert.equal(o.mode, 0o600);
      text = s;
    },
  };
  const make = () =>
    createBudget({
      fetchImpl: async () => {
        calls++;
        return new Response("{}");
      },
      fileSystem,
    });
  return {
    make,
    get calls() {
      return calls;
    },
    set text(s) {
      text = s;
    },
    get text() {
      return text;
    },
  };
}
test("two sandbox lyrics calls are allowed and the third never reaches the shared provider", async () => {
  const f = fake(),
    call = f.make();
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await call("https://api.openai.com/v1/chat/completions", {
          method: "POST",
        })
      ).status,
      200,
    );
  assert.equal(
    (await call("https://api.openai.com/v1/responses", { method: "POST" }))
      .status,
    429,
  );
  assert.equal(f.calls, 2);
});
test("one charged music or voice operation is allowed per temporary review instance", async () => {
  const f = fake(),
    call = f.make();
  assert.equal(
    (
      await call("https://api.musicapi.ai/api/v1/sonic/create-voice", {
        method: "POST",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("https://api.musicapi.ai/api/v1/sonic/create", {
        method: "POST",
      })
    ).status,
    429,
  );
  assert.equal(f.calls, 1);
});
test("read-only provider polling and account verification do not spend the test allowance", async () => {
  const f = fake(),
    call = f.make();
  for (let i = 0; i < 4; i++)
    assert.equal(
      (await call("https://api.musicapi.ai/api/v1/get-credits")).status,
      200,
    );
  assert.equal(f.text, null);
  assert.equal(f.calls, 4);
});
test("other destinations and R2 uploads are unaffected by the AI allowance", async () => {
  const f = fake(),
    call = f.make();
  assert.equal(
    (
      await call("https://account.r2.cloudflarestorage.com/review/song", {
        method: "PUT",
      })
    ).status,
    200,
  );
  assert.equal(f.text, null);
});
test("a process restart cannot reset an exhausted allowance while its counter file exists", async () => {
  const f = fake();
  await f.make()("https://api.musicapi.ai/api/v1/sonic/create", {
    method: "POST",
  });
  assert.equal(
    (
      await f.make()("https://api.musicapi.ai/api/v1/sonic/create", {
        method: "POST",
      })
    ).status,
    429,
  );
  assert.equal(f.calls, 1);
});
test("corrupted counters fail closed and do not issue a provider request", async () => {
  const f = fake();
  f.text = "broken";
  assert.equal(
    (await f.make()("https://api.openai.com/v1/responses", { method: "POST" }))
      .status,
    429,
  );
  assert.equal(f.calls, 0);
});
test("failed external calls still consume the local safety allowance", async () => {
  let state = null,
    calls = 0;
  const call = createBudget({
    fileSystem: {
      readFileSync() {
        if (state === null)
          throw Object.assign(Error("absent"), { code: "ENOENT" });
        return state;
      },
      writeFileSync(p, value) {
        state = value;
      },
    },
    fetchImpl: async () => {
      calls++;
      throw Error("network");
    },
  });
  await assert.rejects(
    call("https://api.openai.com/v1/responses", { method: "POST" }),
    /network/,
  );
  await assert.rejects(
    call("https://api.openai.com/v1/responses", { method: "POST" }),
    /network/,
  );
  assert.equal(
    (await call("https://api.openai.com/v1/responses", { method: "POST" }))
      .status,
    429,
  );
  assert.equal(calls, 2);
});

test("open testing uses server reservations per artist, rejects replay across restart, and never bills voice or unauthenticated requests", async () => {
  let journal = null,
    network = 0,
    context = null;
  const fileSystem = {
    readFileSync() {
      if (journal === null) throw Object.assign(Error(), { code: "ENOENT" });
      return journal;
    },
    writeFileSync(p, s) {
      journal = s;
    },
  };
  const make = () =>
    createBudget({
      mode: "account",
      fileSystem,
      getContext: () => context,
      fetchImpl: async () => {
        network++;
        return new Response("{}");
      },
    });
  const call = make(),
    url = "https://api.musicapi.ai/api/v1/sonic/create",
    post = { method: "POST" };
  assert.equal((await call(url, post)).status, 503);
  assert.equal(network, 0);
  const refs = [];
  for (const artistId of ["1", "2"])
    for (let i = 0; i < 2; i++) {
      const reference =
        "sonic-" + require("node:crypto").randomBytes(16).toString("hex");
      refs.push(reference);
      context = { reviewProvider: { artistId, reference, kind: "musicapi" } };
      assert.equal((await call(url, post)).status, 200);
    }
  assert.equal(network, 4);
  context = {
    reviewProvider: { artistId: "1", reference: refs[0], kind: "musicapi" },
  };
  const duplicate = await make()(url, post);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.headers.get("x-lae-review-rejected"), null);
  assert.equal(network, 4);
  assert.equal(
    (await call("https://api.musicapi.ai/api/v1/sonic/create-voice", post))
      .status,
    503,
  );
  context = {
    reviewProvider: {
      artistId: "3",
      reference: require("node:crypto").randomUUID(),
      kind: "openai",
    },
  };
  assert.equal(
    (await call("https://api.openai.com/v1/responses", post)).status,
    200,
  );
  assert.equal(network, 5);
  journal = "broken";
  const denied = await call("https://api.openai.com/v1/responses", post);
  assert.equal(denied.status, 503);
  assert.equal(denied.headers.get("x-lae-review-rejected"), "before-provider");
  assert.equal(network, 5);
});
