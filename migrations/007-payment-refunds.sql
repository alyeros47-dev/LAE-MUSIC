-- Additive reversal evidence. Preserve original orders, grants and receipts. Reversals have separate evidence.
ALTER TABLE artist_subscriptions ADD COLUMN payment_hold BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE payment_refund_cases (
 order_id UUID PRIMARY KEY REFERENCES payment_presentments(order_id),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000),
 status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','declined','submitting','verification_required','provider_pending','review','refunded')),
 benefit_hold BOOLEAN NOT NULL DEFAULT FALSE,
 provider_refund_id TEXT, review_note TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refund_cases_review ON payment_refund_cases(updated_at DESC);
CREATE TABLE payment_refund_observations (
 id BIGSERIAL PRIMARY KEY, order_id UUID NOT NULL REFERENCES payment_refund_cases(order_id),
 provider TEXT NOT NULL, merchant_id TEXT NOT NULL, refund_id TEXT NOT NULL,
 currency TEXT NOT NULL, amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
 provider_status TEXT NOT NULL, evidence_hash TEXT NOT NULL UNIQUE,
 verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE payment_refund_bindings (
 provider TEXT NOT NULL, merchant_id TEXT NOT NULL, refund_id TEXT NOT NULL,
 order_id UUID NOT NULL REFERENCES payment_refund_cases(order_id),
 PRIMARY KEY(provider,merchant_id,refund_id)
);
CREATE TABLE payment_product_reversals (
 order_id UUID PRIMARY KEY REFERENCES payment_refund_cases(order_id),
 observation_id BIGINT NOT NULL UNIQUE REFERENCES payment_refund_observations(id),
 reference TEXT NOT NULL UNIQUE REFERENCES finance_journals(reference),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER refund_observations_immutable BEFORE UPDATE OR DELETE ON payment_refund_observations FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER refund_bindings_immutable BEFORE UPDATE OR DELETE ON payment_refund_bindings FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER product_reversals_immutable BEFORE UPDATE OR DELETE ON payment_product_reversals FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE INDEX idx_refund_observations_order ON payment_refund_observations(order_id,verified_at DESC);
CREATE OR REPLACE FUNCTION lae_protect_refund_case() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Refund history cannot be deleted'; END IF;
 IF (NEW.order_id,NEW.reason,NEW.created_at) IS DISTINCT FROM (OLD.order_id,OLD.reason,OLD.created_at)
 OR (OLD.benefit_hold AND NOT NEW.benefit_hold)
 OR (OLD.status='refunded' AND NEW.status<>'refunded')
 THEN RAISE EXCEPTION 'Refund history and verified holds are protected'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER refund_case_protected BEFORE UPDATE OR DELETE ON payment_refund_cases FOR EACH ROW EXECUTE FUNCTION lae_protect_refund_case();
