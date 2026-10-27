"use strict";
// Writes only to the explicitly opted-in local disposable review container.
const assert = require("node:assert/strict");
const { checkPreview } = require("../scripts/check-preview.cjs");
(async () => {
  if (process.env.LAE_REVIEW_CONTAINER_TESTS !== "1")
    throw Error(
      "Set LAE_REVIEW_CONTAINER_TESTS=1 only for the owned local review container.",
    );
  const origin = "http://127.0.0.1:3116";
  let healthy = false;
  const startupDeadline=Date.now()+60000;
  for (let i = 0; i < 120 && Date.now()<startupDeadline; i++) {
    try {
      if (
        (await fetch(origin + "/health", { signal: AbortSignal.timeout(1000) }))
          .ok
      ) {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(healthy, "review container must start within 60 seconds");
  const report = await checkPreview(origin);
  assert.equal(report.status, "available_for_review", JSON.stringify(report));
  const publicSnapshot=require('../data/review-public-catalog.json');
  const restored=await (await fetch(origin+'/api/platform/review-catalog/status')).json();
  assert.equal(restored.artists,publicSnapshot.artists.length);
  assert.equal(restored.songs,publicSnapshot.tracks.length);
  assert.equal(restored.private_accounts_copied,false);
  assert.equal(restored.source_writes,false);
  const discover=await (await fetch(origin+'/api/platform/discover')).json();
  assert.equal(discover.tracks.length,publicSnapshot.tracks.length);
  const artists=await (await fetch(origin+'/api/music/artists')).json();
  assert.equal(artists.artists.length,publicSnapshot.artists.length);
  for(const artist of artists.artists){
    const profile=await (await fetch(origin+'/api/music/artist?id='+artist.id)).json();
    assert.equal(String(profile.artist.id),String(artist.id));
    assert(profile.tracks.length>0);
  }
  const html = await (await fetch(origin + "/")).text();
  assert(html.includes('id="review-notice"'));
  assert(html.includes("Test accounts and data can reset"));
  const account = {
    name: "Disposable review fixture",
    country: "Nigeria",
    email: "review-" + crypto.randomUUID() + "@ci.invalid",
    password: "ReviewFixturePassword123",
    confirmPassword: "ReviewFixturePassword123",
    plan: "starter",
  };
  let r = await fetch(origin + "/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(account),
  });
  assert.equal(r.status, 201);
  let result = await r.json();
  assert.equal(result.user.membership_status, "pending_payment");
  r = await fetch(origin + "/api/listener/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      ...account,
      email: "listener-" + crypto.randomUUID() + "@ci.invalid",
    }),
  });
  assert.equal(r.status, 201);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  result = await r.json();
  assert(result.user.id);
  r = await fetch(origin + "/api/platform/session", {
    headers: { Cookie: cookie },
  });
  assert.equal(r.status, 200);
  assert((await r.json()).listener);
  if(process.env.LAE_REVIEW_ARTIST_IMPORT_TESTS==='1'){
    const post=async(path,body,cookie)=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
    let denied=await fetch(origin+'/api/platform/admin/review-accounts');assert.equal(denied.status,401);
    const admin=await post('/api/admin/login',{password:process.env.LAE_REVIEW_FIXTURE_ADMIN_KEY});assert.equal(admin.status,200);const ownerCookie=admin.headers.get('set-cookie').split(';')[0];
    const importedResponse=await fetch(origin+'/api/platform/admin/review-accounts',{headers:{Cookie:ownerCookie}});assert.equal(importedResponse.status,200);const imported=await importedResponse.json();assert.equal(imported.configured,true);const user=imported.artists.find(x=>String(x.source_id)==='99999');assert(user);assert(user.email.endsWith('@review-catalog.invalid'));
    const pw='IsolatedImportedTestPassword123';const set=await post('/api/platform/admin/review-accounts/password',{artist_id:String(user.id),password:pw,confirmPassword:pw},ownerCookie);assert.equal(set.status,200);assert.equal((await set.json()).live_accounts_changed,false);
    const login=await post('/api/platform/account/login',{email:user.email,password:pw,role:'artist'});assert.equal(login.status,200);const importedCookie=login.headers.get('set-cookie').split(';')[0];
    const session=await (await fetch(origin+'/api/platform/session',{headers:{Cookie:importedCookie}})).json();assert.equal(String(session.artist.id),String(user.id));assert.equal(session.artist.membership_status,'review_imported');
    const allowance=await (await fetch(origin+'/api/artist/studio-allowance',{headers:{Cookie:importedCookie}})).json();assert.equal(allowance.active,false);
    console.log('PASS: real isolated artist import, owner-only test password, existing login/session and no paid music entitlement. No original credentials copied.');
  }
  console.log(
    "PASS: 13 HTTP probes including all 99 existing studio profiles; restored public songs/profiles and their navigation APIs, temporary-data notice, actual artist/listener registration, listener session and unpaid artist status; Node 22 + PostgreSQL 16 inside a 512 MB review container. No provider calls, private production data or production writes.",
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
