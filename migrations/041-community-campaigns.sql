-- Additive campaign-only storage. No customer, music or financial records change.
CREATE TABLE community_campaign_settings (
 slug TEXT PRIMARY KEY CHECK(slug ~ '^[a-z0-9-]{1,60}$'),
 invitation_url TEXT NOT NULL DEFAULT '',
 pixel_id TEXT NOT NULL DEFAULT '' CHECK(pixel_id='' OR pixel_id ~ '^[0-9]{5,25}$'),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE community_campaign_daily (
 slug TEXT NOT NULL REFERENCES community_campaign_settings(slug),
 day DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,
 attribution JSONB NOT NULL DEFAULT '{}',
 visits BIGINT NOT NULL DEFAULT 0 CHECK(visits>=0),
 clicks BIGINT NOT NULL DEFAULT 0 CHECK(clicks>=0),
 PRIMARY KEY(slug,day,attribution)
);
CREATE TABLE community_campaign_clicks (
 token_hash CHAR(64) PRIMARY KEY,
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX community_campaign_clicks_expiry ON community_campaign_clicks(expires_at);
