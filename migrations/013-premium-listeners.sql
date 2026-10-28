-- Additive: separate NGN listener contracts; artist package snapshots/commissions are untouched.
CREATE TABLE premium_orders(
 id UUID PRIMARY KEY,listener_id BIGINT NOT NULL REFERENCES listeners(id),
 plan TEXT NOT NULL CHECK(plan IN ('daily','weekly','monthly','two_month','annual')),
 currency TEXT NOT NULL CHECK(currency='NGN'),amount_minor BIGINT NOT NULL CHECK(amount_minor>0),days INTEGER NOT NULL CHECK(days IN(1,7,30,60,365)),
 referrer_id BIGINT REFERENCES creators(id),indirect_id BIGINT REFERENCES creators(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ NOT NULL,
 CHECK(referrer_id IS NOT NULL OR indirect_id IS NULL),CHECK(referrer_id IS DISTINCT FROM indirect_id OR referrer_id IS NULL)
);
CREATE INDEX premium_orders_owner ON premium_orders(listener_id,created_at DESC);
CREATE TABLE premium_attempts(
 id UUID PRIMARY KEY,order_id UUID NOT NULL UNIQUE REFERENCES premium_orders(id),provider TEXT NOT NULL CHECK(provider IN('paystack','flutterwave')),
 merchant_id TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN('test','live')),reference TEXT NOT NULL UNIQUE,
 benefit_hold BOOLEAN NOT NULL DEFAULT FALSE,status TEXT NOT NULL DEFAULT 'initializing' CHECK(status IN('initializing','ready','review','paid')),checkout_url TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE premium_receipts(
 order_id UUID PRIMARY KEY REFERENCES premium_orders(id),provider TEXT NOT NULL,merchant_id TEXT NOT NULL,payment_id TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN('test','live')),currency TEXT NOT NULL CHECK(currency='NGN'),amount_minor BIGINT NOT NULL,
 verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(provider,merchant_id,payment_id)
);
CREATE TABLE premium_entitlements(
 id BIGSERIAL PRIMARY KEY,order_id UUID NOT NULL UNIQUE REFERENCES premium_receipts(order_id),listener_id BIGINT NOT NULL REFERENCES listeners(id),
 starts_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK(expires_at>starts_at)
);
CREATE INDEX premium_entitlements_valid ON premium_entitlements(listener_id,starts_at,expires_at);
CREATE TABLE premium_commissions(
 order_id UUID NOT NULL REFERENCES premium_receipts(order_id),beneficiary_id BIGINT NOT NULL REFERENCES creators(id),level SMALLINT NOT NULL CHECK(level IN(1,2)),
 percent INTEGER NOT NULL CHECK((level=1 AND percent=10) OR (level=2 AND percent=5)),amount_minor BIGINT NOT NULL CHECK(amount_minor>0),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(order_id,level),UNIQUE(order_id,beneficiary_id)
);
CREATE TABLE premium_payment_costs(
 order_id UUID NOT NULL REFERENCES premium_receipts(order_id),revision INTEGER NOT NULL CHECK(revision>0),fees_minor BIGINT NOT NULL CHECK(fees_minor>=0),tax_minor BIGINT NOT NULL CHECK(tax_minor>=0),
 evidence TEXT NOT NULL CHECK(length(evidence) BETWEEN 10 AND 1000),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(order_id,revision)
);
CREATE TABLE premium_reversals(
 order_id UUID PRIMARY KEY REFERENCES premium_receipts(order_id),provider TEXT NOT NULL,merchant_id TEXT NOT NULL,refund_id TEXT NOT NULL,
 amount_minor BIGINT NOT NULL CHECK(amount_minor>0),reason TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(provider,merchant_id,refund_id)
);
CREATE TABLE premium_payment_reviews(order_id UUID PRIMARY KEY REFERENCES premium_receipts(order_id),reason TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE premium_playback(
 id UUID PRIMARY KEY,listener_id BIGINT NOT NULL REFERENCES listeners(id),track_id BIGINT NOT NULL REFERENCES music_tracks(id),artist_id BIGINT NOT NULL REFERENCES creators(id),
 entitlement_id BIGINT NOT NULL REFERENCES premium_entitlements(id),started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),last_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 last_position DOUBLE PRECISION NOT NULL DEFAULT 0,sequence INTEGER NOT NULL DEFAULT 0,listened_ms INTEGER NOT NULL DEFAULT 0 CHECK(listened_ms>=0),qualified_at TIMESTAMPTZ
);
CREATE TABLE premium_playback_active(listener_id BIGINT PRIMARY KEY REFERENCES listeners(id),playback_id UUID NOT NULL REFERENCES premium_playback(id));
CREATE TABLE premium_streams(
 id BIGSERIAL PRIMARY KEY,playback_id UUID NOT NULL UNIQUE REFERENCES premium_playback(id),listener_id BIGINT NOT NULL REFERENCES listeners(id),
 track_id BIGINT NOT NULL REFERENCES music_tracks(id),artist_id BIGINT NOT NULL REFERENCES creators(id),entitlement_id BIGINT NOT NULL REFERENCES premium_entitlements(id),
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),listened_ms INTEGER NOT NULL CHECK(listened_ms>=30000),policy_version TEXT NOT NULL DEFAULT 'premium-v1'
);
CREATE INDEX premium_streams_month ON premium_streams(occurred_at,artist_id,track_id);
CREATE INDEX premium_streams_listener ON premium_streams(listener_id,occurred_at DESC);
CREATE TABLE premium_stream_exclusions(stream_id BIGINT PRIMARY KEY REFERENCES premium_streams(id),reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE royalty_statements(
 id UUID PRIMARY KEY,month TEXT NOT NULL CHECK(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),currency TEXT NOT NULL CHECK(currency='NGN'),mode TEXT NOT NULL CHECK(mode IN('test','live')),
 snapshot_hash TEXT NOT NULL,snapshot JSONB NOT NULL,review_note TEXT NOT NULL CHECK(length(review_note) BETWEEN 10 AND 1000),
 gross_minor BIGINT NOT NULL,refund_minor BIGINT NOT NULL,tax_minor BIGINT NOT NULL,fees_minor BIGINT NOT NULL,commissions_minor BIGINT NOT NULL,
 rounding_minor BIGINT NOT NULL,net_minor BIGINT NOT NULL CHECK(net_minor>=0),artist_pool_minor BIGINT NOT NULL CHECK(artist_pool_minor>=0),platform_minor BIGINT NOT NULL CHECK(platform_minor>=0),
 stream_count BIGINT NOT NULL CHECK(stream_count>=0),undistributed_minor BIGINT NOT NULL CHECK(undistributed_minor>=0),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(month,currency,mode),CHECK(artist_pool_minor+platform_minor=net_minor)
);
CREATE TABLE royalty_allocations(
 statement_id UUID NOT NULL REFERENCES royalty_statements(id),track_id BIGINT NOT NULL REFERENCES music_tracks(id),artist_id BIGINT NOT NULL REFERENCES creators(id),
 stream_count BIGINT NOT NULL CHECK(stream_count>0),amount_minor BIGINT NOT NULL CHECK(amount_minor>=0),PRIMARY KEY(statement_id,track_id,artist_id)
);
CREATE TABLE royalty_recovery_holds(
 id BIGSERIAL PRIMARY KEY,order_id UUID NOT NULL REFERENCES premium_reversals(order_id),statement_id UUID NOT NULL REFERENCES royalty_statements(id),artist_id BIGINT NOT NULL REFERENCES creators(id),
 amount_minor BIGINT NOT NULL CHECK(amount_minor>0),resolution TEXT NOT NULL CHECK(resolution IN('unsettled_reversed','recovery_required')),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(order_id,statement_id,artist_id)
);
CREATE TABLE royalty_adjustments(
 order_id UUID NOT NULL REFERENCES premium_reversals(order_id),statement_id UUID NOT NULL REFERENCES royalty_statements(id),artist_reduction_minor BIGINT NOT NULL CHECK(artist_reduction_minor>=0),
 carry_reduction_minor BIGINT NOT NULL CHECK(carry_reduction_minor>=0),reason TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(order_id,statement_id)
);
CREATE TABLE royalty_period_fences(month TEXT NOT NULL,mode TEXT NOT NULL,PRIMARY KEY(month,mode));
CREATE TRIGGER premium_orders_immutable BEFORE UPDATE OR DELETE ON premium_orders FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER premium_receipts_immutable BEFORE UPDATE OR DELETE ON premium_receipts FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER premium_entitlements_immutable BEFORE UPDATE OR DELETE ON premium_entitlements FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER premium_commissions_immutable BEFORE UPDATE OR DELETE ON premium_commissions FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER premium_costs_immutable BEFORE UPDATE OR DELETE ON premium_payment_costs FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER premium_reversals_immutable BEFORE UPDATE OR DELETE ON premium_reversals FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER premium_reviews_immutable BEFORE UPDATE OR DELETE ON premium_payment_reviews FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER premium_streams_immutable BEFORE UPDATE OR DELETE ON premium_streams FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER premium_exclusions_immutable BEFORE UPDATE OR DELETE ON premium_stream_exclusions FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER royalty_statements_immutable BEFORE UPDATE OR DELETE ON royalty_statements FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER royalty_allocations_immutable BEFORE UPDATE OR DELETE ON royalty_allocations FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER royalty_holds_immutable BEFORE UPDATE OR DELETE ON royalty_recovery_holds FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER royalty_adjustments_immutable BEFORE UPDATE OR DELETE ON royalty_adjustments FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();

CREATE TABLE premium_policy_settings(id INTEGER PRIMARY KEY CHECK(id=1),cutover_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),policy_evidence TEXT NOT NULL DEFAULT 'Owner confirmed on 2026-10-25: no binding 60% streaming commitments; new subscription-funded streaming uses universal 50%.');
INSERT INTO premium_policy_settings(id) VALUES(1);
CREATE TABLE play_audience_classifications(event_id BIGINT PRIMARY KEY REFERENCES music_play_events(id),audience TEXT NOT NULL CHECK(audience IN('free','premium')),entitlement_id BIGINT REFERENCES premium_entitlements(id),CHECK((audience='premium')=(entitlement_id IS NOT NULL)));
CREATE FUNCTION lae_classify_play_audience() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE paid BIGINT;
BEGIN
 IF NEW.listener_id IS NOT NULL THEN SELECT e.id INTO paid FROM premium_entitlements e WHERE e.listener_id=NEW.listener_id AND e.starts_at<=NEW.received_at AND e.expires_at>NEW.received_at AND NOT EXISTS(SELECT 1 FROM premium_reversals r WHERE r.order_id=e.order_id) ORDER BY e.expires_at DESC LIMIT 1; END IF;
 INSERT INTO play_audience_classifications(event_id,audience,entitlement_id) VALUES(NEW.id,CASE WHEN paid IS NULL THEN 'free' ELSE 'premium' END,paid);
 RETURN NULL;
