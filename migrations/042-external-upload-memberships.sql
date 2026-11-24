-- Additive separate paid upload memberships. Existing Studio terms and promotion stay intact.
ALTER TABLE commerce_orders DROP CONSTRAINT commerce_orders_kind_check;
ALTER TABLE commerce_orders ADD CONSTRAINT commerce_orders_kind_check CHECK(kind IN('artist_subscription','studio_generation','external_upload_subscription'));
CREATE TABLE external_upload_order_terms(
 order_id UUID PRIMARY KEY REFERENCES commerce_orders(id),song_limit INTEGER NOT NULL CHECK(song_limit IN(10,30,100)),revision TEXT NOT NULL
);
CREATE TRIGGER external_order_terms_immutable BEFORE UPDATE OR DELETE ON external_upload_order_terms FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE external_upload_memberships(
 id BIGSERIAL PRIMARY KEY,order_id UUID NOT NULL UNIQUE REFERENCES commerce_orders(id),artist_id BIGINT NOT NULL REFERENCES creators(id),
 plan TEXT NOT NULL CHECK(plan IN('starter','growth','professional')),song_limit INTEGER NOT NULL CHECK(song_limit IN(10,30,100)),
 starts_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ NOT NULL,status TEXT NOT NULL DEFAULT 'paid' CHECK(status IN('paid','refunded')),
 CHECK(expires_at>starts_at),UNIQUE(id,artist_id),FOREIGN KEY(order_id,artist_id) REFERENCES commerce_orders(id,artist_id),
 FOREIGN KEY(order_id) REFERENCES commerce_receipts(order_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX external_membership_artist ON external_upload_memberships(artist_id,expires_at);
CREATE TABLE external_upload_codes(
 id UUID PRIMARY KEY,artist_id BIGINT NOT NULL REFERENCES creators(id),membership_id BIGINT NOT NULL,code_hash CHAR(64) NOT NULL UNIQUE,
 track_id BIGINT UNIQUE REFERENCES music_tracks(id),audio_sha256 CHAR(64),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),consumed_at TIMESTAMPTZ,
 FOREIGN KEY(membership_id,artist_id) REFERENCES external_upload_memberships(id,artist_id),CHECK(consumed_at IS NULL OR track_id IS NOT NULL)
);
CREATE TABLE external_upload_rights_declarations(
 code_id UUID PRIMARY KEY REFERENCES external_upload_codes(id),artist_id BIGINT NOT NULL REFERENCES creators(id),version TEXT NOT NULL,
 declaration TEXT NOT NULL,accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER external_declarations_immutable BEFORE UPDATE OR DELETE ON external_upload_rights_declarations FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE external_rights_documents(
 id UUID PRIMARY KEY,artist_id BIGINT NOT NULL REFERENCES creators(id),storage_key TEXT NOT NULL UNIQUE,mime TEXT NOT NULL,
 filename TEXT NOT NULL,byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 1 AND 5242880),sha256 CHAR(64) NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected','revoked')),
 submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),reviewed_at TIMESTAMPTZ,reviewed_by TEXT,review_note TEXT
);
CREATE INDEX external_rights_owner ON external_rights_documents(artist_id,submitted_at);
CREATE TABLE external_upload_commissions(
 order_id UUID PRIMARY KEY REFERENCES commerce_receipts(order_id),artist_id BIGINT NOT NULL REFERENCES creators(id),referrer_id BIGINT NOT NULL REFERENCES creators(id),
 amount_minor BIGINT NOT NULL CHECK(amount_minor>0),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','held','reversed','reconciliation_required')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK(artist_id<>referrer_id)
);
CREATE FUNCTION lae_external_membership_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM commerce_orders o JOIN commerce_receipts r ON r.order_id=o.id JOIN external_upload_order_terms t ON t.order_id=o.id
 WHERE o.id=NEW.order_id AND o.artist_id=NEW.artist_id AND o.kind='external_upload_subscription' AND o.plan=NEW.plan AND o.status='paid'
 AND r.currency=o.currency AND r.amount_minor=o.amount_minor AND t.song_limit=NEW.song_limit)
 THEN RAISE EXCEPTION 'External membership requires a verified matching purchase'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER external_membership_guard AFTER INSERT ON external_upload_memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lae_external_membership_guard();
