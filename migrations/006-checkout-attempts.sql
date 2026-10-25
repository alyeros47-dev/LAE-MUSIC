-- Additive payment coordination. Existing paid records and balances are not rewritten.
CREATE UNIQUE INDEX idx_checkout_quote_binding ON payment_checkout_quotes(id,order_id,provider);
CREATE TABLE payment_checkout_attempts (
 id UUID PRIMARY KEY, order_id UUID NOT NULL REFERENCES commerce_orders(id),
 quote_id UUID NOT NULL UNIQUE, provider TEXT NOT NULL CHECK(provider IN ('paystack','flutterwave')),
 merchant_id TEXT NOT NULL, merchant_country TEXT NOT NULL CHECK(merchant_country='NG'),
 mode TEXT NOT NULL CHECK(mode='test'), reference TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'initializing' CHECK(status IN ('initializing','ready','review','paid')),
 checkout_url TEXT, failure_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(order_id), UNIQUE(id,order_id,quote_id),
 FOREIGN KEY(quote_id,order_id,provider) REFERENCES payment_checkout_quotes(id,order_id,provider),
 CHECK(status<>'ready' OR checkout_url IS NOT NULL)
);
CREATE INDEX idx_checkout_attempts_created ON payment_checkout_attempts(created_at DESC);
CREATE TABLE payment_presentments (
 order_id UUID PRIMARY KEY REFERENCES commerce_receipts(order_id), attempt_id UUID NOT NULL UNIQUE,
 quote_id UUID NOT NULL, provider TEXT NOT NULL, merchant_id TEXT NOT NULL, payment_id TEXT NOT NULL,
 reference TEXT NOT NULL UNIQUE, mode TEXT NOT NULL CHECK(mode='test'),
 base_currency TEXT NOT NULL CHECK(base_currency='USD'), base_minor BIGINT NOT NULL CHECK(base_minor>0),
 charge_currency TEXT NOT NULL CHECK(charge_currency IN ('NGN','USD')), charge_minor BIGINT NOT NULL CHECK(charge_minor>0),
 verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY(attempt_id,order_id,quote_id) REFERENCES payment_checkout_attempts(id,order_id,quote_id),
 FOREIGN KEY(order_id,base_currency,base_minor) REFERENCES commerce_orders(id,currency,amount_minor),
 UNIQUE(provider,merchant_id,payment_id)
);
ALTER TABLE commerce_events ADD COLUMN verification_source TEXT NOT NULL DEFAULT 'webhook' CHECK(verification_source IN ('webhook','server_lookup'));
CREATE TRIGGER payment_presentments_immutable BEFORE UPDATE OR DELETE ON payment_presentments FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE OR REPLACE FUNCTION lae_protect_checkout_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Checkout attempt history cannot be deleted'; END IF;
 IF (NEW.id,NEW.order_id,NEW.quote_id,NEW.provider,NEW.merchant_id,NEW.merchant_country,NEW.mode,NEW.reference,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.order_id,OLD.quote_id,OLD.provider,OLD.merchant_id,OLD.merchant_country,OLD.mode,OLD.reference,OLD.created_at)
 OR OLD.status='paid' OR (OLD.checkout_url IS NOT NULL AND NEW.checkout_url IS DISTINCT FROM OLD.checkout_url)
 THEN RAISE EXCEPTION 'Checkout binding is immutable'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER checkout_binding_immutable BEFORE UPDATE OR DELETE ON payment_checkout_attempts FOR EACH ROW EXECUTE FUNCTION lae_protect_checkout_attempt();
CREATE UNIQUE INDEX idx_presentment_quote_amount ON payment_checkout_quotes(id,charge_currency,charge_minor);
ALTER TABLE payment_presentments ADD CONSTRAINT presentment_quote_amount_fk
 FOREIGN KEY(quote_id,charge_currency,charge_minor) REFERENCES payment_checkout_quotes(id,charge_currency,charge_minor);
ALTER TABLE commerce_events ADD COLUMN verified_details JSONB NOT NULL DEFAULT '{}';
