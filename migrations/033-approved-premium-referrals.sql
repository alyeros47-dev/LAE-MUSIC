-- Additive: the owner approved Premium-only 20% direct and 10% depth-two
-- quarterly rewards. Preserve every earlier receipt and held artist allocation.
INSERT INTO partner_policy_revisions(revision,document) VALUES('premium-opt-in20-team10-2026-11-06','{"premium_direct_percent":20,"premium_quarterly_team_percent":10,"team_depth":2,"participation_optional":true,"eligibility_expires":false,"renewals_qualify":true,"christmas_cutoff_day":20,"december_21_31_rollover":true,"artist_and_generation_allocations":"held","historical_contracts":"preserved"}');
ALTER TABLE affiliate_receipt_policies DROP CONSTRAINT affiliate_receipt_policies_policy_revision_check;
ALTER TABLE affiliate_receipt_policies ADD CONSTRAINT affiliate_receipt_policies_policy_revision_check CHECK(policy_revision IN('affiliate-opt-in-premium30-2026-11-05','premium-opt-in20-team10-2026-11-06'));
ALTER TABLE premium_quarterly_team_sales DROP CONSTRAINT premium_team_contract_reserve;
ALTER TABLE premium_quarterly_team_sales ADD CONSTRAINT premium_team_contract_reserve CHECK(
 (policy_revision='owner-quarterly-premium5-2026-10-28' AND reserved_minor=(usd_minor+19)/20) OR
 (policy_revision IN('purchase-year-premium20-team10-2026-11-02','premium-opt-in20-team10-2026-11-06') AND reserved_minor=(usd_minor+9)/10));
CREATE OR REPLACE FUNCTION lae_pending_premium_commission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase premium_orders; revision TEXT;
BEGIN
 SELECT * INTO purchase FROM premium_orders WHERE id=NEW.order_id;
 SELECT COALESCE((SELECT p.policy_revision FROM affiliate_receipt_policies p WHERE p.premium_order_id=NEW.order_id),purchase.affiliate_policy_revision) INTO revision;
 IF revision='affiliate-opt-in-premium30-2026-11-05' THEN RAISE EXCEPTION 'Individual Premium commissions and team rewards await approved rules'; END IF;
 IF revision='premium-opt-in20-team10-2026-11-06' THEN
  IF TG_TABLE_NAME='premium_commissions' THEN
   IF NEW.level<>1 OR NEW.percent<>20 OR NEW.beneficiary_id IS DISTINCT FROM purchase.referrer_id OR NEW.amount_minor<>(purchase.amount_minor*20+50)/100
   THEN RAISE EXCEPTION 'Premium commission must match its approved 20 percent direct referrer'; END IF;
  ELSE
   IF NEW.policy_revision<>revision OR NEW.direct_referrer_id IS DISTINCT FROM purchase.referrer_id OR NEW.team_leader_id IS DISTINCT FROM purchase.indirect_id OR NEW.usd_minor<>purchase.amount_minor
   THEN RAISE EXCEPTION 'Premium team reward must match its approved two-step referral'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
