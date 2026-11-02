-- Additive forward-only product/policy revision. Existing orders, receipts and earnings
-- retain their original pricing and commission contracts; no data is rewritten.
DO $$
DECLARE item record;
BEGIN
 FOR item IN SELECT conrelid::regclass AS tab,conname FROM pg_constraint WHERE contype='c' AND (
  (conrelid='premium_orders'::regclass AND (pg_get_constraintdef(oid) LIKE '%plan%' OR pg_get_constraintdef(oid) LIKE '%days%')) OR
  (conrelid='premium_commissions'::regclass AND pg_get_constraintdef(oid) LIKE '%percent%') OR
  (conrelid='premium_quarterly_team_sales'::regclass AND (pg_get_constraintdef(oid) LIKE '%reserved_minor%' OR pg_get_constraintdef(oid) LIKE '%policy_revision%')) OR
  (conrelid='studio_quarterly_team_sales'::regclass AND pg_get_constraintdef(oid) LIKE '%policy_revision%')
 ) LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.tab,item.conname); END LOOP;
END $$;
ALTER TABLE premium_orders ADD CONSTRAINT premium_orders_plan_check CHECK(plan IN('daily','weekly','monthly','two_month','quarterly','annual'));
ALTER TABLE premium_orders ADD CONSTRAINT premium_orders_days_check CHECK(days IN(1,7,30,60,90,365));
ALTER TABLE premium_commissions ADD CONSTRAINT premium_commissions_contract_rate CHECK((level=1 AND percent IN(10,20)) OR (level=2 AND percent=5));
ALTER TABLE premium_quarterly_team_sales ADD CONSTRAINT premium_team_contract_reserve CHECK(
 (policy_revision='owner-quarterly-premium5-2026-10-28' AND reserved_minor=(usd_minor+19)/20) OR
 (policy_revision='purchase-year-premium20-team10-2026-11-02' AND reserved_minor=(usd_minor+9)/10));
ALTER TABLE studio_quarterly_team_sales ADD CONSTRAINT studio_team_contract_revision CHECK(policy_revision IN('owner-quarterly-premium5-2026-10-28','purchase-year-premium20-team10-2026-11-02'));
CREATE TABLE partner_policy_revisions(revision TEXT PRIMARY KEY,activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),document JSONB NOT NULL);
INSERT INTO partner_policy_revisions(revision,document) VALUES('purchase-year-premium20-team10-2026-11-02','{"premium_direct_percent":20,"premium_quarterly_team_percent":10,"team_depth":2,"qualifying_premium_days":90,"qualifying_premium_usd_minor":180,"qualifying_artist_usd_minor":600,"window":"one calendar year from the affiliate qualifying purchase","historical_contracts":"preserved"}');
CREATE TRIGGER partner_revisions_immutable BEFORE UPDATE OR DELETE ON partner_policy_revisions FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE FUNCTION lae_premium_commission_contract_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE purchase premium_orders;
BEGIN
 SELECT * INTO purchase FROM premium_orders WHERE id=NEW.order_id;
 IF purchase.affiliate_policy_revision='purchase-year-premium20-team10-2026-11-02' AND
 (NEW.level<>1 OR NEW.percent<>20 OR NEW.beneficiary_id IS DISTINCT FROM purchase.referrer_id OR NEW.amount_minor<>(purchase.amount_minor*20+50)/100)
 THEN RAISE EXCEPTION 'New Premium commission must match its immutable 20 percent direct contract'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER premium_commission_contract_guard BEFORE INSERT ON premium_commissions FOR EACH ROW EXECUTE FUNCTION lae_premium_commission_contract_guard();
