-- Additive: future verified sales only. Preserve all previous direct/indirect commissions.
CREATE TABLE partner_policy_settings(id INTEGER PRIMARY KEY CHECK(id=1),revision TEXT NOT NULL,cutover_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO partner_policy_settings(id,revision) VALUES(1,'owner-direct-quarterly-2026-10-28');
CREATE TRIGGER partner_policy_settings_immutable BEFORE UPDATE OR DELETE ON partner_policy_settings FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
ALTER TABLE premium_orders ADD COLUMN affiliate_policy_revision TEXT NOT NULL DEFAULT 'legacy-premium-10-5';
CREATE TABLE premium_quarterly_team_sales(
 order_id UUID PRIMARY KEY REFERENCES premium_receipts(order_id),
 direct_referrer_id BIGINT NOT NULL REFERENCES creators(id),team_leader_id BIGINT NOT NULL REFERENCES creators(id),
 usd_minor BIGINT NOT NULL CHECK(usd_minor>0),reserved_minor BIGINT NOT NULL CHECK(reserved_minor=(usd_minor+9)/10),
 policy_revision TEXT NOT NULL CHECK(policy_revision='owner-direct-quarterly-2026-10-28'),
 verified_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(direct_referrer_id<>team_leader_id)
);
CREATE INDEX idx_premium_quarterly_leader ON premium_quarterly_team_sales(team_leader_id,verified_at);
CREATE TABLE studio_quarterly_team_sales(
 order_id UUID PRIMARY KEY REFERENCES commerce_receipts(order_id),buyer_id BIGINT NOT NULL REFERENCES creators(id),
 direct_referrer_id BIGINT NOT NULL REFERENCES creators(id),team_leader_id BIGINT REFERENCES creators(id),
 usd_minor BIGINT NOT NULL CHECK(usd_minor>0),policy_revision TEXT NOT NULL CHECK(policy_revision='owner-direct-quarterly-2026-10-28'),
 verified_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(buyer_id<>direct_referrer_id),CHECK(team_leader_id IS NULL OR (team_leader_id<>direct_referrer_id AND team_leader_id<>buyer_id))
);
CREATE INDEX idx_studio_quarterly_leader ON studio_quarterly_team_sales(team_leader_id,verified_at);
CREATE TRIGGER premium_quarterly_sales_immutable BEFORE UPDATE OR DELETE ON premium_quarterly_team_sales FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER studio_quarterly_sales_immutable BEFORE UPDATE OR DELETE ON studio_quarterly_team_sales FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();

CREATE TABLE partner_bonus_statements(
 id UUID PRIMARY KEY,leader_id BIGINT NOT NULL REFERENCES creators(id),period TEXT NOT NULL CHECK(period ~ '^20[0-9]{2}-Q[1-4]$'),
 mode TEXT NOT NULL CHECK(mode IN ('test','live')),currency TEXT NOT NULL CHECK(currency='USD'),
 basis_minor BIGINT NOT NULL CHECK(basis_minor>0),bonus_minor BIGINT NOT NULL CHECK(bonus_minor>0),
 snapshot_hash TEXT NOT NULL,snapshot JSONB NOT NULL,review_note TEXT NOT NULL CHECK(length(review_note) BETWEEN 10 AND 1000),
 actor_id TEXT NOT NULL,policy_revision TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(leader_id,period,mode)
);
CREATE TABLE partner_bonus_allocations(
 statement_id UUID NOT NULL REFERENCES partner_bonus_statements(id),order_id UUID NOT NULL,
 source TEXT NOT NULL CHECK(source IN ('artist','premium','studio')),basis_minor BIGINT NOT NULL CHECK(basis_minor>0),
 bonus_minor BIGINT NOT NULL CHECK(bonus_minor>=0),reserved_minor BIGINT NOT NULL CHECK(reserved_minor>=0),
 PRIMARY KEY(statement_id,order_id),UNIQUE(order_id)
);
CREATE TRIGGER partner_bonus_statements_immutable BEFORE UPDATE OR DELETE ON partner_bonus_statements FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER partner_bonus_allocations_immutable BEFORE UPDATE OR DELETE ON partner_bonus_allocations FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE partner_bonus_review_holds(
 statement_id UUID NOT NULL REFERENCES partner_bonus_statements(id),order_id UUID NOT NULL,
 reason TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(statement_id,order_id)
);
CREATE TRIGGER partner_bonus_holds_immutable BEFORE UPDATE OR DELETE ON partner_bonus_review_holds FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE commerce_order_referral_snapshots(
 order_id UUID PRIMARY KEY REFERENCES commerce_orders(id),direct_referrer_id BIGINT REFERENCES creators(id),team_leader_id BIGINT REFERENCES creators(id),
 policy_revision TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(direct_referrer_id IS NOT NULL OR team_leader_id IS NULL),CHECK(team_leader_id IS NULL OR team_leader_id<>direct_referrer_id)
);
CREATE TRIGGER order_referral_snapshots_immutable BEFORE UPDATE OR DELETE ON commerce_order_referral_snapshots FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
