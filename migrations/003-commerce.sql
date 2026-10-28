-- Additive purchase snapshots and verified evidence are additive; no legacy money is imported.
CREATE TABLE commerce_orders (
 id UUID PRIMARY KEY, artist_id BIGINT NOT NULL REFERENCES creators(id),
 kind TEXT NOT NULL CHECK(kind IN ('artist_subscription','studio_generation')),
 plan TEXT NOT NULL CHECK(plan IN ('starter','growth','professional')),
 currency TEXT NOT NULL CHECK(currency='USD'), amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
 royalty_percent INTEGER NOT NULL CHECK(royalty_percent IN (50,60)),
 direct_referral_percent INTEGER NOT NULL CHECK(direct_referral_percent IN (0,15,25)),
 referral_intent_id BIGINT UNIQUE REFERENCES affiliate_product_intents(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled')),
 subscription_id BIGINT UNIQUE REFERENCES artist_subscriptions(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL,
 paid_at TIMESTAMPTZ, UNIQUE(id,artist_id),
 CHECK((status='paid')=(paid_at IS NOT NULL)),
 CHECK(kind='artist_subscription' OR referral_intent_id IS NULL)
);
CREATE INDEX idx_commerce_owner ON commerce_orders(artist_id,created_at DESC);
CREATE TABLE commerce_receipts (
 order_id UUID PRIMARY KEY REFERENCES commerce_orders(id), provider TEXT NOT NULL,
 merchant_id TEXT NOT NULL, payment_id TEXT NOT NULL, reference TEXT NOT NULL UNIQUE,
 currency TEXT NOT NULL CHECK(currency='USD'), amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
 verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(provider,merchant_id,payment_id)
);
CREATE TABLE commerce_events (
 provider TEXT NOT NULL, event_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
 payment_id TEXT NOT NULL, order_reference TEXT, order_id UUID REFERENCES commerce_orders(id),
 outcome TEXT NOT NULL CHECK(outcome IN ('accepted','duplicate','review')),
 reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(provider,event_id)
);
CREATE INDEX idx_commerce_review ON commerce_events(created_at DESC) WHERE outcome='review';
CREATE TABLE studio_purchased_credits (
 order_id UUID PRIMARY KEY, artist_id BIGINT NOT NULL REFERENCES creators(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(order_id,artist_id),
 FOREIGN KEY(order_id,artist_id) REFERENCES commerce_orders(id,artist_id)
);
ALTER TABLE artist_studio_usage ADD COLUMN purchase_order_id UUID UNIQUE;
ALTER TABLE artist_studio_usage ADD CONSTRAINT studio_usage_purchase_owner_fk
 FOREIGN KEY(purchase_order_id,artist_id) REFERENCES studio_purchased_credits(order_id,artist_id);
CREATE TRIGGER commerce_receipts_immutable BEFORE UPDATE OR DELETE ON commerce_receipts FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER commerce_events_immutable BEFORE UPDATE OR DELETE ON commerce_events FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER studio_purchases_immutable BEFORE UPDATE OR DELETE ON studio_purchased_credits FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE OR REPLACE FUNCTION lae_protect_order_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Purchase history cannot be deleted'; END IF;
 IF (NEW.id,NEW.artist_id,NEW.kind,NEW.plan,NEW.currency,NEW.amount_minor,NEW.royalty_percent,NEW.direct_referral_percent,NEW.referral_intent_id,NEW.created_at,NEW.expires_at)
 IS DISTINCT FROM (OLD.id,OLD.artist_id,OLD.kind,OLD.plan,OLD.currency,OLD.amount_minor,OLD.royalty_percent,OLD.direct_referral_percent,OLD.referral_intent_id,OLD.created_at,OLD.expires_at)
 OR OLD.status<>'pending' THEN RAISE EXCEPTION 'Purchase snapshot is immutable'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER commerce_order_snapshot BEFORE UPDATE OR DELETE ON commerce_orders FOR EACH ROW EXECUTE FUNCTION lae_protect_order_snapshot();
