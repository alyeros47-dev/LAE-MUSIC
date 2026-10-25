-- Additive account security. Existing identities, passwords and sessions are preserved.
ALTER TABLE creators ADD COLUMN email_verified_at TIMESTAMPTZ;
ALTER TABLE listeners ADD COLUMN email_verified_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN security_id BIGSERIAL UNIQUE;
ALTER TABLE listener_sessions ADD COLUMN security_id BIGSERIAL UNIQUE;
ALTER TABLE sessions ADD COLUMN created_at TIMESTAMPTZ;
ALTER TABLE listener_sessions ADD COLUMN created_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN client_label TEXT NOT NULL DEFAULT 'Existing session';
ALTER TABLE listener_sessions ADD COLUMN client_label TEXT NOT NULL DEFAULT 'Existing session';
CREATE INDEX idx_sessions_owner_expiry ON sessions(creator_id,expires_at);
CREATE INDEX idx_listener_sessions_owner_expiry ON listener_sessions(listener_id,expires_at);
CREATE TABLE account_security_rates (
 bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL CHECK(attempts>0),
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_account_security_rates_expiry ON account_security_rates(expires_at);
CREATE TABLE account_action_tokens (
 token_hash TEXT PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 role TEXT NOT NULL CHECK(role IN ('artist','listener')),
 creator_id BIGINT REFERENCES creators(id), listener_id BIGINT REFERENCES listeners(id),
 purpose TEXT NOT NULL CHECK(purpose IN ('reset_password','verify_email')),
 credential_fingerprint TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL,
 consumed_at TIMESTAMPTZ,
 delivery_state TEXT NOT NULL DEFAULT 'pending' CHECK(delivery_state IN ('pending','accepted','uncertain')),
 CHECK((role='artist' AND creator_id IS NOT NULL AND listener_id IS NULL) OR (role='listener' AND listener_id IS NOT NULL AND creator_id IS NULL)),
 CHECK(expires_at>created_at)
);
CREATE INDEX idx_account_tokens_creator ON account_action_tokens(creator_id,purpose,expires_at) WHERE consumed_at IS NULL;
CREATE INDEX idx_account_tokens_listener ON account_action_tokens(listener_id,purpose,expires_at) WHERE consumed_at IS NULL;
CREATE TABLE account_email_outbox (
 id UUID PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE REFERENCES account_action_tokens(token_hash) ON DELETE CASCADE,
 sealed_payload TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','uncertain','skipped')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), claimed_at TIMESTAMPTZ, finished_at TIMESTAMPTZ
);
CREATE INDEX idx_account_email_queue ON account_email_outbox(created_at) WHERE status='queued';
