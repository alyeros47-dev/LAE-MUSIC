-- Additive USD reference data and immutable local presentment quotes. No balances are converted.
CREATE TABLE currency_rate_snapshots (
 id UUID PRIMARY KEY, source TEXT NOT NULL, as_of TIMESTAMPTZ NOT NULL,
 next_update TIMESTAMPTZ NOT NULL, rates JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(source,as_of),
 CHECK(next_update>as_of), CHECK(rates->>'USD'='1')
);
CREATE TABLE payment_checkout_quotes (
 id UUID PRIMARY KEY, order_id UUID NOT NULL REFERENCES commerce_orders(id),
 provider TEXT NOT NULL CHECK(provider IN ('paystack','flutterwave')),
 base_currency TEXT NOT NULL CHECK(base_currency='USD'), base_minor BIGINT NOT NULL CHECK(base_minor>0),
 charge_currency TEXT NOT NULL CHECK(charge_currency ~ '^[A-Z]{3}$'), charge_minor BIGINT NOT NULL CHECK(charge_minor>0),
 rate_snapshot_id UUID REFERENCES currency_rate_snapshots(id),
 expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(charge_currency='USD' OR rate_snapshot_id IS NOT NULL),
 CHECK(charge_currency<>'USD' OR charge_minor=base_minor), CHECK(expires_at>created_at)
);
CREATE INDEX idx_checkout_quotes_order ON payment_checkout_quotes(order_id,created_at DESC);
CREATE TRIGGER currency_snapshots_immutable BEFORE UPDATE OR DELETE ON currency_rate_snapshots FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER checkout_quotes_immutable BEFORE UPDATE OR DELETE ON payment_checkout_quotes FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE UNIQUE INDEX idx_order_quoted_price ON commerce_orders(id,currency,amount_minor);
ALTER TABLE payment_checkout_quotes ADD CONSTRAINT checkout_quote_base_price_fk
 FOREIGN KEY(order_id,base_currency,base_minor) REFERENCES commerce_orders(id,currency,amount_minor);
