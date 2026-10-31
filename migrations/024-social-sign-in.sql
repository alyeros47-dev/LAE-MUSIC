-- Additive social identities. Existing users, passwords, sessions and referrals are untouched.
CREATE TABLE IF NOT EXISTS social_identities (
 id UUID PRIMARY KEY,
 provider TEXT NOT NULL CHECK(provider IN ('google','facebook','tiktok')),
 client_id TEXT NOT NULL,
 subject TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('artist','listener')),
 creator_id BIGINT REFERENCES creators(id) ON DELETE CASCADE,
 listener_id BIGINT REFERENCES listeners(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK((role='artist' AND creator_id IS NOT NULL AND listener_id IS NULL) OR (role='listener' AND listener_id IS NOT NULL AND creator_id IS NULL)),
 UNIQUE(provider,client_id,subject,role),
 UNIQUE(provider,client_id,creator_id),
 UNIQUE(provider,client_id,listener_id)
);
CREATE TABLE IF NOT EXISTS social_auth_flows (
 id UUID PRIMARY KEY,
 provider TEXT NOT NULL CHECK(provider IN ('google','facebook','tiktok')),
 client_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('artist','listener')),
 intent TEXT NOT NULL CHECK(intent IN ('signin','register','link')),
 state_hash TEXT NOT NULL UNIQUE,
 browser_hash TEXT NOT NULL,
 verifier TEXT,
 nonce_hash TEXT,
 context JSONB NOT NULL DEFAULT '{}',
 link_owner_id BIGINT,
 link_session_hash TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','exchanging','ready','completed','failed')),
 identity JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '15 minutes',
 CHECK((intent='link' AND link_owner_id IS NOT NULL AND link_session_hash IS NOT NULL) OR (intent<>'link' AND link_owner_id IS NULL AND link_session_hash IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_social_flows_expiry ON social_auth_flows(expires_at);
CREATE INDEX IF NOT EXISTS idx_social_identity_artist ON social_identities(creator_id) WHERE creator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_identity_listener ON social_identities(listener_id) WHERE listener_id IS NOT NULL;