END $$;
CREATE TRIGGER play_audience_classify AFTER INSERT ON music_play_events FOR EACH ROW EXECUTE FUNCTION lae_classify_play_audience();
CREATE TRIGGER play_audience_immutable BEFORE UPDATE OR DELETE ON play_audience_classifications FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();

CREATE INDEX premium_entitlements_period ON premium_entitlements(starts_at,expires_at);
CREATE INDEX royalty_allocations_artist ON royalty_allocations(artist_id,statement_id);
CREATE INDEX royalty_holds_artist ON royalty_recovery_holds(artist_id,id DESC);
CREATE FUNCTION lae_premium_attempt_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Premium checkout history cannot be deleted'; END IF;
 IF ROW(NEW.id,NEW.order_id,NEW.provider,NEW.merchant_id,NEW.mode,NEW.reference,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.order_id,OLD.provider,OLD.merchant_id,OLD.mode,OLD.reference,OLD.created_at) OR OLD.benefit_hold AND NOT NEW.benefit_hold THEN RAISE EXCEPTION 'Premium checkout binding is immutable'; END IF;
 IF OLD.status='review' AND NEW.status NOT IN('review','paid') OR OLD.status='paid' AND NEW.status NOT IN('paid','review') THEN RAISE EXCEPTION 'Premium checkout cannot be reinitialized'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER premium_attempt_guard BEFORE UPDATE OR DELETE ON premium_attempts FOR EACH ROW EXECUTE FUNCTION lae_premium_attempt_guard();
