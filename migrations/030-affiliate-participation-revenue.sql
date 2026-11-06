-- Additive: new decisions apply prospectively. All earlier receipts, rates and earned obligations remain intact.
CREATE TABLE affiliate_participation_events(
 id UUID PRIMARY KEY,artist_id BIGINT NOT NULL REFERENCES creators(id),mode TEXT NOT NULL CHECK(mode IN('test','live')),
 participating BOOLEAN NOT NULL,policy_revision TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX affiliate_participation_latest ON affiliate_participation_events(artist_id,mode,created_at DESC);
CREATE TRIGGER affiliate_participation_immutable BEFORE UPDATE OR DELETE ON affiliate_participation_events FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE affiliate_purchase_opportunities(
 id UUID PRIMARY KEY,artist_order_id UUID UNIQUE REFERENCES commerce_orders(id),premium_order_id UUID UNIQUE REFERENCES premium_orders(id),
 direct_referrer_id BIGINT REFERENCES creators(id),buyer_artist_id BIGINT REFERENCES creators(id),buyer_listener_id BIGINT REFERENCES listeners(id),
 mode TEXT NOT NULL CHECK(mode IN('test','live')),policy_revision TEXT NOT NULL,
 currency TEXT NOT NULL CHECK(currency='USD'),gross_minor BIGINT NOT NULL CHECK(gross_minor>0),
 eligibility_snapshot JSONB NOT NULL,allocation_status TEXT NOT NULL CHECK(allocation_status='pending_decisions'),
 verified_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK((artist_order_id IS NULL)<>(premium_order_id IS NULL)),CHECK((buyer_artist_id IS NULL)<>(buyer_listener_id IS NULL))
);
CREATE INDEX affiliate_opportunities_referrer ON affiliate_purchase_opportunities(direct_referrer_id,verified_at DESC);
CREATE TRIGGER affiliate_opportunities_immutable BEFORE UPDATE OR DELETE ON affiliate_purchase_opportunities FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
INSERT INTO partner_policy_revisions(revision,document) VALUES('affiliate-opt-in-premium30-2026-11-05','{"registration_free":true,"participation_optional":true,"eligibility_expires":false,"qualifying_listener_days":90,"qualifying_listener_usd_minor":180,"qualifying_artist_usd_minor":600,"premium_affiliate_and_team_percent":30,"remaining_percent":70,"artist_percent_of_remaining":50,"platform_percent_of_remaining":50,"individual_rates":null,"team_rules":null,"artist_generation_rules":null,"new_allocations_enabled":false}');
-- Per-receipt overlays stop an older unpaid order from activating superseded rules.
-- They do not rewrite its price, allowance, original attribution or any earlier earned receipt.
CREATE TABLE affiliate_receipt_policies(
 artist_order_id UUID UNIQUE REFERENCES commerce_receipts(order_id),premium_order_id UUID UNIQUE REFERENCES premium_receipts(order_id),
 policy_revision TEXT NOT NULL CHECK(policy_revision='affiliate-opt-in-premium30-2026-11-05'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),CHECK((artist_order_id IS NULL)<>(premium_order_id IS NULL))
);
CREATE TRIGGER affiliate_receipt_policy_immutable BEFORE UPDATE OR DELETE ON affiliate_receipt_policies FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE FUNCTION lae_pending_premium_commission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM premium_orders WHERE id=NEW.order_id AND affiliate_policy_revision='affiliate-opt-in-premium30-2026-11-05') OR EXISTS(SELECT 1 FROM affiliate_receipt_policies WHERE premium_order_id=NEW.order_id) THEN RAISE EXCEPTION 'Individual Premium commissions and team rewards await approved rules'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pending_premium_commission_guard BEFORE INSERT ON premium_commissions FOR EACH ROW EXECUTE FUNCTION lae_pending_premium_commission_guard();
CREATE TRIGGER pending_premium_team_guard BEFORE INSERT ON premium_quarterly_team_sales FOR EACH ROW EXECUTE FUNCTION lae_pending_premium_commission_guard();
CREATE FUNCTION lae_pending_artist_commission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM commerce_orders o JOIN commerce_order_referral_snapshots s ON s.order_id=o.id WHERE o.subscription_id=NEW.subscription_id AND (s.policy_revision='affiliate-opt-in-premium30-2026-11-05' OR EXISTS(SELECT 1 FROM affiliate_receipt_policies p WHERE p.artist_order_id=o.id))) THEN RAISE EXCEPTION 'New artist commission allocations await approved rules'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER pending_artist_commission_guard AFTER INSERT ON affiliate_subscription_commissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lae_pending_artist_commission_guard();
