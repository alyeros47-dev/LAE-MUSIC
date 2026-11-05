'use strict';
// Explicitly synthetic historical test-book fixtures, never live cash or paid providers.
const target=require('./ci-database.cjs').ciDatabase(),test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
const key=()=>crypto.randomUUID(),framework=require('../lib/affiliate-framework'),finance=require('../lib/finance'),books=require('../lib/premium-books');
test('approved Premium budget recognizes 30/35/35 once, funds artists only through eligible streams and never assigns individual commissions',async()=>{
 const control=new Pool({connectionString:target.href}),schema='framework_ledger_'+crypto.randomBytes(6).toString('hex');await control.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:target.href,options:'-c search_path='+schema});const fetchBefore=global.fetch;global.fetch=async()=>{throw Error('Real provider calls are forbidden by this ledger test');};
 try{
 await require('./runtime.cjs').runtime({pool,env:{NODE_ENV:'test',STUDIO_RELEASE_WORKER_ENABLED:'false'}});
 const artist=(await pool.query("INSERT INTO creators(display_name,email,password_salt,password_hash) VALUES('Ledger artist','artist@framework-ledger.invalid','fixture','fixture') RETURNING id")).rows[0].id;
 const listener=(await pool.query("INSERT INTO listeners(display_name,email,password_salt,password_hash) VALUES('Ledger listener','listener@framework-ledger.invalid','fixture','fixture') RETURNING id")).rows[0].id;
 const premium=require('../lib/premium-listeners').createPremium({pool}),o=await premium.prepare(listener,key(),{plan:'quarterly'});assert.equal(o.affiliate_policy_revision,framework.REVISION);assert.equal(Number(o.amount_minor),180);
 const quote=key(),attempt=key(),reference='SYNTHETIC-ONLY-'+key();await pool.query("INSERT INTO payment_checkout_quotes(id,premium_order_id,provider,base_currency,base_minor,charge_currency,charge_minor,expires_at) VALUES($1,$2,'manual_bank_transfer','USD',180,'USD',180,NOW()+INTERVAL '1 day')",[quote,o.id]);
 await pool.query("INSERT INTO premium_attempts(id,order_id,quote_id,provider,merchant_id,mode,reference,status) VALUES($1,$2,$3,'manual_bank_transfer','synthetic-ledger','test',$4,'paid')",[attempt,o.id,quote,reference]);
 await require('../lib/transactions').transaction(pool,async db=>{
 await db.query("INSERT INTO premium_receipts(order_id,provider,merchant_id,payment_id,mode,currency,amount_minor,verified_at) VALUES($1,'manual_bank_transfer','synthetic-ledger',$2,'test','USD',180,'2026-06-01T00:00:00Z')",[o.id,reference]);
 await db.query("INSERT INTO premium_presentments(order_id,quote_id,attempt_id,base_currency,base_minor,charge_currency,charge_minor,usd_equivalent_minor,exchange_rate,conversion_at) VALUES($1,$2,$3,'USD',180,'USD',180,180,'1',(SELECT created_at FROM payment_checkout_quotes WHERE id=$2))",[o.id,quote,attempt]);
 });
 const entitlement=(await pool.query("INSERT INTO premium_entitlements(order_id,listener_id,starts_at,expires_at) VALUES($1,$2,'2026-06-01T00:00:00Z','2026-08-30T00:00:00Z') RETURNING id",[o.id,listener])).rows[0].id;
 const royalties=require('../lib/streaming-royalties').createRoyalties(pool);await require('../lib/transactions').transaction(pool,db=>finance.transfer(db,'premium:'+o.id,'premium_verified_sale','USD',180,books.platform('receivable','test','USD'),books.platform('deferred','test','USD')));
 await royalties.costs(key(),{order_id:o.id,fees_minor:0,tax_minor:0,evidence:'Synthetic test receipt: independently classified zero fees and taxes.'});
 const track=(await pool.query("INSERT INTO music_tracks(creator_id,title,genre,audio_key,audio_mime,audio_bytes,status,published_at) VALUES($1,'Synthetic ledger song','Gospel','fixture.mp3','audio/mpeg',2048,'published','2026-05-01T00:00:00Z') RETURNING id",[artist])).rows[0].id;
 const playback=key();await pool.query('INSERT INTO premium_playback(id,listener_id,track_id,artist_id,entitlement_id) VALUES($1,$2,$3,$4,$5)',[playback,listener,track,artist,entitlement]);await pool.query("INSERT INTO premium_streams(playback_id,listener_id,track_id,artist_id,entitlement_id,occurred_at,listened_ms) VALUES($1,$2,$3,$4,$5,'2026-06-15T00:00:00Z',30000)",[playback,listener,track,artist,entitlement]);
 let totals={affiliate:0,artist:0,platform:0,gross:0};for(const month of ['2026-06','2026-07','2026-08']){
  const preview=await royalties.preview(month,'test','USD');assert.deepEqual(preview.issues,[]);totals.affiliate+=preview.unallocated_affiliate_minor;totals.artist+=preview.artist_pool_minor;totals.platform+=preview.platform_minor;totals.gross+=preview.gross_minor;
  if(month==='2026-06'){assert.equal(preview.allocations.length,1);assert.equal(String(preview.allocations[0].artist_id),String(artist));assert.equal(preview.undistributed_minor,0);}else{assert.equal(preview.allocations.length,0);assert.equal(preview.undistributed_minor,preview.artist_pool_minor,'No streams cannot produce arbitrary artist payouts');}
  const id=key(),input={month,mode:'test',currency:'USD',snapshot_hash:preview.snapshot_hash,review_note:'Synthetic ledger verification only. No real payment or release.'};const a=await royalties.finalize(id,input),b=await royalties.finalize(id,input);assert.equal(a.id,b.id);
 }
 assert.deepEqual(totals,{affiliate:54,artist:63,platform:63,gross:180});assert.equal(await finance.balance(pool,books.platform('affiliate_unallocated','test','USD')),54);assert.equal(await finance.balance(pool,books.platform('platform_income','test','USD')),63);assert.equal(await finance.balance(pool,books.platform('recognized','test','USD')),0);assert.equal(await finance.balance(pool,books.platform('commission_deferred_cost','test','USD')),0);assert.equal(await require('../lib/artist-membership').availableRoyalties(pool,artist),0);
 assert.equal((await pool.query('SELECT 1 FROM premium_commissions')).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM premium_quarterly_team_sales')).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM royalty_cash_releases')).rowCount,0);
 // Adversarial cost classification leaves only seven eligible cents over an annual term.
 // This is a rounding fixture, not a suggested charge/fee or a production price.
 const annual=await premium.prepare(listener,key(),{plan:'annual'}),gross=Number(annual.amount_minor),aq=key(),aa=key(),ar='SYNTHETIC-ROUNDING-'+key(),begin=new Date('2025-01-01T00:00:00Z'),end=new Date(begin.getTime()+annual.days*86400000);
 await pool.query("INSERT INTO payment_checkout_quotes(id,premium_order_id,provider,base_currency,base_minor,charge_currency,charge_minor,expires_at) VALUES($1,$2,'manual_bank_transfer','USD',$3,'USD',$3,NOW()+INTERVAL '1 day')",[aq,annual.id,gross]);
 await pool.query("INSERT INTO premium_attempts(id,order_id,quote_id,provider,merchant_id,mode,reference,status) VALUES($1,$2,$3,'manual_bank_transfer','synthetic-ledger','test',$4,'paid')",[aa,annual.id,aq,ar]);
 await require('../lib/transactions').transaction(pool,async db=>{
  await db.query("INSERT INTO premium_receipts(order_id,provider,merchant_id,payment_id,mode,currency,amount_minor) VALUES($1,'manual_bank_transfer','synthetic-ledger',$2,'test','USD',$3)",[annual.id,ar,gross]);
  await db.query("INSERT INTO premium_presentments(order_id,quote_id,attempt_id,base_currency,base_minor,charge_currency,charge_minor,usd_equivalent_minor,exchange_rate,conversion_at) VALUES($1,$2,$3,'USD',$4,'USD',$4,$4,'1',(SELECT created_at FROM payment_checkout_quotes WHERE id=$2))",[annual.id,aq,aa,gross]);
  await finance.transfer(db,'premium:'+annual.id,'premium_verified_sale','USD',gross,books.platform('receivable','test','USD'),books.platform('deferred','test','USD'));
 });
 await pool.query('INSERT INTO premium_entitlements(order_id,listener_id,starts_at,expires_at) VALUES($1,$2,$3,$4)',[annual.id,listener,begin,end]);
 await royalties.costs(key(),{order_id:annual.id,fees_minor:gross-7,tax_minor:0,evidence:'Adversarial synthetic cost classification for the seven-cent annual rounding regression only.'});
 const small={affiliate:0,artist:0,platform:0};for(let date=new Date(begin);date<end;date.setUTCMonth(date.getUTCMonth()+1)){
  const month=date.toISOString().slice(0,7),x=await royalties.preview(month,'test','USD');assert.deepEqual(x.issues,[]);assert(x.artist_pool_minor>=0&&x.artist_pool_minor<=x.net_minor);assert(x.platform_minor>=0);small.affiliate+=x.unallocated_affiliate_minor;small.artist+=x.artist_pool_minor;small.platform+=x.platform_minor;
  await royalties.finalize(key(),{month,mode:'test',currency:'USD',snapshot_hash:x.snapshot_hash,review_note:'Synthetic low-cent annual ledger regression. No payment or payout.'});
 }
 assert.deepEqual(small,{affiliate:2,artist:2,platform:3});assert.equal(await finance.balance(pool,books.platform('affiliate_unallocated','test','USD')),56);assert.equal(await finance.balance(pool,books.platform('platform_income','test','USD')),66);assert.equal(await finance.balance(pool,books.platform('recognized','test','USD')),0);
 await assert.rejects(require('../lib/royalty-settlement').createRoyaltySettlement({pool}).release(key(),{statement_id:key()}),e=>e.status===503);
 }finally{global.fetch=fetchBefore;await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();}
});
