-- Additive: explicit demonstration records. No link to receipts, commissions, wallets or entitlements.
CREATE TABLE partner_practice_sales(
 id UUID PRIMARY KEY,owner_id BIGINT NOT NULL REFERENCES creators(id),
 reference VARCHAR(80) NOT NULL,plan TEXT NOT NULL CHECK(plan IN('starter','growth','professional')),
 base_minor INTEGER NOT NULL CHECK(base_minor>0),commission_minor INTEGER NOT NULL CHECK(commission_minor>=0),
 currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency='USD'),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(owner_id,reference)
);
CREATE INDEX partner_practice_owner_created ON partner_practice_sales(owner_id,created_at DESC);
