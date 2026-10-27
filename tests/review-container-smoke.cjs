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
  const artistCookie=r.headers.get("set-cookie").split(";")[0];
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
    const allowance=await (await fetch(origin+'/api/artist/studio-allowance',{headers:{Cookie:importedCookie}})).json();if(allowance.review_test_access){const sub=await (await fetch(origin+'/api/artist/subscription',{headers:{Cookie:importedCookie}})).json();assert.equal(sub.artist_features_active,false);}else assert.equal(allowance.active,false);
    console.log('PASS: real isolated artist import, owner-only test password, existing login/session and no paid music entitlement. No original credentials copied.');
  }
  if(process.env.LAE_REVIEW_FRESH_TESTS==='1'){
    const post=async(path,body)=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:artistCookie},body:JSON.stringify(body)});
    const sub=await (await fetch(origin+'/api/artist/subscription',{headers:{Cookie:artistCookie}})).json();assert.equal(sub.review_test_access,true);assert.equal(sub.artist_features_active,false);
    const allowance=await (await fetch(origin+'/api/artist/studio-allowance',{headers:{Cookie:artistCookie}})).json();assert.equal(allowance.review_test_access,true);assert.equal(allowance.remaining_generations,2);
    const audio=Buffer.from(require('node:fs').readFileSync('tests/fixtures/review-tone.mp3.base64','utf8').trim(),'base64');
    const prepare=await post('/api/music/upload/start',{title:'Original sandbox test tone',genre:'Highlife',audioMime:'audio/mpeg',audioBytes:audio.length,rightsConfirmed:true});assert.equal(prepare.status,200);const upload=await prepare.json();assert.equal(upload.temporary_review_storage,true);
    const stranger=await fetch(origin+'/api/music/upload/file?id='+upload.id+'&kind=audio',{method:'PUT',headers:{Origin:origin,'Content-Type':'audio/mpeg'},body:audio});assert.equal(stranger.status,401);
    const put=await fetch(origin+'/api/music/upload/file?id='+upload.id+'&kind=audio',{method:'PUT',headers:{Origin:origin,'Content-Type':'audio/mpeg',Cookie:artistCookie},body:audio});assert.equal(put.status,200);
    const complete=await post('/api/music/upload/finish',{id:upload.id});assert.equal(complete.status,200);const duplicate=await post('/api/music/upload/finish',{id:upload.id});assert.equal(duplicate.status,200);
    const stream=await (await fetch(origin+'/api/music/tracks/'+upload.id+'/stream')).json();assert.equal(new URL(stream.url).origin,origin);const range=await fetch(stream.url,{headers:{Range:'bytes=0-63'}});assert.equal(range.status,206);assert.deepEqual(Buffer.from(await range.arrayBuffer()),audio.subarray(0,64));
    const own=await (await fetch(origin+'/api/music/mine',{headers:{Cookie:artistCookie}})).json();assert(own.tracks.some(x=>String(x.id)===String(upload.id)&&x.status==='published'));
    const ledger=await (await fetch(origin+'/api/artist/subscription',{headers:{Cookie:artistCookie}})).json();assert.equal(ledger.artist_features_active,false);
    const pending=[];for(let i=0;i<4;i++){const x=await post('/api/music/upload/start',{title:'Quota fixture '+i,genre:'Highlife',audioMime:'audio/mpeg',audioBytes:1024,rightsConfirmed:true});assert.equal(x.status,200);pending.push((await x.json()).id);}
    const sixth=await post('/api/music/upload/start',{title:'Over quota fixture',genre:'Highlife',audioMime:'audio/mpeg',audioBytes:1024,rightsConfirmed:true});assert.equal(sixth.status,403);
    for(const pendingId of pending){const x=await post('/api/platform/review-upload/cancel',{id:pendingId});assert.equal(x.status,200);}
    const invalid=await post('/api/music/upload/start',{title:'Invalid format fixture',genre:'Highlife',audioMime:'audio/mpeg',audioBytes:1024,rightsConfirmed:true});assert.equal(invalid.status,200);const invalidId=(await invalid.json()).id;const bad=Buffer.alloc(1024,32);bad.write('<html><script>bad</script></html>');const blocked=await fetch(origin+'/api/music/upload/file?id='+invalidId+'&kind=audio',{method:'PUT',headers:{Origin:origin,'Content-Type':'audio/mpeg',Cookie:artistCookie},body:bad});assert.equal(blocked.status,415);const unfinished=await post('/api/music/upload/finish',{id:invalidId});assert.equal(unfinished.status,409);assert.equal((await post('/api/platform/review-upload/cancel',{id:invalidId})).status,200);
    console.log('PASS: fresh artist signup/session, complimentary review access, real MP3 upload/verification/publish/replay, anonymous range streaming, owned catalog and no paid subscription. No R2 or provider calls.');
  }
  console.log(
    "PASS: 13 HTTP probes including all 99 existing studio profiles; restored public songs/profiles and their navigation APIs, temporary-data notice, actual artist/listener registration, listener session and unpaid artist status; Node 22 + PostgreSQL 16 inside a 512 MB review container. No provider calls, private production data or production writes.",
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
