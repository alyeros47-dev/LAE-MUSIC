'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { fail, transaction, idempotent, audit } = require('./transactions');
const finance = require('./finance');
const {providerWebhook,rawPaymentBody}=require('./payments/http');
const shellPaths = new Set(['/', '/index.html', '/discover', '/artists', '/library', '/workspace', '/studio', '/partners', '/account', '/join', '/admin/console','/listen','/music','/music.html','/start','/get-started','/dashboard','/earnings','/affiliate-links','/music-prompt-studio','/listener/account','/listener/dashboard','/admin','/admin.html','/admin/login','/admin/withdrawals','/admin-withdrawals','/recover','/verify-email','/admin/enroll']);
const staticFiles = { '/web/app.js': 'application/javascript', '/web/player.js': 'application/javascript', '/web/account-security.js':'application/javascript', '/web/insights-editorial.js':'application/javascript', '/web/admin-operators.js':'application/javascript', '/web/artist-notifications.js':'application/javascript', '/web/currency.js': 'application/javascript', '/web/ui.css': 'text/css', '/web/mark.svg': 'image/svg+xml', '/web/artwork.svg': 'image/svg+xml' };
const trackView = 't.id,t.title,t.genre,t.description,t.plays,t.status,t.created_at,t.published_at,c.id AS artist_id,c.display_name AS artist';
function createPlatform({ pool, me, listenerMe, authAdmin, validOrigin, body, json, releaseStorage, releaseProvider, env=process.env, onPublished, paymentService, accountService, adminService }) {
  const admins=adminService||require('./admin-auth').createAdminAuth({pool,env});
  const emailConfig=require('../config/account-email.json');
  const mailer=require('./account-email').emailRuntime({env});
  const accounts=accountService||require('./account-security').createAccountSecurity({pool,mailer,publicOrigin:emailConfig.public_origin,emailKey:env.ACCOUNT_EMAIL_KEY||''});
  const engagement=require('./engagement').createEngagement(pool);
  const editorial=require('./editorial').createEditorial(pool);
  const artistNotices=require('./artist-notifications').createArtistNotifications({pool,env});
  const playlists=require('./playlists').createPlaylists(pool);
  const commerce=require('./commerce').createCommerce({pool});
  const exchange=require('./exchange-rates').createExchangeRates({pool,env});
  const payments=paymentService||require('./payments/runtime').checkoutRuntime({pool,rates:exchange,env});
  const releases=require('./studio-releases').createStudioReleases({pool,store:releaseStorage,provider:releaseProvider,env,onPublished});
  const limits = new Map();
  function guard(req, res, url) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', ['/recover','/verify-email','/admin/enroll'].includes(url.pathname)?'no-referrer':'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (!url.pathname.startsWith('/api/')) return false;
    if (pool && req.method === 'POST' && url.pathname.startsWith('/api/admin/') && !url.pathname.endsWith('/login') && authAdmin(req) && res.once) res.once('finish', () => { audit(pool, { type:'admin', id:req.adminPrincipal?.source==='named'?'operator:'+req.adminPrincipal.id:'legacy-shared-key' }, 'admin.mutation', url.pathname, { status:res.statusCode }).catch(() => console.error('Admin audit persistence failed')); });
    if (!providerWebhook(req,url) && !['GET', 'HEAD'].includes(req.method) && (!validOrigin(req) || req.headers['sec-fetch-site'] === 'cross-site')) {
      json(res, 403, { error: 'Invalid request origin' }); return true;
    }
    if (/\/(login|register)$/.test(url.pathname)) {
      const key = req.socket.remoteAddress + ':' + url.pathname;
      const now = Date.now();
      let item = limits.get(key);
      if (!item || item.until < now) { item = { count: 0, until: now + 60000 }; limits.set(key, item); }
      if (++item.count > 20) { res.setHeader('Retry-After', '60'); json(res, 429, { error: 'Too many account attempts. Try again in a minute.' }); return true; }
      if (limits.size > 10000) for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    }
    return false;
  }
  async function artist(req) { const u = await me(req); if (!u) throw fail(401, 'Artist sign-in required'); return u; }
  async function listener(req) { const u = await listenerMe(req); if (!u) throw fail(401, 'Listener sign-in required'); return u; }
  function admin(req) { if (!authAdmin(req)) throw fail(401, 'Administrator sign-in required'); }
  function requireDb() { if (!pool) throw fail(503, 'The music database is unavailable. Please try again shortly.'); }
  const idOf = value => { if (!/^[1-9][0-9]{0,15}$/.test(String(value))) throw fail(400, 'Invalid resource ID'); return String(value); };
  async function handler(req, res, url) {
    const p = url.pathname;
    if(shellPaths.has(p)&&url.searchParams.get('legacy')==='1')return false;
    if (shellPaths.has(p) || Object.hasOwn(staticFiles, p)) {
      if (!['GET', 'HEAD'].includes(req.method)) { json(res, 405, { error: 'Method not allowed' }); return true; }
      const file = shellPaths.has(p) ? 'index.html' : p.slice(5);
      const type = shellPaths.has(p) ? 'text/html' : staticFiles[p];
      if (shellPaths.has(p)) res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; media-src 'self' https: blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
      res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': ['/recover','/verify-email','/admin/enroll'].includes(p)?'no-store':'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(path.join(__dirname, '../web', file))); return true;
    }
    if (p === '/api/platform/session' && req.method === 'GET') {
      const [a, l] = await Promise.all([me(req), listenerMe(req)]);
      json(res, 200, { artist: a, listener: l, admin: authAdmin(req),admin_user:req.adminPrincipal?admins.publicUser(req.adminPrincipal):null }); return true;
    }
    if(p==='/api/platform/admin/auth/status'&&req.method==='GET'){json(res,200,await admins.status(req.adminPrincipal));return true;}
    if(p.startsWith('/api/platform/admin/auth/')&&req.method==='POST'){
      requireDb();const b=await body(req,5000),principal=req.adminPrincipal;let result;
      if(p==='/api/platform/admin/auth/bootstrap/start')result=await admins.bootstrap(principal,b);
      else if(p==='/api/platform/admin/auth/bootstrap/confirm')result=await admins.complete(principal,b,req.headers['user-agent'],true);
      else if(p==='/api/platform/admin/auth/invitation/info')result=await admins.invitation(b);
      else if(p==='/api/platform/admin/auth/enroll/start')result=await admins.beginInvitation(b);
      else if(p==='/api/platform/admin/auth/enroll/confirm')result=await admins.complete(null,b,req.headers['user-agent'],false);
      else if(p==='/api/platform/admin/auth/reauthenticate')result=await admins.reauthenticate(principal,b,req.headers['user-agent']);
      else if(p==='/api/platform/admin/auth/mfa/start')result=await admins.replaceFactor(principal,b);
      else if(p==='/api/platform/admin/auth/mfa/confirm')result=await admins.confirmFactor(principal,b,req.headers['user-agent']);
      else if(p==='/api/platform/admin/auth/recovery-codes')result=await admins.recoveryCodes(principal,b);
      else if(p==='/api/platform/admin/auth/password')result=await admins.password(principal,b,req.headers['user-agent']);
      else {json(res,404,{error:'Unknown administrator authentication endpoint'});return true;}
      if(result.cookie){res.setHeader('Set-Cookie',[result.cookie,'lae_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0']);delete result.cookie;}json(res,200,result);return true;
    }
    if(p==='/api/platform/account/capabilities'&&req.method==='GET'){json(res,200,accounts.capabilities());return true;}
    if(p==='/api/platform/account/reset-request'&&req.method==='POST'){requireDb();const b=await body(req,3000);json(res,202,await accounts.issue(b.role,'reset_password',b.email,req.socket.remoteAddress));return true;}
    if(['/api/platform/account/reset-password','/api/platform/account/verify-email'].includes(p)&&req.method==='POST'){requireDb();const b=await body(req,3000),reset=p.endsWith('reset-password');const result=await accounts.consume(b.role,reset?'reset_password':'verify_email',b.token,b.newPassword,req.socket.remoteAddress);if(reset)res.setHeader('Set-Cookie',require('./account-security').accountRole(b.role).cookie+'=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');json(res,200,result);return true;}
    const recordPlay=p.match(/^\/api\/music\/tracks\/([1-9][0-9]{0,15})\/play$/);
    if(recordPlay&&req.method==='POST'){requireDb();const user=await listenerMe(req),viewer=require('./engagement').viewerIdentity(req,res,user);json(res,200,await engagement.record(recordPlay[1],viewer,req.headers['idempotency-key']));return true;}
    if(p==='/api/platform/editorial'&&req.method==='GET'){requireDb();json(res,200,await editorial.read());return true;}
    const promotionImage=p.match(/^\/api\/platform\/promotions\/([a-f0-9-]{36})\/artwork$/);
    if(promotionImage&&['GET','HEAD'].includes(req.method)){requireDb();const art=await editorial.image(promotionImage[1]);res.writeHead(200,{'Content-Type':art.artwork_mime,'Content-Length':art.artwork.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:art.artwork);return true;}
    if(p==='/api/platform/notifications'&&req.method==='GET'){requireDb();if(url.searchParams.get('role')!=='artist')throw fail(400,'Choose the artist notification account explicitly.');const u=await artist(req);json(res,200,await artistNotices.list(u.id,require('./artist-notifications').inboxOptions(url.searchParams)));return true;}
    if(p==='/api/platform/notifications/read'&&req.method==='POST'){requireDb();if(url.searchParams.get('role')!=='artist')throw fail(400,'Choose the artist notification account explicitly.');const u=await artist(req),b=await body(req,1000);json(res,200,await artistNotices.read(u.id,b.through_id));return true;}
    if(p==='/api/platform/currencies'&&req.method==='GET'){json(res,200,require('./currency').options());return true;}
    if(p==='/api/platform/pricing'&&req.method==='GET'){json(res,200,await exchange.pricing({country:url.searchParams.get('country')||undefined,currency:url.searchParams.get('currency')||undefined,locale:url.searchParams.get('locale')||'en'}));return true;}
    if (p === '/api/platform/capabilities' && req.method === 'GET') {
      json(res, 200, { payments: payments.enabled(), payment_mode:payments.capabilities().mode,merchant_country:'NG', payouts: false, studio_release_import: releases.availability(), database: !!pool, music_provider_configured: !!process.env.MUSICAPI_API_KEY, lyrics_configured: !!process.env.OPENAI_API_KEY, lyrics_model: process.env.OPENAI_LYRICS_MODEL || 'gpt-4.1-mini', voice_capability: 'unverified', guaranteed_outputs: null, languages: 'Language and style selections are creative instructions. Provider support and output quality must be verified.' }); return true;
    }
    // No synthetic checkout, webhook, enrollment reward or payout can be activated by an environment switch.
    if (['/api/platform/payment-webhook', '/api/gifts/purchase'].includes(p)) {
      json(res, 503, { error: 'Payments are not connected. No money was charged. A verified payment provider must be configured and tested before checkout opens.', payment_enabled: false }); return true;
    }
    if(p==='/api/platform/payments/capabilities'&&req.method==='GET'){json(res,200,payments.capabilities());return true;}
    const webhook=p.match(/^\/api\/platform\/payments\/webhooks\/(paystack|flutterwave)$/);
    if(webhook){if(req.method!=='POST')json(res,405,{error:'Method not allowed'});else if(!payments.enabled())json(res,503,{error:'Payment webhooks are not connected.'});else json(res,200,await payments.webhook(webhook[1],await rawPaymentBody(req),req.headers));return true;}
    if(p==='/api/platform/checkout'){
      if(!payments.enabled()){json(res,503,{error:'Payments are not connected. No money was charged. Verified sandbox setup is required.',payment_enabled:false});return true;}
      if(req.method!=='POST'){json(res,405,{error:'Method not allowed'});return true;}
      const u=await artist(req);json(res,202,{checkout:await payments.start(u.id,req.headers['idempotency-key'],await body(req,3000))});return true;
    }
    if (p === '/api/affiliate/enrollment-status') {
      if (!pool) { json(res, 503, { error: 'Database unavailable' }); return true; }
      const u = await artist(req);
      json(res, 200, { enrolled: true, registration_free: true, commissions: [], awards: [], withdrawals_enabled: false, notice: 'Registration is free. Rewards come only from verified product sales. Historical enrollment records are retained for reconciliation.' }); return true;
    }
    if (p === '/api/gifts/artist' && req.method === 'GET') {
      requireDb(); const u = await artist(req); const id = idOf(url.searchParams.get('artistId'));
      if (String(u.id) !== id && !authAdmin(req)) throw fail(403, 'Earnings are private.');
      const q = await pool.query('SELECT earned_kobo FROM artist_gift_wallets WHERE artist_id=$1', [id]);
      json(res, 200, { earned_naira: Number(q.rows[0]?.earned_kobo || 0) / 100 }); return true;
    }
    if (p === '/api/gifts/send' && req.method === 'POST') {
      requireDb(); const u = await listener(req); const b = await body(req, 2000);
      const trackId = idOf(b.trackId), giftId = String(b.giftId || ''), quantity = Number(b.quantity || 1);
      if (!/^[a-z]{2,20}$/.test(giftId) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) throw fail(400, 'Invalid gift details');
      const result = await transaction(pool, db => idempotent(db, 'gift:' + u.id, req.headers['idempotency-key'], { trackId, giftId, quantity }, async () => {
        const tr = await db.query("SELECT id,creator_id FROM music_tracks WHERE id=$1 AND status='published'", [trackId]);
        const gift = await db.query('SELECT coins FROM gift_catalog WHERE id=$1 AND active=TRUE', [giftId]);
        if (!tr.rowCount || !gift.rowCount) throw fail(404, 'Song or gift unavailable');
        const cost = Number(gift.rows[0].coins) * quantity;
        const debit = await db.query('UPDATE listener_coin_wallets SET balance=balance-$2,updated_at=NOW() WHERE listener_id=$1 AND balance >=$2 RETURNING balance', [u.id, cost]);
        if (!debit.rowCount) throw fail(402, 'Insufficient coins. Coin purchases are not yet available.');
        await db.query('INSERT INTO artist_gift_wallets(artist_id,earned_kobo) VALUES($1,$2) ON CONFLICT(artist_id) DO UPDATE SET earned_kobo=artist_gift_wallets.earned_kobo+EXCLUDED.earned_kobo,updated_at=NOW()', [tr.rows[0].creator_id, cost * 70]);
        const tx = await db.query('INSERT INTO gift_transactions(listener_id,artist_id,track_id,gift_id,quantity,coins_spent,artist_earned_kobo,platform_earned_kobo) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,created_at', [u.id, tr.rows[0].creator_id, trackId, giftId, quantity, cost, cost * 70, cost * 30]);
        await audit(db, { type: 'listener', id: u.id }, 'gift.send', String(tx.rows[0].id), { trackId, giftId, quantity, coins: cost });
        return { ok: true, transaction: tx.rows[0], coins_spent: cost, balance: Number(debit.rows[0].balance) };
      }));
      json(res, 200, result); return true;
    }
    if(p==='/api/listener/playlists'&&req.method==='POST'){requireDb();const u=await listener(req),b=await body(req,3000);json(res,201,{playlist:await playlists.create(u.id,b.name,req.headers['idempotency-key'])});return true;}
    if(p==='/api/listener/playlist/tracks'){requireDb();const u=await listener(req);if(req.method==='GET')json(res,200,await playlists.get(u.id,url.searchParams.get('playlistId')));else if(req.method==='POST')json(res,200,await playlists.changeTrack(u.id,await body(req,3000)));else json(res,405,{error:'Method not allowed'});return true;}
    if(p==='/api/listener/playlist/delete'&&req.method==='POST'){requireDb();const u=await listener(req),b=await body(req,3000);json(res,200,await playlists.manage(u.id,b.playlistId,{action:'delete'}));return true;}
    if (!p.startsWith('/api/platform/')) return false;
    requireDb();
    if(p.startsWith('/api/platform/account/')){
      const role=url.searchParams.get('role')||'artist';require('./account-security').accountRole(role);const u=role==='artist'?await artist(req):await listener(req),token=require('./account-security').sessionToken(req,role);
      if(p==='/api/platform/account/security'&&req.method==='GET'){json(res,200,await accounts.sessions(role,u.id,token));return true;}
      if(p==='/api/platform/account/sessions/revoke'&&req.method==='POST'){const result=await accounts.revoke(role,u.id,token,await body(req,3000));if(result.reauthentication_required)res.setHeader('Set-Cookie',require('./account-security').accountRole(role).cookie+'=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');json(res,200,result);return true;}
      if(p==='/api/platform/account/verification-request'&&req.method==='POST'){json(res,202,await accounts.issue(role,'verify_email',u.email,req.socket.remoteAddress,{id:u.id,token}));return true;}
    }
    if(p==='/api/platform/artist-analytics'&&req.method==='GET'){const u=await artist(req),report=await engagement.report(u.id,url.searchParams.get('days')||'30');if(url.searchParams.get('format')==='csv'){const csv=require('./engagement').analyticsCsv(report);res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename=lae-music-analytics.csv','Cache-Control':'no-store'});res.end(csv);}else json(res,200,report);return true;}
    if(p==='/api/platform/payments/quote'&&req.method==='POST'){const u=await artist(req);json(res,201,{quote:await payments.prepare(u.id,await body(req,3000))});return true;}
    if(p==='/api/platform/payments/checkouts'&&req.method==='GET'){const u=await artist(req);json(res,200,{checkouts:await payments.list(u.id)});return true;}
    const checkoutState=p.match(/^\/api\/platform\/payments\/checkouts\/([a-f0-9-]{36})(\/verify)?$/);
    if(checkoutState){const u=await artist(req);if(req.method==='GET'&&!checkoutState[2])json(res,200,{checkout:await payments.status(u.id,checkoutState[1])});else if(req.method==='POST'&&checkoutState[2])json(res,200,{checkout:await payments.reconcile(u.id,checkoutState[1])});else json(res,405,{error:'Method not allowed'});return true;}
    if(p==='/api/platform/payments/refunds'&&req.method==='GET'){const u=await artist(req);json(res,200,{cases:await payments.refunds.list(u.id)});return true;}
    const refundRequest=p.match(/^\/api\/platform\/purchases\/([a-f0-9-]{36})\/refund$/);
    if(refundRequest){const u=await artist(req);if(req.method!=='POST')json(res,405,{error:'Method not allowed'});else json(res,201,{cases:await payments.refunds.request(u.id,refundRequest[1],req.headers['idempotency-key'],await body(req,3000))});return true;}
    if(p==='/api/platform/purchases'){
      const u=await artist(req);
      if(req.method==='GET')json(res,200,{orders:await commerce.list(u.id),checkout_enabled:false});
      else if(req.method==='POST')json(res,201,{order:await commerce.create(u.id,req.headers['idempotency-key'],await body(req,3000)),checkout_enabled:false});
      else json(res,405,{error:'Method not allowed'});return true;
    }
    const cancelPurchase=p.match(/^\/api\/platform\/purchases\/([a-f0-9-]{36})\/cancel$/);
    if(cancelPurchase){const u=await artist(req);if(req.method!=='POST')json(res,405,{error:'Method not allowed'});else json(res,200,{order:await commerce.cancel(u.id,cancelPurchase[1],req.headers['idempotency-key'])});return true;}
    if(p==='/api/platform/admin/commerce'&&req.method==='GET'){admin(req);json(res,200,await commerce.report());return true;}
    if (p === '/api/platform/discover' && req.method === 'GET') {json(res,200,await require('./discovery').discover(pool,url.searchParams));return true;}
    if(p==='/api/platform/studio/releases'){
      const u=await artist(req);
      if(req.method==='GET')json(res,200,{releases:await releases.list(u.id),imports_available:releases.availability()});
      else if(req.method==='POST')json(res,202,{release:await releases.create(u.id,req.headers['idempotency-key'],await body(req,8000))});
      else json(res,405,{error:'Method not allowed'});return true;
    }
    const releaseRoute=p.match(/^\/api\/platform\/studio\/releases\/([1-9][0-9]{0,15})\/(retry|edit|publish|audio)$/);
    if(releaseRoute){const u=await artist(req),id=releaseRoute[1],action=releaseRoute[2];if(action==='audio'&&req.method==='GET'){json(res,200,await releases.preview(u.id,id));return true;}if(req.method!=='POST'){json(res,405,{error:'Method not allowed'});return true;}const b=await body(req,8000);if(action==='retry')json(res,202,{release:await releases.retry(u.id,id)});else if(action==='edit')json(res,200,{release:await releases.edit(u.id,id,b)});else if(action==='publish')json(res,200,await releases.publish(u.id,id,req.headers['idempotency-key'],b.rightsConfirmed));else json(res,405,{error:'Method not allowed'});return true;}
    const playlistRoute=p.match(/^\/api\/platform\/playlists\/([1-9][0-9]{0,15})$/);
    if(playlistRoute){const u=await listener(req);if(req.method==='POST')json(res,200,await playlists.manage(u.id,playlistRoute[1],await body(req,12000)));else json(res,405,{error:'Method not allowed'});return true;}
    if (p === '/api/platform/library' && req.method === 'GET') {
      const u = await listener(req);
      const [likes, history, playlists] = await Promise.all([
        pool.query(`SELECT ${trackView} FROM song_likes l JOIN music_tracks t ON t.id=l.track_id JOIN creators c ON c.id=t.creator_id WHERE l.listener_id=$1 AND t.status='published' ORDER BY l.created_at DESC LIMIT 100`, [u.id]),
        pool.query(`SELECT ${trackView} FROM listener_history h JOIN music_tracks t ON t.id=h.track_id JOIN creators c ON c.id=t.creator_id WHERE h.listener_id=$1 AND t.status='published' ORDER BY h.last_played DESC LIMIT 50`, [u.id]),
        pool.query('SELECT p.id,p.name,COUNT(pt.track_id)::int AS song_count FROM listener_playlists p LEFT JOIN listener_playlist_tracks pt ON pt.playlist_id=p.id WHERE p.listener_id=$1 GROUP BY p.id ORDER BY p.created_at DESC', [u.id])
      ]);
      json(res, 200, { likes: likes.rows, history: history.rows, playlists: playlists.rows }); return true;
    }
    if (p === '/api/platform/partners-overview' && req.method === 'GET') {
      const u = await artist(req);
      const [stats, monthly] = await Promise.all([
        pool.query("SELECT (SELECT COUNT(*) FROM creators WHERE referred_by=$1) AS direct_registrations,(SELECT COUNT(*) FROM affiliate_subscription_commissions a JOIN artist_subscriptions s ON s.id=a.subscription_id AND s.status='paid' WHERE a.referrer_id=$1 AND a.tier=1) AS verified_sales,(SELECT COUNT(*) FROM affiliate_team_sales WHERE team_leader_id=$1 AND quarter_start=date_trunc('quarter',NOW())::date) AS team_sales", [u.id]),
        pool.query("SELECT date_trunc('month',a.created_at)::date AS month,COUNT(*)::int AS sales,SUM(a.amount_cents)::bigint AS commission_cents FROM affiliate_subscription_commissions a JOIN artist_subscriptions s ON s.id=a.subscription_id AND s.status='paid' WHERE a.referrer_id=$1 AND a.tier=1 AND a.created_at>=date_trunc('month',NOW())-INTERVAL '5 months' GROUP BY 1 ORDER BY 1", [u.id])
      ]);
      json(res,200,{stats:stats.rows[0],monthly:monthly.rows});return true;
    }
    if (p === '/api/platform/listener-profile' && req.method === 'POST') {
      const u = await listener(req), b = await body(req,3000), name = String(b.display_name||'').trim();
      if(name.length<2||name.length>100)throw fail(400,'Use a display name of 2–100 characters.');
      await pool.query('UPDATE listeners SET display_name=$1 WHERE id=$2',[name,u.id]);json(res,200,{ok:true});return true;
    }
    if (p === '/api/platform/listener-password' && req.method === 'POST') {
      const u=await listener(req),result=await accounts.changePassword('listener',u.id,require('./account-security').sessionToken(req,'listener'),await body(req,3000));res.setHeader('Set-Cookie','lae_listener=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');json(res,200,result);return true;
    }
    if (p === '/api/platform/artist-profile' && req.method === 'GET') {
      const q = await pool.query('SELECT id,display_name,bio FROM creators WHERE id=$1', [idOf(url.searchParams.get('id'))]);
      if (!q.rowCount) throw fail(404, 'Artist not found'); json(res, 200, { artist: q.rows[0] }); return true;
    }
    if (p === '/api/platform/profile' && req.method === 'POST') {
      const u = await artist(req), b = await body(req, 8000), name = String(b.display_name || '').trim(), bio = String(b.bio || '').trim();
      if (name.length < 2 || name.length > 100 || bio.length > 1200) throw fail(400, 'Use a name of 2–100 characters and biography up to 1,200 characters.');
      await pool.query('UPDATE creators SET display_name=$1,bio=$2 WHERE id=$3', [name, bio, u.id]); json(res, 200, { ok: true }); return true;
    }
    if (p === '/api/platform/artist-overview' && req.method === 'GET') {
      const u = await artist(req);
      const [stats, daily, tracks] = await Promise.all([
        pool.query("SELECT COUNT(*)::int AS songs,COUNT(*) FILTER(WHERE status='published')::int AS published,COALESCE(SUM(plays),0)::bigint AS plays,(SELECT COUNT(*)::int FROM listener_favorite_artists WHERE artist_id=$1) AS followers FROM music_tracks WHERE creator_id=$1", [u.id]),
        pool.query("SELECT (received_at AT TIME ZONE 'UTC')::date AS day,COUNT(*)::bigint AS plays FROM music_play_events WHERE artist_id=$1 AND received_at>=NOW()-INTERVAL '30 days' GROUP BY 1 ORDER BY 1", [u.id]),
        pool.query(`SELECT ${trackView} FROM music_tracks t JOIN creators c ON c.id=t.creator_id WHERE t.creator_id=$1 ORDER BY t.created_at DESC LIMIT 100`, [u.id])
      ]);
      json(res, 200, { artist: u, stats: stats.rows[0], activity: daily.rows, activity_note: 'Dated play events in UTC, recorded since this release. Lifetime totals include earlier activity. Plays do not establish payable royalties.', tracks: tracks.rows, royalties_per_stream: null }); return true;
    }
    if (p === '/api/platform/track' && req.method === 'POST') {
      const u = await artist(req), b = await body(req, 8000), id = idOf(b.id);
      const title = String(b.title || '').trim(), genre = String(b.genre || '').trim(), description = String(b.description || '').trim();
      if (title.length < 2 || title.length > 140 || !genre || genre.length > 60 || description.length > 800) throw fail(400, 'Check title, genre and description lengths.');
      const q = await pool.query("UPDATE music_tracks SET title=$1,genre=$2,description=$3 WHERE id=$4 AND creator_id=$5 AND status IN ('published','pending_upload') RETURNING id", [title, genre, description, id, u.id]);
      if (!q.rowCount) throw fail(404, 'Your editable track was not found.'); json(res, 200, { ok: true }); return true;
    }
    if (p === '/api/platform/finance' && req.method === 'GET') {
      const u = await artist(req); const balances = {};
      for (const currency of ['USD', 'NGN']) balances[currency] = { available_minor: await finance.balance(pool, finance.earnedAccount(u.id, currency)), held_minor: await finance.balance(pool, finance.heldAccount(u.id, currency)) };
      const [withdrawals, history, gifts] = await Promise.all([
        pool.query('SELECT id,currency,gross_minor,fee_minor,net_minor,status,created_at FROM finance_withdrawals WHERE artist_id=$1 ORDER BY created_at DESC LIMIT 100', [u.id]),
        pool.query("SELECT j.reference,j.kind,j.created_at,t.currency,t.amount_minor,t.credit_account,t.debit_account FROM finance_journals j JOIN finance_transfers t ON t.journal_id=j.id JOIN finance_accounts a ON a.id=t.credit_account OR a.id=t.debit_account WHERE a.artist_id=$1 GROUP BY j.id,t.id ORDER BY j.created_at DESC LIMIT 100", [u.id]),
        pool.query('SELECT earned_kobo FROM artist_gift_wallets WHERE artist_id=$1', [u.id])
      ]);
      json(res, 200, { balances, withdrawals: withdrawals.rows, history: history.rows, legacy_gift_kobo: Number(gifts.rows[0]?.earned_kobo || 0), fee_percent: 3, payouts_enabled: false, notice: 'Only reconciled ledger funds are withdrawable. Gift and historical commission balances require reconciliation. Approval reserves funds; it does not send money.' }); return true;
    }
    if (p === '/api/platform/withdrawals' && req.method === 'POST') {
      const u = await artist(req), b = await body(req, 3000);
      const result = await finance.requestWithdrawal(pool, u.id, req.headers['idempotency-key'], b.currency, b.amount_minor);
      json(res, 201, { withdrawal: result, funds_sent: false }); return true;
    }
    if (p.startsWith('/api/platform/admin/')) {
      admin(req);
      if(p==='/api/platform/admin/notification-health'&&req.method==='GET'){json(res,200,await artistNotices.health());return true;}
      if(p==='/api/platform/admin/operators'){if(req.method==='GET')json(res,200,await admins.list(req.adminPrincipal));else if(req.method==='POST')json(res,201,await admins.invite(req.adminPrincipal,await body(req,5000)));else json(res,405,{error:'Method not allowed'});return true;}
      const operatorAction=p.match(/^\/api\/platform\/admin\/operators\/([a-f0-9-]{36})\/(access|revoke-invitation)$/);
      if(operatorAction&&req.method==='POST'){const b=await body(req,3000);json(res,200,operatorAction[2]==='access'?await admins.changeOperator(req.adminPrincipal,operatorAction[1],b):await admins.revokeInvitation(req.adminPrincipal,operatorAction[1]));return true;}
      if(p==='/api/platform/admin/editorial'){if(req.method==='GET')json(res,200,await editorial.read(true));else if(req.method==='POST')json(res,200,await editorial.curate(req.headers['idempotency-key'],await body(req,5000)));else json(res,405,{error:'Method not allowed'});return true;}
      if(p==='/api/platform/admin/promotions'&&req.method==='POST'){json(res,200,await editorial.save(req.headers['idempotency-key'],await body(req,5000)));return true;}
      const promotionAction=p.match(/^\/api\/platform\/admin\/promotions\/([a-f0-9-]{36})\/(archive|artwork)$/);if(promotionAction&&['GET','HEAD'].includes(req.method)&&promotionAction[2]==='artwork'){const art=await editorial.image(promotionAction[1],true);res.writeHead(200,{'Content-Type':art.artwork_mime,'Content-Length':art.artwork.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:art.artwork);return true;}if(promotionAction&&req.method==='POST'){const b=await body(req,promotionAction[2]==='artwork'?1000000:3000);json(res,200,promotionAction[2]==='artwork'?await editorial.artwork(promotionAction[1],b):await editorial.archive(promotionAction[1],b.revision,req.headers['idempotency-key']));return true;}
      if(p==='/api/platform/admin/account-security'&&req.method==='GET'){json(res,200,await accounts.report());return true;}
      if (p === '/api/platform/admin/catalog-action' && req.method === 'POST') {
        const b=await body(req,2000),id=idOf(b.id);if(b.action!=='remove')throw fail(400,'Choose remove to unpublish a track.');
        await transaction(pool,async db=>{const q=await db.query("UPDATE music_tracks SET status='removed' WHERE id=$1 AND status<>'removed' RETURNING id",[id]);if(!q.rowCount)throw fail(404,'Track unavailable or already removed.');await audit(db,{type:'admin',id:'session'},'catalog.remove',id);});
        json(res,200,{ok:true});return true;
      }
      if (p === '/api/platform/admin/overview' && req.method === 'GET') {
        const q = await pool.query("SELECT (SELECT COUNT(*) FROM creators) AS artists,(SELECT COUNT(*) FROM listeners) AS listeners,(SELECT COUNT(*) FROM music_tracks WHERE status='published') AS tracks,(SELECT COALESCE(SUM(plays),0) FROM music_tracks) AS plays,(SELECT COUNT(*) FROM artist_subscriptions WHERE status='paid' AND starts_at<=NOW() AND expires_at>NOW() AND NOT payment_hold) AS active_subscriptions,(SELECT COUNT(*) FROM sonic_test_tasks WHERE status IN ('pending','running')) AS active_generations,(SELECT COUNT(*) FROM finance_withdrawals WHERE status='pending') AS pending_withdrawals");
        json(res, 200, { stats: q.rows[0], payments_enabled: false, payouts_enabled: false }); return true;
      }
      const reports = {
        artists: 'SELECT id,display_name,email,plan,membership_status,created_at FROM creators ORDER BY created_at DESC LIMIT 200',
        listeners: 'SELECT id,display_name,email,created_at FROM listeners ORDER BY created_at DESC LIMIT 200',
        catalog: 'SELECT t.id,t.title,c.display_name AS artist,c.id AS artist_id,t.genre,t.status,t.plays FROM music_tracks t JOIN creators c ON c.id=t.creator_id ORDER BY t.created_at DESC LIMIT 200',
        subscriptions: 'SELECT s.id,c.display_name,s.plan,s.amount_cents,s.status,s.starts_at,s.expires_at FROM artist_subscriptions s JOIN creators c ON c.id=s.artist_id ORDER BY s.created_at DESC LIMIT 200',
        releases: 'SELECT id,artist_id,task_id,clip_id,title,status,attempts,failure_code,audio_bytes,track_id,created_at,updated_at FROM studio_releases ORDER BY created_at DESC LIMIT 200',
        generations: 'SELECT t.task_id,c.display_name,t.status,t.created_at FROM sonic_test_tasks t JOIN creators c ON c.id=t.creator_id ORDER BY t.created_at DESC LIMIT 200',
        withdrawals: 'SELECT w.id,c.display_name,w.currency,w.gross_minor,w.fee_minor,w.net_minor,w.status,w.created_at FROM finance_withdrawals w JOIN creators c ON c.id=w.artist_id ORDER BY w.created_at DESC LIMIT 200',
        payments: 'SELECT provider,event_id,reference,currency,amount_minor,verified_at FROM finance_payment_events ORDER BY created_at DESC LIMIT 200',
        audit: 'SELECT actor_type,actor_id,action,resource,created_at FROM platform_audit ORDER BY id DESC LIMIT 200',
        gifts: 'SELECT g.id,g.gift_id,g.quantity,g.coins_spent,g.artist_earned_kobo,g.created_at FROM gift_transactions g ORDER BY g.created_at DESC LIMIT 200'
      };
      if (p === '/api/platform/admin/report' && req.method === 'GET') {
        const name = url.searchParams.get('section');
        if(name==='refunds'){json(res,200,{rows:await payments.refunds.report(),limit:200});return true;}
        if(name==='checkouts'){json(res,200,{rows:await payments.report(),limit:200});return true;}
        if (!Object.hasOwn(reports, name)) throw fail(400, 'Unknown report');
        const q = await pool.query(reports[name]); json(res, 200, { rows: q.rows, limit: 200 }); return true;
      }
      if(['/api/platform/admin/refund-review','/api/platform/admin/refund-verify'].includes(p)&&req.method==='POST'){const b=await body(req,3000);const rows=p.endsWith('refund-review')?await payments.refunds.review(b.order_id,req.headers['idempotency-key'],b):await payments.refunds.verify(b.order_id,req.headers['idempotency-key'],b);json(res,200,{rows,sandbox_only:true});return true;}
      if (p === '/api/platform/admin/withdrawal-review' && req.method === 'POST') {
        const b = await body(req, 3000), id = idOf(b.id);
        json(res, 200, { withdrawal: await finance.reviewWithdrawal(pool, id, b.decision, req.headers['idempotency-key']), funds_sent: false }); return true;
      }
    }
    json(res, 404, { error: 'Unknown platform endpoint' }); return true;
  }
  return { guard, handler, accounts, admins, start(){releases.start();accounts.start();artistNotices.start();}, stop(){releases.stop();accounts.stop();artistNotices.stop();} };
}
module.exports = { createPlatform };
