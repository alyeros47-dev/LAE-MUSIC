"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { signInAccount } = require("../lib/account-login");
test("generic sign-in finds an artist from the listener entry point without merging identities", async () => {
  const calls = [];
  const accounts = {
    login: async (role, email, password) => {
      calls.push(role);
      assert.equal(email, "artist@test.invalid");
      assert.equal(password, "Case Sensitive Password");
      if (role === "listener")
        throw Object.assign(Error("Incorrect email or password."), {
          status: 401,
        });
      return {
        token: "private-token",
        user: { id: 7, display_name: "Artist" },
      };
    },
  };
  const result = await signInAccount(
    accounts,
    {
      email: "artist@test.invalid",
      password: "Case Sensitive Password",
      role: "listener",
    },
    "phone",
    "test-ip",
  );
  assert.deepEqual(calls, ["listener", "artist"]);
  assert.equal(result.role, "artist");
  assert.equal(result.user.id, 7);
});
test("generic sign-in keeps the chosen verified identity when the email exists in both roles", async () => {
  const calls = [];
  const result = await signInAccount(
    {
      login: async (role) => {
        calls.push(role);
        return { user: { id: 99 }, token: "private" };
      },
    },
    { email: "shared@test.invalid", password: "valid", role: "partner" },
  );
  assert.deepEqual(calls, ["artist"]);
  assert.equal(result.role, "artist");
});
test("rate limits and operational failures never trigger fallback or get hidden as bad passwords", async () => {
  for (const status of [429, 503, 500]) {
    let calls = 0;
    await assert.rejects(
      signInAccount(
        {
          login: async () => {
            calls++;
            throw Object.assign(Error("Hold"), { status });
          },
        },
        { email: "a@b.invalid", password: "valid" },
      ),
      (e) => e.status === status,
    );
    assert.equal(calls, 1);
  }
});
test("incorrect credentials and malformed login never create a session", async () => {
  let calls = 0;
  const service = {
    login: async () => {
      calls++;
      throw Object.assign(Error("incorrect"), { status: 401 });
    },
  };
  await assert.rejects(
    signInAccount(service, { email: "a@b.invalid", password: "wrong" }),
    (e) => e.status === 401,
  );
  assert.equal(calls, 2);
  await assert.rejects(signInAccount(service, null), (e) => e.status === 401);
  assert.equal(calls, 2);
});
test("unified sign-in receives the same network login budget as artist sign-in", () => {
  const { requestPolicy } = require("../lib/request-policy");
  assert.equal(
    requestPolicy("POST", "/api/platform/account/login").id,
    "artist_login",
  );
});
