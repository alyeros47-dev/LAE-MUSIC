-- Additive manual-payment channel. Preserve all gateway bindings, prices and historical records.
ALTER TABLE payment_checkout_quotes DROP CONSTRAINT payment_checkout_quotes_provider_check;
ALTER TABLE payment_checkout_quotes ADD CONSTRAINT payment_checkout_quotes_provider_check CHECK(provider IN('paystack','flutterwave','manual_bank_transfer'));
ALTER TABLE payment_checkout_attempts DROP CONSTRAINT payment_checkout_attempts_provider_check;
ALTER TABLE payment_checkout_attempts ADD CONSTRAINT payment_checkout_attempts_provider_check CHECK(provider IN('paystack','flutterwave','manual_bank_transfer'));
ALTER TABLE payment_checkout_attempts DROP CONSTRAINT payment_checkout_attempts_mode_check;
ALTER TABLE payment_checkout_attempts ADD CONSTRAINT payment_checkout_attempts_mode_check CHECK(mode='test' OR (provider='manual_bank_transfer' AND mode='live'));
ALTER TABLE payment_presentments DROP CONSTRAINT payment_presentments_mode_check;
ALTER TABLE payment_presentments ADD CONSTRAINT payment_presentments_mode_check CHECK(mode='test' OR (provider='manual_bank_transfer' AND mode='live'));
ALTER TABLE premium_attempts DROP CONSTRAINT premium_attempts_provider_check;
ALTER TABLE premium_attempts ADD CONSTRAINT premium_attempts_provider_check CHECK(provider IN('paystack','flutterwave','manual_bank_transfer'));
CREATE TABLE manual_bank_payments(
 id UUID PRIMARY KEY,artist_order_id UUID UNIQUE REFERENCES commerce_orders(id),listener_order_id UUID UNIQUE REFERENCES premium_orders(id),
 quote_id UUID NOT NULL UNIQUE REFERENCES payment_checkout_quotes(id),attempt_id UUID NOT NULL UNIQUE,
 reference TEXT NOT NULL UNIQUE,merchant_id TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN('test','live')),
 bank_account JSONB NOT NULL,product_label TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'awaiting_transfer' CHECK(status IN('awaiting_transfer','submitted','approved','rejected','cancelled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK((artist_order_id IS NULL)<>(listener_order_id IS NULL)),CHECK(expires_at>created_at)
);
CREATE TABLE manual_bank_submissions(
 payment_id UUID PRIMARY KEY REFERENCES manual_bank_payments(id),payer_name TEXT NOT NULL,transfer_reference TEXT NOT NULL,
 transferred_at TIMESTAMPTZ NOT NULL,note TEXT NOT NULL DEFAULT '',
 proof BYTEA,proof_mime TEXT CHECK(proof_mime IN('image/jpeg','image/png','image/webp')),
 submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK((proof IS NULL)=(proof_mime IS NULL)),CHECK(octet_length(proof)<=1048576)
);
CREATE TABLE manual_bank_reviews(
 payment_id UUID PRIMARY KEY REFERENCES manual_bank_payments(id),decision TEXT NOT NULL CHECK(decision IN('approved','rejected')),
 administrator_id TEXT NOT NULL,note TEXT NOT NULL CHECK(length(note) BETWEEN 10 AND 1000),
 merchant_id TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN('test','live')),
 bank_reference TEXT,bank_reference_hash TEXT,received_at TIMESTAMPTZ,received_minor BIGINT,currency TEXT,
 reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(decision='rejected' OR (bank_reference IS NOT NULL AND bank_reference_hash IS NOT NULL AND received_at IS NOT NULL AND received_minor>0 AND currency IN('USD','NGN'))),
 UNIQUE(mode,bank_reference_hash)
);
CREATE INDEX manual_bank_review_queue ON manual_bank_payments(status,created_at);
CREATE TRIGGER manual_bank_submissions_immutable BEFORE UPDATE OR DELETE ON manual_bank_submissions FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER manual_bank_reviews_immutable BEFORE UPDATE OR DELETE ON manual_bank_reviews FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE FUNCTION lae_manual_bank_history_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Manual payment history cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-'status'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'updated_at')
 OR NOT ((OLD.status='awaiting_transfer' AND NEW.status IN('submitted','cancelled')) OR (OLD.status IN('awaiting_transfer','submitted') AND NEW.status='rejected') OR (OLD.status='submitted' AND NEW.status='approved'))
 THEN RAISE EXCEPTION 'Manual payment binding or final decision is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER manual_bank_history_guard BEFORE UPDATE OR DELETE ON manual_bank_payments FOR EACH ROW EXECUTE FUNCTION lae_manual_bank_history_guard();