CREATE FUNCTION lae_premium_receipt_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM premium_orders o JOIN premium_attempts a ON a.order_id=o.id WHERE o.id=NEW.order_id AND o.currency=NEW.currency AND o.amount_minor=NEW.amount_minor AND a.provider=NEW.provider AND a.merchant_id=NEW.merchant_id AND a.mode=NEW.mode AND NOT a.benefit_hold) THEN RAISE EXCEPTION 'Premium receipt must match the immutable order and checkout'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER premium_receipt_guard BEFORE INSERT ON premium_receipts FOR EACH ROW EXECUTE FUNCTION lae_premium_receipt_guard();
CREATE FUNCTION lae_premium_term_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM premium_orders o WHERE o.id=NEW.order_id AND o.listener_id=NEW.listener_id AND EXTRACT(EPOCH FROM NEW.expires_at-NEW.starts_at)=o.days::bigint*86400) THEN RAISE EXCEPTION 'Premium term must preserve the purchased owner and exact duration'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER premium_term_guard BEFORE INSERT ON premium_entitlements FOR EACH ROW EXECUTE FUNCTION lae_premium_term_guard();
ALTER TABLE premium_entitlements ADD CONSTRAINT premium_entitlement_owner UNIQUE(id,listener_id);
ALTER TABLE premium_playback ADD CONSTRAINT premium_playback_entitlement_owner FOREIGN KEY(entitlement_id,listener_id) REFERENCES premium_entitlements(id,listener_id);
ALTER TABLE premium_playback ADD CONSTRAINT premium_playback_identity UNIQUE(id,listener_id,track_id,artist_id,entitlement_id);
ALTER TABLE premium_streams ADD CONSTRAINT premium_stream_identity FOREIGN KEY(playback_id,listener_id,track_id,artist_id,entitlement_id) REFERENCES premium_playback(id,listener_id,track_id,artist_id,entitlement_id);
CREATE TABLE royalty_funding_sources(
 order_id UUID PRIMARY KEY REFERENCES premium_receipts(order_id),provider TEXT NOT NULL,merchant_id TEXT NOT NULL,payment_id TEXT NOT NULL,
 settlement_reference TEXT NOT NULL,currency TEXT NOT NULL CHECK(currency='NGN'),received_minor BIGINT NOT NULL CHECK(received_minor>0),evidence_hash TEXT NOT NULL,
 verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(provider,merchant_id,payment_id)
);
CREATE TABLE royalty_funding_consumptions(statement_id UUID NOT NULL REFERENCES royalty_statements(id),order_id UUID NOT NULL REFERENCES royalty_funding_sources(order_id),amount_minor BIGINT NOT NULL CHECK(amount_minor>=0),PRIMARY KEY(statement_id,order_id));
CREATE TABLE royalty_cash_releases(statement_id UUID PRIMARY KEY REFERENCES royalty_statements(id),amount_minor BIGINT NOT NULL CHECK(amount_minor>=0),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TRIGGER royalty_funding_sources_immutable BEFORE UPDATE OR DELETE ON royalty_funding_sources FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER royalty_consumptions_immutable BEFORE UPDATE OR DELETE ON royalty_funding_consumptions FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER royalty_cash_releases_immutable BEFORE UPDATE OR DELETE ON royalty_cash_releases FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
