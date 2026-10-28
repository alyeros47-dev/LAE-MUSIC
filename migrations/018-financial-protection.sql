-- Additive owner-approved financial protections. No prices, percentages or historical records change.
ALTER TABLE sonic_test_tasks ADD COLUMN usable_output_seen BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE sonic_test_tasks SET usable_output_seen=TRUE WHERE status='succeeded';
CREATE TABLE studio_failure_decisions(
 task_reference TEXT NOT NULL REFERENCES sonic_test_tasks(task_id),artist_id BIGINT NOT NULL REFERENCES creators(id),
 decision TEXT NOT NULL CHECK(decision IN('credit_restored','held_for_review')),provider_state TEXT NOT NULL,
 response_hash TEXT NOT NULL CHECK(length(response_hash)=64),had_usable_output BOOLEAN NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(task_reference,decision),CHECK(decision<>'credit_restored' OR had_usable_output=FALSE)
);
CREATE TRIGGER studio_failure_decisions_immutable BEFORE UPDATE OR DELETE ON studio_failure_decisions FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE financial_policy_catalogs(revision TEXT PRIMARY KEY,document JSONB NOT NULL,document_hash TEXT NOT NULL CHECK(length(document_hash)=64),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TRIGGER financial_policy_catalogs_immutable BEFORE UPDATE OR DELETE ON financial_policy_catalogs FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE payment_policy_acceptances(
 id BIGSERIAL PRIMARY KEY,artist_order_id UUID UNIQUE REFERENCES commerce_orders(id),premium_order_id UUID UNIQUE REFERENCES premium_orders(id),
 account_id BIGINT NOT NULL,policy_revision TEXT NOT NULL REFERENCES financial_policy_catalogs(revision),accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK((artist_order_id IS NULL)<>(premium_order_id IS NULL))
);
CREATE FUNCTION lae_policy_acceptance_owner() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.artist_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commerce_orders WHERE id=NEW.artist_order_id AND artist_id=NEW.account_id) OR NEW.premium_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM premium_orders WHERE id=NEW.premium_order_id AND listener_id=NEW.account_id) THEN RAISE EXCEPTION 'Policy acceptance must belong to the purchase owner'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_policy_acceptance_owner BEFORE INSERT ON payment_policy_acceptances FOR EACH ROW EXECUTE FUNCTION lae_policy_acceptance_owner();
CREATE TRIGGER payment_policy_acceptances_immutable BEFORE UPDATE OR DELETE ON payment_policy_acceptances FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE refund_policy_decisions(
 order_id UUID PRIMARY KEY REFERENCES payment_refund_cases(order_id),policy_revision TEXT NOT NULL REFERENCES financial_policy_catalogs(revision),
 actor_id TEXT NOT NULL,ground TEXT NOT NULL CHECK(ground IN('declined','before_activation_unused','unused_generation_purchase','duplicate_charge','failed_activation','verified_service_error','legal_requirement')),
 evidence_reference TEXT NOT NULL CHECK(length(evidence_reference) BETWEEN 10 AND 500),review_note TEXT NOT NULL CHECK(length(review_note) BETWEEN 10 AND 1000),source_facts JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER refund_policy_decisions_immutable BEFORE UPDATE OR DELETE ON refund_policy_decisions FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE royalty_platform_losses(
 order_id UUID NOT NULL REFERENCES premium_reversals(order_id),statement_id UUID NOT NULL REFERENCES royalty_statements(id),
 policy_revision TEXT NOT NULL REFERENCES financial_policy_catalogs(revision),currency TEXT NOT NULL CHECK(currency IN('USD','NGN')),mode TEXT NOT NULL CHECK(mode IN('test','live')),
 amount_minor BIGINT NOT NULL CHECK(amount_minor>0),reference TEXT NOT NULL UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(order_id,statement_id)
);
CREATE FUNCTION lae_platform_loss_source() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM royalty_statements WHERE id=NEW.statement_id AND currency=NEW.currency AND mode=NEW.mode) THEN RAISE EXCEPTION 'Platform loss must preserve statement currency and mode'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER royalty_platform_loss_source BEFORE INSERT ON royalty_platform_losses FOR EACH ROW EXECUTE FUNCTION lae_platform_loss_source();
CREATE TRIGGER royalty_platform_losses_immutable BEFORE UPDATE OR DELETE ON royalty_platform_losses FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
