-- Additive only. Existing balances are intentionally not imported or revalued.
ALTER TABLE creators ADD COLUMN IF NOT EXISTS bio VARCHAR(1200) NOT NULL DEFAULT '';
ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS rights_confirmed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_listener_sessions_expiry ON listener_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_artist_validity ON artist_subscriptions(artist_id,status,expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_usage_subscription ON artist_studio_usage(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sonic_owner_created ON sonic_test_tasks(creator_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_owner ON affiliate_subscription_commissions(referrer_id,created_at DESC);
CREATE TABLE IF NOT EXISTS platform_audit (
 id BIGSERIAL PRIMARY KEY, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL,
 action TEXT NOT NULL, resource TEXT NOT NULL, details JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit(created_at DESC);
CREATE TABLE IF NOT EXISTS platform_requests (
 scope TEXT NOT NULL, request_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
 result JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(scope,request_key)
);
CREATE TABLE IF NOT EXISTS finance_accounts (
 id TEXT PRIMARY KEY, currency TEXT NOT NULL CHECK(currency IN ('USD','NGN')),
 artist_id BIGINT REFERENCES creators(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(id,currency)
);
CREATE TABLE IF NOT EXISTS finance_journals (
 id BIGSERIAL PRIMARY KEY, reference TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
 payload_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Each row is one balanced transfer, preventing creation of unpaired money entries.
CREATE TABLE IF NOT EXISTS finance_transfers (
 id BIGSERIAL PRIMARY KEY, journal_id BIGINT NOT NULL REFERENCES finance_journals(id),
 debit_account TEXT NOT NULL, credit_account TEXT NOT NULL,
 currency TEXT NOT NULL CHECK(currency IN ('USD','NGN')),
 amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
 CHECK(debit_account<>credit_account),
 FOREIGN KEY(debit_account,currency) REFERENCES finance_accounts(id,currency),
 FOREIGN KEY(credit_account,currency) REFERENCES finance_accounts(id,currency)
);
CREATE INDEX IF NOT EXISTS idx_finance_debit ON finance_transfers(debit_account);
CREATE INDEX IF NOT EXISTS idx_finance_credit ON finance_transfers(credit_account);
CREATE TABLE IF NOT EXISTS finance_payment_events (
 provider TEXT NOT NULL, event_id TEXT NOT NULL, reference TEXT NOT NULL UNIQUE,
 currency TEXT NOT NULL CHECK(currency IN ('USD','NGN')), amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
 payload_hash TEXT NOT NULL, verified_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(provider,event_id)
);
CREATE TABLE IF NOT EXISTS finance_withdrawals (
 id BIGSERIAL PRIMARY KEY, artist_id BIGINT NOT NULL REFERENCES creators(id),
 currency TEXT NOT NULL CHECK(currency IN ('USD','NGN')), gross_minor BIGINT NOT NULL CHECK(gross_minor>=100),
 fee_minor BIGINT NOT NULL CHECK(fee_minor>=0), net_minor BIGINT NOT NULL CHECK(net_minor>0),
 CHECK(gross_minor=fee_minor+net_minor),
 request_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','paid')),
 payout_reference TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ,
 UNIQUE(artist_id,request_key), CHECK(status<>'paid' OR payout_reference IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_owner ON finance_withdrawals(artist_id,created_at DESC);
CREATE TABLE IF NOT EXISTS studio_request_keys (
 artist_id BIGINT NOT NULL REFERENCES creators(id), request_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL, task_reference TEXT NOT NULL, reservation_reference TEXT NOT NULL, result JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(artist_id,request_key)
);
-- Financial history is append-only; corrections require a reversing transfer.
CREATE OR REPLACE FUNCTION lae_reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Financial and audit history is append-only'; END;
$$;
CREATE TRIGGER finance_journals_immutable BEFORE UPDATE OR DELETE ON finance_journals FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER finance_transfers_immutable BEFORE UPDATE OR DELETE ON finance_transfers FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER finance_events_immutable BEFORE UPDATE OR DELETE ON finance_payment_events FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER platform_audit_immutable BEFORE UPDATE OR DELETE ON platform_audit FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();

CREATE INDEX IF NOT EXISTS idx_studio_reservation_owner ON studio_request_keys(artist_id,reservation_reference);