CREATE FUNCTION lae_external_code_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External upload history cannot be deleted'; END IF;
 IF TG_OP='UPDATE' AND ((NEW.id,NEW.artist_id,NEW.membership_id,NEW.code_hash,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.artist_id,OLD.membership_id,OLD.code_hash,OLD.created_at)
 OR OLD.consumed_at IS NOT NULL OR (OLD.audio_sha256 IS NOT NULL AND NEW.audio_sha256 IS DISTINCT FROM OLD.audio_sha256) OR (OLD.track_id IS NOT NULL AND NEW.track_id IS DISTINCT FROM OLD.track_id)) THEN RAISE EXCEPTION 'External upload authorization is immutable'; END IF;
 IF NEW.track_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM music_tracks t WHERE t.id=NEW.track_id AND t.creator_id=NEW.artist_id) THEN RAISE EXCEPTION 'External song belongs to another account'; END IF;
 IF NEW.consumed_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM music_tracks t WHERE t.id=NEW.track_id AND t.status='published') THEN RAISE EXCEPTION 'Only successful publication consumes an upload'; END IF;
 IF NEW.consumed_at IS NOT NULL THEN
  PERFORM id FROM external_upload_memberships WHERE id=NEW.membership_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM external_upload_memberships m WHERE m.id=NEW.membership_id AND m.status='paid' AND m.starts_at<=NOW() AND m.expires_at>NOW() AND (SELECT COUNT(*) FROM external_upload_codes c WHERE c.membership_id=m.id AND c.consumed_at IS NOT NULL)<m.song_limit) THEN RAISE EXCEPTION 'External upload allowance is unavailable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM external_upload_rights_declarations d WHERE d.code_id=NEW.id AND d.artist_id=NEW.artist_id) THEN RAISE EXCEPTION 'External upload rights declaration is required'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_code_guard BEFORE UPDATE OR DELETE ON external_upload_codes FOR EACH ROW EXECUTE FUNCTION lae_external_code_guard();
CREATE OR REPLACE FUNCTION lae_artist_policy_product_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.policy_revision IN('artist-packages-direct20-team10-2026-11-15','artist-direct20-creator-milestones-2026-11-15') AND NOT EXISTS(
 SELECT 1 FROM commerce_orders o WHERE o.id=NEW.artist_order_id AND o.plan IN('starter','growth','professional')
 AND (o.kind='artist_subscription' OR (o.kind='external_upload_subscription' AND NEW.policy_revision='artist-direct20-creator-milestones-2026-11-15')))
 THEN RAISE EXCEPTION 'Approved artist policy applies only to artist packages'; END IF;
 RETURN NEW;
END $$;
-- Retain the Studio evidence function byte-for-byte under a new stable name.
CREATE FUNCTION lae_studio_creator_purchase_evidence(purchase_id UUID) RETURNS TABLE(creator_id BIGINT,direct_id BIGINT,leader_id BIGINT,mode TEXT,verified_at TIMESTAMPTZ) LANGUAGE sql STABLE AS $$
 SELECT o.artist_id,s.direct_referrer_id,s.team_leader_id,COALESCE(p.mode,CASE WHEN mr.order_id IS NOT NULL THEN 'live' END),r.verified_at
 FROM commerce_orders o JOIN commerce_receipts r ON r.order_id=o.id
 JOIN affiliate_receipt_policies rp ON rp.artist_order_id=o.id JOIN commerce_order_referral_snapshots s ON s.order_id=o.id
 JOIN artist_subscriptions sub ON sub.id=o.subscription_id
 LEFT JOIN payment_presentments p ON p.order_id=o.id LEFT JOIN payment_checkout_quotes q ON q.id=p.quote_id
 LEFT JOIN membership_royalty_renewals mr ON mr.order_id=o.id
 WHERE o.id=purchase_id AND o.kind='artist_subscription' AND o.plan IN('starter','growth','professional') AND o.status='paid' AND sub.status='paid' AND NOT sub.payment_hold
 AND rp.policy_revision='artist-direct20-creator-milestones-2026-11-15' AND r.currency='USD' AND r.amount_minor=o.amount_minor
 AND s.direct_referrer_id IS NOT NULL AND s.team_leader_id IS NOT NULL AND s.direct_referrer_id<>o.artist_id AND s.team_leader_id<>o.artist_id AND s.team_leader_id<>s.direct_referrer_id
 AND ((p.mode IN('live','test') AND p.base_currency=r.currency AND p.base_minor=r.amount_minor AND p.provider=r.provider AND p.merchant_id=r.merchant_id AND p.payment_id=r.payment_id AND q.base_minor=r.amount_minor AND q.charge_currency=p.charge_currency AND q.charge_minor=p.charge_minor)
 OR (mr.artist_id=o.artist_id AND mr.currency=r.currency AND mr.amount_minor=r.amount_minor AND r.provider='royalty_balance'))
 AND NOT EXISTS(SELECT 1 FROM payment_product_reversals rev WHERE rev.order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM payment_refund_cases rc WHERE rc.order_id=o.id AND rc.status NOT IN('declined','refunded'))
 AND NOT EXISTS(SELECT 1 FROM refund_complaints rc LEFT JOIN refund_complaint_reviews rr ON rr.complaint_id=rc.id WHERE rc.artist_order_id=o.id AND COALESCE(rr.status,'under_review')<>'resolved_no_refund')
