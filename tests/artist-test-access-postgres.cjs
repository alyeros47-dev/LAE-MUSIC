"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
const { createRequire } = require("node:module");
const access = require("../lib/artist-test-access"),
  credits = require("../lib/credits");
const { transaction } = require("../lib/transactions");
module.exports = async (t, { pool }) => {
  let serial = 0;
  async function artist() {
    return (
      await pool.query(
        "INSERT INTO creators(display_name,email,password_salt,password_hash,plan) VALUES('Free studio fixture',$1,'fixture','fixture','starter') RETURNING id",
        ["free-studio-" + Date.now() + "-" + ++serial + "@ci.invalid"],
      )
    ).rows[0].id;
  }
  function engine(owner, { enabled = true, testingOpen = false, outcome = "success" } = {}) {
    let calls = 0,
      next = 0;
    const context = {
      module: { exports: null },
      require: createRequire(path.resolve("musicapi-sonic.js")),
      process: {
        env: {
          MUSICAPI_API_KEY: "fixture-only",
          LAE_ARTIST_TEST_ACCESS: enabled ? "1" : "0",
          LAE_ARTIST_STUDIO_TESTING: testingOpen ? "1" : "0",
        },
      },
      URL,
      AbortController,
      setTimeout,
      clearTimeout,
      console: { error() {} },
      fetch: async (url, opts) => {
        calls++;
        if (outcome === "rejected")
          return {
            ok: false,
            status: 400,
            headers: new Headers(),
            json: async () => ({ message: "Invalid fixture request" }),
          };
        if (outcome === "uncertain") throw Error("fixture network ambiguity");
        if (opts.method === "POST")
          return {
            ok: true,
            status: 200,
            json: async () => ({
              task_id: "free_music_" + owner + "_" + ++next,
            }),
          };
        return {
          ok: true,
          status: 200,
          json: async () =>
            outcome === "failed"
              ? { status: "failed" }
              : {
                  status: "succeeded",
                  songs: [
                    {
                      id: "fixture_clip_123",
                      audio_url: "https://files.musicapi.ai/fixture.mp3",
                      status: "succeeded",
                    },
                  ],
                },
        };
      },
    };
    vm.runInNewContext(fs.readFileSync("musicapi-sonic.js", "utf8"), context);
    return {
      get calls() {
        return calls;
      },
      async request(route, key, as = owner) {
        const body = {
          title: "Original fixture",
          lyrics:
            "Original words with enough meaning for a complete short fixture song.",
          style: "Highlife guitars",
        };
        const req = {
          method: route.includes("status") ? "GET" : "POST",
          url: route,
          headers: { "idempotency-key": key },
          async *[Symbol.asyncIterator]() {
            yield JSON.stringify(body);
          },
        };
        const res = {
          writeHead(status) {
            this.status = status;
          },
          end(raw) {
            this.data = JSON.parse(raw);
          },
        };
        await context.module.exports(req, res, route.split("?")[0], {
          pool,
          me: async () => (as ? { id: as } : null),
          validOrigin: () => true,
        });
        return res;
      },
    };
  }
  await t.test('legacy public test flags cannot create a new unpaid music generation',async()=>{const id=await artist();for(const enabled of [true,false]){const runner=engine(id,{enabled});const r=await runner.request('/api/music/sonic/create','retired_free_key_123456');assert.equal(r.status,402);assert.equal(runner.calls,0);}assert.equal(access.enabled({LAE_ARTIST_TEST_ACCESS:'1',NODE_ENV:'production'}),false);});
  await t.test('retiring the campaign preserves historical credits and usage without new awards',async()=>{const id=await artist();await pool.query('INSERT INTO generation_wallets(creator_id,credits) VALUES($1,7)',[id]);await pool.query("INSERT INTO artist_test_generations(reservation_reference,artist_id,status) VALUES($1,$2,'completed')",['historical-free-'+id,id]);await access.grantLyrics(pool,id);const a=await access.allowance(pool,id);assert.equal(a.active,false);assert.equal(a.remaining_generations,0);assert.equal((await pool.query('SELECT credits FROM generation_wallets WHERE creator_id=$1',[id])).rows[0].credits,7);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_test_generations WHERE artist_id=$1',[id])).rows[0].n,1);await assert.rejects(access.reserve(pool,id,'unapproved-new-free-'+id),e=>e.status===402);});
  await t.test('historical reserved generations can still reconcile once without reopening free access',async()=>{const id=await artist(),reference='historical-pending-'+id;await pool.query('INSERT INTO artist_test_generations(reservation_reference,artist_id) VALUES($1,$2)',[reference,id]);assert.equal((await access.settle(pool,id,reference,'restored')).rowCount,1);assert.equal((await access.settle(pool,id,reference,'restored')).rowCount,0);assert.equal(access.enabled({LAE_ARTIST_TEST_ACCESS:'1'}),false);});
  await t.test('new temporary testing grants two lyrics credits once without recording any sale',async()=>{const id=await artist(),env={LAE_ARTIST_STUDIO_TESTING:'1'};assert(access.enabled(env));await pool.query('INSERT INTO generation_wallets(creator_id,credits) VALUES($1,5)',[id]);await Promise.all([access.grantLyrics(pool,id,env),access.grantLyrics(pool,id,env)]);assert.equal((await pool.query('SELECT credits FROM generation_wallets WHERE creator_id=$1',[id])).rows[0].credits,7);assert.equal((await require('../lib/artist-access').status(pool,id,env)).active,true);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_subscriptions WHERE artist_id=$1',[id])).rows[0].n,0);assert.equal((await access.allowance(pool,id,env)).remaining_generations,2);});
  await t.test('temporary audio testing uses the existing engine and enforces two reserved or completed requests',async()=>{const id=await artist(),runner=engine(id,{testingOpen:true}),before=(await pool.query('SELECT COUNT(*)::int AS n FROM commerce_orders')).rows[0].n;for(let n=0;n<2;n++){const key='open_inspection_audio_'+id+'_'+n;const created=await runner.request('/api/music/sonic/create',key);assert.equal(created.status,200,JSON.stringify(created.data));assert(created.data.task_id);assert.equal((await runner.request('/api/music/sonic/create',key)).data.task_id,created.data.task_id);assert.equal((await runner.request('/api/music/sonic/status?id='+created.data.task_id)).status,200);}const calls=runner.calls;assert.equal((await runner.request('/api/music/sonic/create','open_inspection_exhausted_'+id)).status,402);assert.equal(runner.calls,calls);assert.equal(await access.remaining(pool,id),0);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM commerce_orders')).rows[0].n,before);});
  await t.test('concurrent temporary reservations cannot exceed the audio allowance and confirmed failure restores one',async()=>{const id=await artist(),env={LAE_ARTIST_STUDIO_TESTING:'1'},results=await Promise.allSettled([0,1,2].map(n=>transaction(pool,db=>access.reserve(db,id,'inspection_concurrent_'+id+'_'+n,env))));assert.equal(results.filter(r=>r.status==='fulfilled').length,2);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===402).length,1);const rows=(await pool.query("SELECT reservation_reference FROM artist_test_generations WHERE artist_id=$1 AND status='reserved'",[id])).rows;assert.equal((await access.settle(pool,id,rows[0].reservation_reference,'restored')).rowCount,1);assert.equal((await access.settle(pool,id,rows[0].reservation_reference,'restored')).rowCount,0);assert.equal(await access.remaining(pool,id),1);});

};
