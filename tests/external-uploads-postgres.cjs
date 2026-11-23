'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
test('external memberships: real database and Monnify adapter; all provider/storage transport intercepted',async t=>{
 const f=await require('./external-upload-fixture.cjs').fixture(),{pool,api,uuid}=f,external=require('../lib/external-upload-memberships');
 const audio=Buffer.alloc(1600,1);audio.write('ID3');
 try{
  const leader=await f.register('External Leader'),direct=await f.register('External Direct',leader.id),buyer=await f.register('External Buyer',direct.id),other=await f.register('External Other');
  await t.test('new products are separate and no unpaid callback unlocks uploads',async()=>{
   const p=await f.prepare(buyer,'starter');assert.equal(Number(p.order.amount_minor),500);assert.equal(p.order.kind,'external_upload_subscription');
   assert.equal((await external.status(pool,buyer.id)).active_subscription,null);assert.equal((await api('/api/platform/external-uploads/codes',{},buyer.cookie)).status,402);
   const r=await f.payments.reconcile(buyer.id,p.checkout.id);assert.notEqual(r.status,'paid');assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM external_upload_memberships')).rows[0].n,0);
   f.transactions.get(p.checkout.reference).paymentStatus='CANCELLED';const raw=Buffer.from(JSON.stringify({eventType:'SUCCESSFUL_TRANSACTION',eventData:{paymentReference:p.checkout.reference,transactionReference:f.transactions.get(p.checkout.reference).transactionReference}}));await assert.rejects(f.payments.webhook('monnify',raw,{'monnify-signature':'0'.repeat(128)}));assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM external_upload_memberships')).rows[0].n,0);
  });
  await f.buy(leader);await require('../lib/affiliate-access').setParticipation(pool,leader.id,{mode:'test',participating:true});
  await f.buy(direct);await require('../lib/affiliate-access').setParticipation(pool,direct.id,{mode:'test',participating:true});
  const purchase=await f.buy(buyer,'growth');
  await t.test('verified payment activates exactly once; direct 20%, original currency, one second-level creator',async()=>{
   await Promise.all(Array.from({length:8},()=>f.payments.webhook('monnify',purchase.raw,purchase.headers)));
   const m=await external.status(pool,buyer.id);assert.equal(m.remaining_uploads,30);assert.equal(m.active_subscription.plan,'growth');
   assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM external_upload_memberships WHERE artist_id=$1',[buyer.id])).rows[0].n,1);
   assert.equal((await pool.query('SELECT amount_minor FROM external_upload_commissions WHERE order_id=$1',[purchase.order.id])).rows[0].amount_minor,'200');
   const native=(await pool.query('SELECT currency,amount_minor,exchange_rate FROM affiliate_native_earnings WHERE order_id=$1',[purchase.order.id])).rows[0];assert.equal(native.currency,'NGN');assert.equal(native.amount_minor,'300000');assert.equal(Number(native.exchange_rate),1500);
   assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM creator_milestone_qualifications WHERE creator_id=$1',[buyer.id])).rows[0].n,1);
   assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_subscriptions WHERE artist_id=$1',[buyer.id])).rows[0].n,0);assert.equal((await require('../lib/artist-access').status(pool,buyer.id,{NODE_ENV:'test'})).active,false);
   await f.buy(buyer,'starter','artist_subscription');assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM creator_milestone_qualifications WHERE creator_id=$1',[buyer.id])).rows[0].n,1);
  });
  await t.test('codes belong to one account, bind the audio and consume only after publication',async()=>{
   const request=uuid(),issued=await api('/api/platform/external-uploads/codes',{},buyer.cookie,request);assert.equal(issued.status,201,issued.text);const code=issued.data().uploadCode;
   assert.equal((await api('/api/platform/external-uploads/codes',{},buyer.cookie,request)).data().uploadCode,code);assert.equal((await external.status(pool,buyer.id)).remaining_uploads,30);
   await assert.rejects(external.codeStatus(pool,other.id,code));
   const input={uploadCode:code,title:'External Gospel Original',genre:'Gospel Praise',audioMime:'audio/mpeg',audioBytes:audio.length,audioSha256:crypto.createHash('sha256').update(audio).digest('hex'),rightsConfirmed:false};
   assert.equal((await api('/api/music/upload/start',input,buyer.cookie)).status,400);input.rightsConfirmed=true;const started=await api('/api/music/upload/start',input,buyer.cookie);assert.equal(started.status,201,started.text);
   assert.equal((await external.status(pool,buyer.id)).remaining_uploads,30);
   const bad=Buffer.from(audio);bad[60]=5;assert.equal((await api(started.data().audioUrl,bad,buyer.cookie,uuid(),'PUT',{'content-type':'audio/mpeg','content-length':String(bad.length)})).status,400);
   const published=await f.upload(buyer,code,input.title,audio);assert.equal(published.status,200,published.text);assert.equal((await external.status(pool,buyer.id)).remaining_uploads,29);
   assert.equal((await api('/api/music/upload/finish',{id:started.data().id},buyer.cookie)).status,200);assert.equal((await external.status(pool,buyer.id)).remaining_uploads,29);
   assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM external_upload_rights_declarations WHERE artist_id=$1',[buyer.id])).rows[0].n,1);
   await assert.rejects(require('../lib/finance').requestWithdrawal(pool,buyer.id,uuid(),'USD',100),e=>e.status===428);
   const documents=await api('/api/platform/external-uploads/documents',{filename:'License.pdf',mime:'application/pdf',data:Buffer.from('%PDF-1.7\nOriginal rights proof fixture').toString('base64')},buyer.cookie);assert.equal(documents.status,201,documents.text);
   const raw=[...f.objects.entries()].find(([name])=>name.includes('private-rights/'))[1].bytes;assert(!raw.includes(Buffer.from('Original rights proof fixture')));
   const admin=await api('/api/admin/login',{password:f.env.ADMIN_KEY});assert.equal(admin.status,200);const review=await api('/api/platform/admin/external-rights/review',{id:documents.data().id,decision:'approved',note:'Verified fixture distribution and monetization rights'},admin.cookie);assert.equal(review.status,200,review.text);
   await external.requireRightsApproval(pool,buyer.id);const download=await api('/api/platform/admin/external-rights/documents/'+documents.data().id,undefined,admin.cookie);assert.equal(download.status,200);assert(download.text.startsWith('%PDF-'));
  });
  await t.test('concurrent successful uploads cannot exceed a purchased song allowance',async()=>{
   await f.buy(other);const codes=await Promise.all(Array.from({length:12},()=>external.issue(pool,other.id,uuid())));assert.equal((await external.status(pool,other.id)).remaining_uploads,10);
   const results=await Promise.all(codes.map((c,i)=>f.upload(other,c.uploadCode,'Quota recording '+i,audio)));
   assert.equal(results.filter(r=>r.status===200).length,10,JSON.stringify(results.map(r=>({status:r.status,text:r.text}))));
   assert.equal((await external.status(pool,other.id)).remaining_uploads,0);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM external_upload_codes WHERE artist_id=$1 AND consumed_at IS NOT NULL',[other.id])).rows[0].n,10);
   await assert.rejects(external.issue(pool,other.id,uuid()),e=>e.status===409);
  });
  await t.test('renewal is annual and separate; refund and expiry remove new-upload access without deleting songs',async()=>{
   const renewal=await f.buy(other,'professional'),rows=(await pool.query('SELECT starts_at,expires_at FROM external_upload_memberships WHERE artist_id=$1 ORDER BY starts_at',[other.id])).rows;assert.equal(rows.length,2);assert.equal(+rows[1].starts_at,+rows[0].expires_at);assert(+rows[1].expires_at>+rows[1].starts_at);
   await pool.query("INSERT INTO payment_refund_cases(order_id,reason,status) VALUES($1,'Fixture refund hold','review')",[renewal.order.id]);assert.equal((await external.status(pool,other.id)).active_subscription.plan,'starter');
   await pool.query("UPDATE external_upload_memberships SET expires_at=NOW()-INTERVAL '1 day',starts_at=NOW()-INTERVAL '366 days' WHERE artist_id=$1 AND plan='starter'",[other.id]);assert.equal((await external.status(pool,other.id)).active_subscription,null);
   assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM music_tracks WHERE creator_id=$1 AND status='published'",[other.id])).rows[0].n,10);
   assert.deepEqual((await pool.query('SELECT capacity,allocated FROM artist_launch_campaign')).rows[0],{capacity:200,allocated:200});
   assert.equal((await api('/api/platform/payments/checkouts/'+purchase.checkout.id+'/verify',{},buyer.cookie)).status,200);
   const accounting=await require('../lib/partner-accounting').create({pool}).overview(direct.id,{mode:'test'});assert(accounting.rollup.direct.recorded_commission_minor>=200);
  });
 }finally{await f.close();}
});
