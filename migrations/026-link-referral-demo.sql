-- Additive: examples only. No real account, entitlement, payment or earnings table is changed.
CREATE TABLE referral_demo_sessions(
 token_hash CHAR(64) PRIMARY KEY,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '30 days'
);
CREATE TABLE referral_demo_flows(
 id UUID PRIMARY KEY,
 session_hash CHAR(64) NOT NULL REFERENCES referral_demo_sessions(token_hash),
 request_key VARCHAR(100) NOT NULL,
 owner_id BIGINT REFERENCES creators(id),
 parent_id UUID REFERENCES referral_demo_flows(id),
 depth INTEGER NOT NULL CHECK(depth BETWEEN 1 AND 10),
 plan TEXT NOT NULL CHECK(plan IN ('starter','growth','professional')),
 base_minor INTEGER NOT NULL CHECK(base_minor>0),
 direct_percent INTEGER NOT NULL CHECK(direct_percent IN (15,25)),
 status TEXT NOT NULL DEFAULT 'pending_demo' CHECK(status IN ('pending_demo','paid_demo','failed_demo','refunded_demo')),
 display_name TEXT,
 public_ref UUID NOT NULL UNIQUE,
 paid_at TIMESTAMPTZ,
 profile_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '30 days',
 UNIQUE(session_hash,request_key),
 CHECK((profile_at IS NULL AND display_name IS NULL) OR (profile_at IS NOT NULL AND display_name IS NOT NULL AND paid_at IS NOT NULL))
);
CREATE INDEX referral_demo_owner_date ON referral_demo_flows(owner_id,created_at);
CREATE INDEX referral_demo_session_date ON referral_demo_flows(session_hash,created_at);
CREATE TABLE referral_demo_allocations(
 order_id UUID NOT NULL REFERENCES referral_demo_flows(id),
 kind TEXT NOT NULL CHECK(kind IN ('direct','team')),
 recipient_artist_id BIGINT REFERENCES creators(id),
 recipient_flow_id UUID REFERENCES referral_demo_flows(id),
 percent INTEGER NOT NULL CHECK(percent IN (10,15,25)),
 amount_minor INTEGER NOT NULL CHECK(amount_minor>=0),
 period TEXT NOT NULL CHECK(period ~ '^20[0-9]{2}-Q[1-4]$'),
 state TEXT NOT NULL DEFAULT 'example' CHECK(state IN ('example','reversed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(order_id,kind),
 CHECK((recipient_artist_id IS NOT NULL)::integer+(recipient_flow_id IS NOT NULL)::integer=1)
);
CREATE INDEX referral_demo_artist ON referral_demo_allocations(recipient_artist_id,created_at);
CREATE INDEX referral_demo_profile ON referral_demo_allocations(recipient_flow_id,created_at);
