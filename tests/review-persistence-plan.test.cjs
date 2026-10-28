"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { prepare } = require("../scripts/prepare-review-persistence.cjs");
function fixture() {
  const calls = [],
    s = {
      id: "srv-dbfmk5ss728c73ded300",
      name: "lae-music-review-sandbox",
      type: "web_service",
      repo: "https://github.com/alyeros47-dev/LAE-MUSIC",
      branch: "codex/premium-platform-release",
      autoDeployTrigger: "off",
      serviceDetails: {
        plan: "free",
        url: "https://lae-music-review-sandbox.onrender.com",
      },
    },
    disks = [];
  return {
    calls,
    s,
    disks,
    fetchImpl: async (url, o) => {
      const p = new URL(url).pathname,
        c = o.body ? JSON.parse(o.body) : null;
      calls.push({ p, method: o.method, data: c });
      assert(!url.includes("production"));
      if (o.method === "PATCH") {
        assert(p.endsWith(s.id));
        assert.deepEqual(c, { serviceDetails: { plan: "starter" } });
        s.serviceDetails.plan = "starter";
      }
      if (o.method === "POST") {
        assert.equal(p, "/v1/disks");
        assert.equal(c.serviceId, s.id);
        const disk = { ...c, id: "dsk-fixture" };
        disks.push(disk);
        s.serviceDetails.disk = disk;
      }
      return new Response(
        JSON.stringify(p === "/v1/disks" ? disks.map((disk) => ({ disk })) : s),
      );
    },
  };
}
test("review storage plan is read-only unless a separate explicit cost approval is given", async () => {
  const f = fixture();
  const r = await prepare({ key: "mock-only", fetchImpl: f.fetchImpl });
  assert(r.dry_run);
  assert.equal(r.estimated_monthly_usd, 7.25);
  assert.equal(r.paid_mutations, 0);
  assert(f.calls.every((c) => c.method === "GET"));
  assert.equal(f.s.serviceDetails.plan, "free");
});
test("approved mock activation only upgrades the fixed sandbox and creates one fixed disk; retries do not double-charge", async () => {
  const f = fixture();
  const r = await prepare({
    key: "mock-only",
    approved: true,
    fetchImpl: f.fetchImpl,
  });
  assert.equal(r.paid_mutations, 2);
  assert(r.storage_attachment_verified);
  assert.equal(
    (
      await prepare({
        key: "mock-only",
        approved: true,
        fetchImpl: f.fetchImpl,
      })
    ).paid_mutations,
    0,
  );
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 1);
  assert(!f.calls.some((c) => /deploy|env-vars/.test(c.p)));
});
test("unexpected service or disk is refused rather than replaced", async () => {
  for (const change of ["service", "disk"]) {
    const f = fixture();
    if (change === "service") f.s.branch = "main";
    else
      f.disks.push({
        id: "dsk-unrelated",
        serviceId: f.s.id,
        name: "another-disk",
        mountPath: "/unrelated",
        sizeGB: 3,
      });
    await assert.rejects(
      prepare({ key: "mock-only", approved: true, fetchImpl: f.fetchImpl }),
    );
    assert(f.calls.every((c) => c.method === "GET"));
  }
});

test("paid activation workflow defaults to unchanged storage and gates payment and deployment separately", () => {
  const s = require("node:fs").readFileSync(
    ".github/workflows/review-integrations.yml",
    "utf8",
  );
  assert(s.includes("default: unchanged"));
  assert(s.includes("default: false"));
  assert(
    s.includes(
      '[ "$PERSISTENCE_MODE" = activate ] && [ "$OWNER_APPROVED" = true ]',
    ),
  );
  assert(s.includes("unset LAE_APPROVE_REVIEW_STORAGE_COST"));
  assert(
    s.includes(
      "inputs.persistence_mode == 'activate' && inputs.approve_monthly_charge == true",
    ),
  );
  assert(!/\n  (push|schedule):/.test(s));
});
