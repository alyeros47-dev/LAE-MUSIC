"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  p = require("../lib/premium-policy");
test("historical NGN pricing references, exact fixed durations and commissions preserve artist package terms", () => {
  for (const [code, minor, days] of [
    ["daily", 10000, 1],
    ["weekly", 30000, 7],
    ["monthly", 80000, 30],
    ["two_month", 160000, 60],
    ["annual", 780000, 365],
  ]) {
    assert.equal(p.referencePlan(code).minor, minor);
    assert.equal(p.referencePlan(code).days, days);
    assert.equal(p.referencePlan(code).currency, "NGN");
    assert.equal(p.percentage(minor, 10), minor / 10);
    assert.equal(p.percentage(minor, 5), minor / 20);
  }
  assert.equal(require("../lib/plans").professional.royalty, 60);
  assert.equal(require("../lib/plans").professional.directReferralPercent, 25);
  assert.equal(p.STREAM_ROYALTY_PERCENT, 50);
  assert.equal(
    require("../lib/commerce").quote("artist_subscription", "professional")
      .streaming_royalty_percent,
    50,
  );
  assert.throws(() => p.plan("free_trial"));
});
test("the approved revenue-pool example allocates exactly 50% by eligible artist share without fixed per-stream rates", () => {
  const net = p.netBasis({
      gross: 1000000000,
      tax: 0,
      fees: 20000000,
      commissions: 100000000,
    }),
    pool = Math.floor(net / 2);
  assert.equal(net, 880000000);
  assert.equal(pool, 440000000);
  assert.deepEqual(
    p.allocate(pool, [
      { id: "A", weight: 500000 },
      { id: "B", weight: 250000 },
      { id: "C", weight: 150000 },
      { id: "other", weight: 100000 },
    ]),
    [
      { id: "A", amount_minor: 220000000 },
      { id: "B", amount_minor: 110000000 },
      { id: "C", amount_minor: 66000000 },
      { id: "other", amount_minor: 44000000 },
    ],
  );
  assert.equal(pool / 100 / 1000000, 4.4);
});
test("365-day recognition telescopes across months including partial days and a leap year", () => {
  const start = new Date("2023-12-17T13:45:00Z"),
    end = new Date(start.getTime() + 365 * p.DAY);
  let total = 0;
  for (let n = 0; n < 14; n++) {
    const d = new Date(Date.UTC(2023, 11 + n, 1)),
      period = p.month(d.toISOString().slice(0, 7));
    total += p.recognize(780000, start, end, period);
  }
  assert.equal(total, 780000);
  assert.equal(
    p.recognize(
      10000,
      "2026-09-30T12:00:00Z",
      "2026-10-01T12:00:00Z",
      p.month("2026-09"),
    ),
    5000,
  );
  assert.equal(
    p.recognize(
      780000,
      "2026-09-01T00:00:00Z",
      "2027-09-01T00:00:00Z",
      p.month("2026-09"),
    ),
    Math.floor((780000 * 30) / 365),
  );
});
test("allocation handles zero streams, scarce minor units and deterministic rounding without exceeding the pool", () => {
  assert.deepEqual(p.allocate(100, []), []);
  for (let amount = 0; amount < 100; amount++) {
    const allocations = p.allocate(amount, [
      { id: "2", weight: 1 },
      { id: "1", weight: 1 },
      { id: "3", weight: 2 },
    ]);
    assert.equal(
      allocations.reduce((s, a) => s + a.amount_minor, 0),
      amount,
    );
    assert(allocations.every((a) => a.amount_minor >= 0));
  }
  assert.throws(() => p.netBasis({ gross: 100, refund: 100, tax: 0, fees: 1 }));
  assert.throws(() => p.month("2026-13"));
  assert.throws(() => p.minor(1.2));
  for (const value of [[], [100], {}, true, null, undefined, "1e2", "01"])
    assert.throws(() => p.minor(value));
  assert.equal(
    p.netBasis({ gross: "100", tax: "10", fees: "10", commissions: "5" }),
    75,
  );
  assert.throws(() =>
    p.allocate(10, [
      { id: "1", weight: 1 },
      { id: "1", weight: 2 },
    ]),
  );
});

function trackerFixture(api) {
  const fs = require("node:fs"),
    vm = require("node:vm"),
    events = {},
    timers = new Map();
  let timerId = 0,
    listener = { id: "7" };
  const audio = {
    paused: false,
    currentTime: 0,
    addEventListener() {},
    pause() {
      throw Error("Accounting must not pause playback");
    },
    play() {
      throw Error("Accounting must not control playback");
    },
  };
  const Tracker = vm.runInNewContext(
    fs
      .readFileSync(require.resolve("../web/premium.js"), "utf8")
      .replace(/^import .*?;\n/gm, "")
      .replace(/\bexport /g, "") + ";PremiumListeningTracker",
    {
      document: { addEventListener: (name, fn) => (events[name] = fn) },
      setInterval: (fn) => {
        timers.set(++timerId, fn);
        return timerId;
      },
      clearInterval: (id) => timers.delete(id),
      Intl,
      Date,
      URLSearchParams,
    },
  );
  const tracker = new Tracker({ api, audio, listener: () => listener });
  return {
    tracker,
    audio,
    timers,
    events,
    setListener: (value) => (listener = value),
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("activating Premium on the current listener starts accounting for the already playing track without controlling audio", async () => {
  const starts = [],
    beats = [];
  let active = false;
  const x = trackerFixture(async (path, method, input) => {
    if (path.endsWith("/playback")) {
      starts.push(input);
      return active
        ? { eligible: true, id: "ticket-active" }
        : { eligible: false };
    }
    beats.push(input);
    return { sequence: input.sequence, qualified: true };
  });
  x.tracker.refresh();
  x.events.trackchange({ detail: { id: "92" } });
  await flush();
  assert.equal(starts.length, 1);
  assert.equal(x.timers.size, 0);
  active = true;
  x.setListener({
    id: "7",
    premium: { id: "paid-term", expires_at: "2027-01-01" },
  });
  x.tracker.refresh();
  await flush();
  assert.equal(starts.length, 2);
  assert.equal(x.timers.size, 1);
  x.audio.currentTime = 30;
  await x.tracker.beat();
  assert.equal(beats.length, 1);
  assert.equal(beats[0].id, "ticket-active");
  assert.equal(x.timers.size, 0);
  x.setListener(null);
  x.tracker.refresh();
  assert.equal(x.tracker.ticket, null);
  assert.equal(x.audio.paused, false);
});
test("uncertain heartbeat retries the same sequence and stale start responses cannot replace a newer track", async () => {
  let resolveOld;
  const beats = [];
  const x = trackerFixture(async (path, method, input) => {
    if (path.endsWith("/playback"))
      return input.track_id === "1"
        ? await new Promise((resolve) => (resolveOld = resolve))
        : { eligible: true, id: "new-track" };
    beats.push(JSON.stringify(input));
    if (beats.length === 1) throw Error("Ambiguous network response");
    return { sequence: input.sequence, qualified: false };
  });
  x.events.trackchange({ detail: { id: "1" } });
  x.events.trackchange({ detail: { id: "2" } });
  await flush();
  resolveOld({ eligible: true, id: "old-track" });
  await flush();
  assert.equal(x.tracker.ticket.id, "new-track");
  x.audio.currentTime = 10;
  await x.tracker.beat();
  assert.equal(beats.length, 2);
  assert.equal(beats[0], beats[1]);
  assert.equal(x.tracker.ticket.sequence, 1);
  assert.equal(x.audio.paused, false);
});