$$;
CREATE FUNCTION lae_external_purchase_evidence(purchase_id UUID) RETURNS TABLE(creator_id BIGINT,direct_id BIGINT,leader_id BIGINT,mode TEXT,verified_at TIMESTAMPTZ) LANGUAGE sql STABLE AS $$
 SELECT o.artist_id,s.direct_referrer_id,s.team_leader_id,p.mode,r.verified_at
 FROM commerce_orders o JOIN commerce_receipts r ON r.order_id=o.id JOIN external_upload_memberships m ON m.order_id=o.id
 JOIN commerce_order_referral_snapshots s ON s.order_id=o.id JOIN affiliate_receipt_policies rp ON rp.artist_order_id=o.id
 JOIN payment_presentments p ON p.order_id=o.id JOIN payment_checkout_quotes q ON q.id=p.quote_id
 WHERE o.id=purchase_id AND o.kind='external_upload_subscription' AND o.status='paid' AND m.status='paid'
 AND rp.policy_revision='artist-direct20-creator-milestones-2026-11-15' AND r.currency=o.currency AND r.amount_minor=o.amount_minor
 AND p.mode IN('test','live') AND p.base_minor=r.amount_minor AND p.base_currency=r.currency AND p.provider=r.provider AND p.merchant_id=r.merchant_id AND p.payment_id=r.payment_id
 AND q.base_minor=p.base_minor AND q.charge_minor=p.charge_minor AND q.charge_currency=p.charge_currency
 AND NOT EXISTS(SELECT 1 FROM payment_product_reversals x WHERE x.order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM payment_refund_cases x WHERE x.order_id=o.id AND x.status NOT IN('declined','refunded'))
 AND NOT EXISTS(SELECT 1 FROM refund_complaints c LEFT JOIN refund_complaint_reviews v ON v.complaint_id=c.id WHERE c.artist_order_id=o.id AND COALESCE(v.status,'under_review')<>'resolved_no_refund')
$$;
CREATE OR REPLACE FUNCTION lae_creator_purchase_evidence(purchase_id UUID) RETURNS TABLE(creator_id BIGINT,direct_id BIGINT,leader_id BIGINT,mode TEXT,verified_at TIMESTAMPTZ) LANGUAGE sql STABLE AS $$
 SELECT * FROM lae_studio_creator_purchase_evidence(purchase_id)
 UNION ALL SELECT * FROM lae_external_purchase_evidence(purchase_id) e WHERE e.direct_id IS NOT NULL AND e.leader_id IS NOT NULL AND e.creator_id<>e.direct_id AND e.creator_id<>e.leader_id AND e.direct_id<>e.leader_id
$$;
CREATE FUNCTION lae_external_commission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM lae_external_purchase_evidence(NEW.order_id) e JOIN commerce_orders o ON o.id=NEW.order_id
 WHERE e.creator_id=NEW.artist_id AND e.direct_id=NEW.referrer_id AND NEW.amount_minor=(o.amount_minor*20+50)/100)
 THEN RAISE EXCEPTION 'External commission requires verified purchase and approved direct rate'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER external_commission_guard AFTER INSERT ON external_upload_commissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lae_external_commission_guard();
