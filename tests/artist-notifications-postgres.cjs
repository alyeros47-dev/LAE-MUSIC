'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {runtime}=require('./runtime.cjs'),{transaction}=require('../lib/transactions');
const {createArtistNotifications}=require('../lib/artist-notifications');
const finance=require('../lib/finance');
module.exports=async(t,{pool})=>{
 const service=createArtistNotifications({pool,env:{NODE_ENV:'test'}}),app=await runtime({pool,env:{NODE_ENV:'test',ADMIN_KEY:'isolated-notification-key-123456',STUDIO_RELEASE_WORKER_ENABLED:'false'}});
 const api=async(path,{body,cookie}={})=>{const r=await app.request(path,{method:body===undefined?'GET':'POST',body,headers:cookie?{cookie}:{}});return {status:r.status,data:r.json(),cookie:r.headers['set-cookie']?.split(';')[0]};};
 async function register(name){const r=await api('/api/register',{body:{name:'Notice '+name,email:name+'@notifications-ci.invalid',country:'Nigeria',password:'NotificationPassword123',confirmPassword:'NotificationPassword123',plan:'starter'}});assert.equal(r.status,201);return {id:r.data.user.id,cookie:r.cookie};}
 async function subscribe(user,ends,starts="NOW()-INTERVAL '1 month'",held=false){const r=await pool.query(`INSERT INTO artist_subscriptions(artist_id,plan,amount_cents,payment_reference,status,starts_at,expires_at,payment_hold) VALUES($1,'starter',600,$2,'paid',${starts},${ends},$3) RETURNING *`,[user.id,'notice-fixture-'+crypto.randomUUID(),held]);return r.rows[0];}
 let artist,other,term;
 await t.test('subscription reminders are durable and idempotent across processes without renewing terms or changing any balance',async()=>{
  artist=await register('reminder');other=await register('other');term=await subscribe(artist,"NOW()+INTERVAL '25 days'");
  const snapshot=()=>pool.query('SELECT (SELECT COUNT(*) FROM finance_transfers) AS transfers,(SELECT COALESCE(SUM(credits),0) FROM generation_wallets) AS credits,(SELECT COUNT(*) FROM artist_subscriptions) AS terms');const before=await snapshot();
  await Promise.all(Array.from({length:5},()=>createArtistNotifications({pool}).remind(artist.id)));const rows=await service.list(artist.id);assert.equal(rows.notifications.length,1);assert.equal(rows.notifications[0].kind,'subscription');assert.match(rows.notifications[0].message,/does not renew/);assert.equal(rows.unread,1);assert.deepEqual((await snapshot()).rows,before.rows);
  assert.equal((await pool.query('SELECT expires_at FROM artist_subscriptions WHERE id=$1',[term.id])).rows[0].expires_at.getTime(),term.expires_at.getTime());
 });
 await t.test('reminders cover 7-day, 1-day and expired windows, exclude distant and held terms, and suppress covered renewals',async()=>{
  for(const [name,ends,expected]of [['seven',"NOW()+INTERVAL '5 days'",'7'],['one',"NOW()+INTERVAL '6 hours'",'1'],['expired',"NOW()-INTERVAL '2 days'",'expired'],['distant',"NOW()+INTERVAL '40 days'",null]]){const user=await register(name);await subscribe(user,ends);await service.remind(user.id);const rows=(await pool.query('SELECT source_key FROM artist_notifications WHERE artist_id=$1',[user.id])).rows;assert.equal(rows.length,expected?1:0);if(expected)assert.match(rows[0].source_key,new RegExp(':'+expected+':'));}
  const held=await register('held');await subscribe(held,"NOW()+INTERVAL '5 days'",undefined,true);assert.equal(await service.remind(held.id),0);
  const renewed=await register('renewed');const first=await subscribe(renewed,"NOW()+INTERVAL '5 days'");await pool.query("INSERT INTO artist_subscriptions(artist_id,plan,amount_cents,payment_reference,status,starts_at,expires_at) VALUES($1,'starter',600,$2,'paid',$3,$3::timestamptz+INTERVAL '1 year')",[renewed.id,'renewal-notice-'+crypto.randomUUID(),first.expires_at]);assert.equal(await service.remind(renewed.id),0);
 });
 await t.test('artist notifications require the explicit account role and acknowledgements cannot affect another artist',async()=>{
  assert.equal((await api('/api/platform/notifications?role=artist')).status,401);
  assert.equal((await api('/api/platform/notifications',{cookie:artist.cookie})).status,400);
  assert.equal((await api('/api/platform/notifications?role=listener',{cookie:artist.cookie})).status,400);
  const inbox=await api('/api/platform/notifications?role=artist',{cookie:artist.cookie});assert.equal(inbox.status,200);const id=String(inbox.data.notifications[0].id);
  assert.equal((await api('/api/platform/notifications/read?role=artist',{cookie:other.cookie,body:{through_id:id}})).status,200);assert.equal((await service.list(artist.id)).unread,1);
  assert.equal((await api('/api/platform/notifications/read?role=artist',{cookie:artist.cookie,body:{through_id:id}})).status,200);assert.equal((await service.list(artist.id)).unread,0);assert.equal((await api('/api/platform/notifications?role=artist&unread=1',{cookie:artist.cookie})).data.notifications.length,0);
  const saved=(await pool.query('SELECT read_at FROM artist_notifications WHERE id=$1',[id])).rows[0].read_at;await service.read(artist.id,id);assert.equal((await pool.query('SELECT read_at FROM artist_notifications WHERE id=$1',[id])).rows[0].read_at.getTime(),saved.getTime());
  await assert.rejects(pool.query("UPDATE artist_notifications SET message='altered' WHERE id=$1",[id]),/append-only/);await assert.rejects(pool.query('DELETE FROM artist_notifications WHERE id=$1',[id]),/append-only/);await assert.rejects(pool.query('UPDATE artist_notifications SET read_at=NULL WHERE id=$1',[id]),/cannot be reset/);
 });
 await t.test('withdrawal notifications share the money transaction and cannot claim that approval sent a payout',async()=>{
  await transaction(pool,db=>finance.transfer(db,'notice-test-funding','isolated_test_funding','USD',1000,'platform:notice_test:USD',finance.earnedAccount(artist.id,'USD'),artist.id));
  const first=await finance.requestWithdrawal(pool,artist.id,'notice-withdraw-request-001','USD',100);await finance.requestWithdrawal(pool,artist.id,'notice-withdraw-request-001','USD',100);await finance.reviewWithdrawal(pool,first.id,'approved','notice-withdraw-review-001');
  const rows=(await pool.query("SELECT title,message FROM artist_notifications WHERE artist_id=$1 AND source_key LIKE $2 ORDER BY id",[artist.id,'withdrawal:'+first.id+':%'])).rows;assert.equal(rows.length,2);assert.match(rows[1].message,/not a completed bank payment/);
  const second=await finance.requestWithdrawal(pool,artist.id,'notice-withdraw-request-002','USD',100);await finance.reviewWithdrawal(pool,second.id,'rejected','notice-withdraw-review-002');assert.equal((await pool.query('SELECT title FROM artist_notifications WHERE source_key=$1',['withdrawal:'+second.id+':rejected'])).rows[0].title,'Withdrawal rejected');
  const before=(await pool.query('SELECT COUNT(*)::int AS n FROM artist_notifications')).rows[0].n;await assert.rejects(transaction(pool,async db=>{await db.query("INSERT INTO finance_withdrawals(artist_id,currency,gross_minor,fee_minor,net_minor,request_key) VALUES($1,'USD',100,3,97,'rolled-back-notification')",[artist.id]);throw Error('fixture rollback');}),/rollback/);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_notifications')).rows[0].n,before);
 });
 await t.test('generation and purchase transitions create one owned notification and preserve record history',async()=>{
  const task='notice-task-'+crypto.randomUUID();await pool.query("INSERT INTO sonic_test_tasks(task_id,creator_id,status) VALUES($1,$2,'pending')",[task,artist.id]);await pool.query("UPDATE sonic_test_tasks SET status='succeeded' WHERE task_id=$1",[task]);await pool.query("UPDATE sonic_test_tasks SET status='succeeded' WHERE task_id=$1",[task]);
  const key='generation:'+crypto.createHash('md5').update(task).digest('hex')+':succeeded';assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_notifications WHERE artist_id=$1 AND source_key=$2',[artist.id,key])).rows[0].n,1);
  const order=crypto.randomUUID();await pool.query("INSERT INTO commerce_orders(id,artist_id,kind,plan,currency,amount_minor,royalty_percent,direct_referral_percent,expires_at) VALUES($1,$2,'artist_subscription','starter','USD',600,50,0,NOW()+INTERVAL '30 minutes')",[order,artist.id]);await pool.query("UPDATE commerce_orders SET status='cancelled' WHERE id=$1",[order]);await pool.query("UPDATE commerce_orders SET status='cancelled' WHERE id=$1",[order]);assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM artist_notifications WHERE source_key=$1',['purchase:'+order+':cancelled'])).rows[0].n,1);
  const otherView=await service.list(other.id);assert(!otherView.notifications.some(n=>n.title==='Generation completed'));
 });
 await t.test('earlier verified commerce, refunds and durable releases produced notifications in their actual transactions',async()=>{
  for(const [table,key,join]of [
   ['commerce_receipts r',"'purchase:'||r.order_id||':paid'",'JOIN commerce_orders o ON o.id=r.order_id'],
   ['payment_product_reversals r',"'refund:'||r.order_id",'JOIN commerce_orders o ON o.id=r.order_id']
  ]){const q=await pool.query(`SELECT COUNT(*)::int AS total,COUNT(n.id)::int AS notices FROM ${table} ${join} LEFT JOIN artist_notifications n ON n.artist_id=o.artist_id AND n.source_key=${key}`);assert(q.rows[0].total>0);assert.equal(q.rows[0].total,q.rows[0].notices);}
  const releases=await pool.query("SELECT COUNT(*)::int AS n FROM studio_releases r JOIN artist_notifications n ON n.artist_id=r.artist_id AND n.source_key='release:'||r.id||':published:'||r.attempts WHERE r.status='published'");assert(releases.rows[0].n>0);
 });
 await t.test('keyset inbox pages stay bounded and avoid duplicate records when newer events arrive',async()=>{
  const user=await register('pages');await pool.query("INSERT INTO artist_notifications(artist_id,source_key,kind,title,message,destination) SELECT $1,'page:'||n,'studio','Fixture update','Fixture account update.','/studio' FROM generate_series(1,65)n",[user.id]);const first=await service.list(user.id);assert.equal(first.notifications.length,60);assert(first.next_before);await pool.query("INSERT INTO artist_notifications(artist_id,source_key,kind,title,message,destination) VALUES($1,'page:new','studio','New fixture update','Fixture account update.','/studio')",[user.id]);const second=await service.list(user.id,{before:first.next_before});assert.equal(second.notifications.length,5);assert.equal(second.next_before,null);assert.equal(new Set([...first.notifications,...second.notifications].map(x=>String(x.id))).size,65);
  const health=await service.health();assert.equal(health.external_delivery_enabled,false);assert.equal(health.channel,'in_app');assert(!JSON.stringify(health).includes('Fixture account update'));
 });
 service.stop();
};
