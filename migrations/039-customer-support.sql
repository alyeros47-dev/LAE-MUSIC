-- Additive support-only storage. No account, payment, music or financial changes.
CREATE TABLE IF NOT EXISTS customer_support_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), enabled BOOLEAN NOT NULL DEFAULT TRUE,
 whatsapp_number TEXT NOT NULL DEFAULT '', daily_request_limit INTEGER NOT NULL DEFAULT 120 CHECK(daily_request_limit BETWEEN 1 AND 1000),
 daily_token_limit INTEGER NOT NULL DEFAULT 600000 CHECK(daily_token_limit BETWEEN 10000 AND 10000000),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO customer_support_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS customer_support_requests (
 request_id UUID PRIMARY KEY, visitor_hash CHAR(64) NOT NULL, ip_hash CHAR(64) NOT NULL,
 payload_hash CHAR(64) NOT NULL, usage_day DATE NOT NULL DEFAULT CURRENT_DATE,
 reserved_tokens INTEGER NOT NULL CHECK(reserved_tokens>0), used_tokens INTEGER CHECK(used_tokens>=0),
 input_tokens INTEGER, output_tokens INTEGER, provider_model TEXT,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','completed','uncertain')),
 reply_cipher TEXT, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customer_support_requests_day ON customer_support_requests(usage_day);
CREATE INDEX IF NOT EXISTS customer_support_requests_client ON customer_support_requests(visitor_hash,created_at DESC);
CREATE INDEX IF NOT EXISTS customer_support_requests_ip ON customer_support_requests(ip_hash,created_at DESC);
