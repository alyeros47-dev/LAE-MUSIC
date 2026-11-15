-- Additive: approved artist packages only, 20% direct / 10% quarterly depth two.
-- Preserve historical receipts, obligations and held extra-generation allocations.
INSERT INTO partner_policy_revisions(revision,document) VALUES('artist-packages-direct20-team10-2026-11-15','{"products":["starter","growth","professional"],"direct_percent":20,"quarterly_team_percent":10,"team_depth":2,"participation_optional":true,"eligibility_expires":false,"renewals_qualify":true,"christmas_cutoff_day":20,"december_21_31_rollover":true,"extra_generation_allocations":"held","historical_contracts":"preserved"}');
ALTER TABLE commerce_orders DROP CONSTRAINT commerce_orders_direct_referral_percent_check;
ALTER TABLE commerce_orders ADD CONSTRAINT commerce_orders_direct_referral_percent_check CHECK(direct_referral_percent IN(0,15,20,25));
ALTER TABLE affiliate_receipt_policies DROP CONSTRAINT affiliate_receipt_policies_policy_revision_check;
ALTER TABLE affiliate_receipt_policies ADD CONSTRAINT affiliate_receipt_policies_policy_revision_check CHECK(policy_revision IN('affiliate-opt-in-premium30-2026-11-05','premium-opt-in20-team10-2026-11-06','artist-packages-direct20-team10-2026-11-15'));
ALTER TABLE affiliate_receipt_policies ADD CONSTRAINT artist_policy_product_scope CHECK(policy_revision<>'artist-packages-direct20-team10-2026-11-15' OR artist_order_id IS NOT NULL);
CREATE OR REPLACE FUNCTION lae_pending_artist_commission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase record;
BEGIN
 SELECT o.*,s.direct_referrer_id,COALESCE(p.policy_revision,s.policy_revision) AS commission_revision INTO purchase
 FROM commerce_orders o JOIN commerce_order_referral_snapshots s ON s.order_id=o.id LEFT JOIN affiliate_receipt_policies p ON p.artist_order_id=o.id WHERE o.subscription_id=NEW.subscription_id;
 IF purchase.commission_revision='artist-packages-direct20-team10-2026-11-15' THEN
  IF purchase.kind<>'artist_subscription' OR purchase.plan NOT IN('starter','growth','professional') OR NEW.tier<>1 OR NEW.referrer_id IS DISTINCT FROM purchase.direct_referrer_id OR NEW.referred_artist_id<>purchase.artist_id OR NEW.referrer_id=purchase.artist_id OR NEW.amount_cents<>(purchase.amount_minor*20+50)/100
  THEN RAISE EXCEPTION 'Artist commission must match its approved 20 percent direct referrer'; END IF;
 ELSIF purchase.commission_revision='affiliate-opt-in-premium30-2026-11-05' OR EXISTS(SELECT 1 FROM affiliate_receipt_policies p WHERE p.artist_order_id=purchase.id) THEN
  RAISE EXCEPTION 'New artist commission allocations await approved rules';
 END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION lae_artist_package_team_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase record;
BEGIN
 SELECT o.*,s.direct_referrer_id,s.team_leader_id,COALESCE(p.policy_revision,s.policy_revision) AS commission_revision INTO purchase
 FROM commerce_orders o JOIN commerce_order_referral_snapshots s ON s.order_id=o.id LEFT JOIN affiliate_receipt_policies p ON p.artist_order_id=o.id WHERE o.subscription_id=NEW.subscription_id;
 IF purchase.commission_revision='artist-packages-direct20-team10-2026-11-15' AND
 (purchase.kind<>'artist_subscription' OR NEW.affiliate_id IS DISTINCT FROM purchase.direct_referrer_id OR NEW.team_leader_id IS DISTINCT FROM purchase.team_leader_id OR NEW.base_amount_cents<>purchase.amount_minor OR NEW.team_leader_id=NEW.affiliate_id OR NEW.team_leader_id=purchase.artist_id)
 THEN RAISE EXCEPTION 'Artist team reward must match its approved two-step referral'; END IF;
 IF purchase.commission_revision='affiliate-opt-in-premium30-2026-11-05' THEN RAISE EXCEPTION 'Artist team allocation still awaits approved rules'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER artist_package_team_guard AFTER INSERT ON affiliate_team_sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lae_artist_package_team_guard();
CREATE FUNCTION lae_artist_policy_product_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.policy_revision='artist-packages-direct20-team10-2026-11-15' AND NOT EXISTS(
  SELECT 1 FROM commerce_orders o WHERE o.id=NEW.artist_order_id AND o.kind='artist_subscription' AND o.plan IN('starter','growth','professional'))
 THEN RAISE EXCEPTION 'Approved artist policy applies only to artist packages'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER artist_policy_product_guard BEFORE INSERT ON affiliate_receipt_policies FOR EACH ROW EXECUTE FUNCTION lae_artist_policy_product_guard();
