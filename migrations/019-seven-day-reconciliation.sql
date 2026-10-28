-- Additive correction: retain earlier policy records, statements and journals as history.
CREATE FUNCTION lae_royalty_ready_at(period TEXT) RETURNS TIMESTAMPTZ LANGUAGE SQL IMMUTABLE STRICT AS $$ SELECT ((period||'-01')::date+INTERVAL '1 month 7 days') AT TIME ZONE 'UTC' $$;
CREATE FUNCTION lae_seven_day_royalty_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE period TEXT;
BEGIN
 IF TG_TABLE_NAME='royalty_statements' THEN period:=NEW.month; ELSE SELECT month INTO period FROM royalty_statements WHERE id=NEW.statement_id; END IF;
 IF period IS NULL OR clock_timestamp()<lae_royalty_ready_at(period) THEN RAISE EXCEPTION 'Seven-day month-end reconciliation period is not complete'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER royalty_statement_seven_day_guard BEFORE INSERT ON royalty_statements FOR EACH ROW EXECUTE FUNCTION lae_seven_day_royalty_guard();
CREATE TRIGGER royalty_release_seven_day_guard BEFORE INSERT ON royalty_cash_releases FOR EACH ROW EXECUTE FUNCTION lae_seven_day_royalty_guard();
CREATE TABLE royalty_statement_terms(statement_id UUID PRIMARY KEY REFERENCES royalty_statements(id),policy_revision TEXT NOT NULL REFERENCES financial_policy_catalogs(revision),release_not_before TIMESTAMPTZ NOT NULL,reconciliation_days INTEGER NOT NULL CHECK(reconciliation_days=7),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE FUNCTION lae_royalty_terms_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM royalty_statement_terms t JOIN financial_policy_catalogs p ON p.revision=t.policy_revision WHERE t.statement_id=NEW.id AND t.release_not_before=lae_royalty_ready_at(NEW.month) AND p.document->>'settlement_days'='7') THEN RAISE EXCEPTION 'A new statement needs the approved seven-day reconciliation terms'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER royalty_statement_terms_required AFTER INSERT ON royalty_statements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lae_royalty_terms_guard();
CREATE TRIGGER royalty_statement_terms_immutable BEFORE UPDATE OR DELETE ON royalty_statement_terms FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE refund_service_incidents(id UUID PRIMARY KEY,artist_order_id UUID REFERENCES commerce_orders(id),premium_order_id UUID REFERENCES premium_receipts(order_id),occurred_at TIMESTAMPTZ NOT NULL,verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),actor_id TEXT NOT NULL,evidence_reference TEXT NOT NULL CHECK(length(evidence_reference) BETWEEN 10 AND 500),CHECK((artist_order_id IS NULL)<>(premium_order_id IS NULL)),CHECK(occurred_at<=verified_at));
CREATE TRIGGER refund_incidents_immutable BEFORE UPDATE OR DELETE ON refund_service_incidents FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE refund_complaints(id UUID PRIMARY KEY,artist_order_id UUID REFERENCES commerce_orders(id),premium_order_id UUID REFERENCES premium_receipts(order_id),account_id BIGINT NOT NULL,policy_revision TEXT NOT NULL REFERENCES financial_policy_catalogs(revision),ground TEXT NOT NULL CHECK(ground IN('voluntary','duplicate_charge','failed_activation','service_error','legal_requirement','provider_rule','verified_fraud')),reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000),incident_id UUID REFERENCES refund_service_incidents(id),relevant_at TIMESTAMPTZ NOT NULL,deadline_at TIMESTAMPTZ NOT NULL,received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),intake TEXT NOT NULL CHECK(intake IN('timely','timing_review','exception_review')),CHECK((artist_order_id IS NULL)<>(premium_order_id IS NULL)),CHECK(deadline_at=relevant_at+INTERVAL '168 hours'),CHECK(received_at>=relevant_at));
CREATE UNIQUE INDEX refund_complaint_claim_unique ON refund_complaints((COALESCE(artist_order_id,premium_order_id)),(COALESCE(incident_id,'00000000-0000-0000-0000-000000000000'::uuid)),ground);
CREATE INDEX refund_complaints_listener_source ON refund_complaints(premium_order_id) WHERE premium_order_id IS NOT NULL;
CREATE INDEX refund_complaints_artist_source ON refund_complaints(artist_order_id) WHERE artist_order_id IS NOT NULL;
CREATE INDEX refund_complaints_owner_time ON refund_complaints(account_id,received_at DESC);
CREATE FUNCTION lae_refund_complaint_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE paid_at TIMESTAMPTZ; incident_at TIMESTAMPTZ; owner_id BIGINT;
BEGIN
 IF NEW.received_at<>transaction_timestamp() THEN RAISE EXCEPTION 'Complaint receipt time is assigned by the database'; END IF;
 IF NEW.artist_order_id IS NOT NULL THEN SELECT o.artist_id,p.verified_at INTO owner_id,paid_at FROM commerce_orders o JOIN payment_presentments p ON p.order_id=o.id WHERE o.id=NEW.artist_order_id; ELSE SELECT o.listener_id,p.verified_at INTO owner_id,paid_at FROM premium_orders o JOIN premium_receipts p ON p.order_id=o.id WHERE o.id=NEW.premium_order_id; END IF;
 IF owner_id IS NULL OR owner_id<>NEW.account_id THEN RAISE EXCEPTION 'Complaint must belong to the verified purchase owner'; END IF;
 IF NEW.incident_id IS NOT NULL THEN SELECT occurred_at INTO incident_at FROM refund_service_incidents WHERE id=NEW.incident_id AND artist_order_id IS NOT DISTINCT FROM NEW.artist_order_id AND premium_order_id IS NOT DISTINCT FROM NEW.premium_order_id; END IF;
 IF NEW.relevant_at IS DISTINCT FROM COALESCE(incident_at,paid_at) OR (NEW.incident_id IS NOT NULL AND incident_at IS NULL) THEN RAISE EXCEPTION 'Complaint timing must use the matching verified payment or incident'; END IF;
 IF NEW.intake='timely' AND NEW.received_at>NEW.deadline_at THEN RAISE EXCEPTION 'Ordinary complaint deadline has passed'; END IF;
 IF NEW.intake<>'timely' AND NEW.ground='voluntary' THEN RAISE EXCEPTION 'Expired ordinary voluntary complaints are closed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER refund_complaint_owner_time BEFORE INSERT ON refund_complaints FOR EACH ROW EXECUTE FUNCTION lae_refund_complaint_guard();
CREATE TRIGGER refund_complaints_immutable BEFORE UPDATE OR DELETE ON refund_complaints FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE refund_complaint_reviews(complaint_id UUID PRIMARY KEY REFERENCES refund_complaints(id),status TEXT NOT NULL CHECK(status IN('under_review','resolved_no_refund','provider_review')),revision INTEGER NOT NULL CHECK(revision>0),actor_id TEXT NOT NULL,note TEXT NOT NULL,evidence_reference TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE refund_complaint_events(complaint_id UUID NOT NULL REFERENCES refund_complaints(id),revision INTEGER NOT NULL,actor_id TEXT NOT NULL,status TEXT NOT NULL,note TEXT NOT NULL,evidence_reference TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(complaint_id,revision));
CREATE TRIGGER refund_complaint_events_immutable BEFORE UPDATE OR DELETE ON refund_complaint_events FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE royalty_late_disputes(order_id UUID NOT NULL REFERENCES premium_reversals(order_id),statement_id UUID NOT NULL REFERENCES royalty_statements(id),policy_revision TEXT NOT NULL REFERENCES financial_policy_catalogs(revision),currency TEXT NOT NULL CHECK(currency IN('USD','NGN')),mode TEXT NOT NULL CHECK(mode IN('test','live')),recognized_refund_minor BIGINT NOT NULL CHECK(recognized_refund_minor>=0),artist_exposure_minor BIGINT NOT NULL CHECK(artist_exposure_minor>=0),cash_released BOOLEAN NOT NULL,reference TEXT NOT NULL UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(order_id,statement_id));
CREATE INDEX royalty_late_disputes_statement ON royalty_late_disputes(statement_id);
CREATE FUNCTION lae_late_dispute_source() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM royalty_statements s,jsonb_array_elements(s.snapshot->'lines') line WHERE s.id=NEW.statement_id AND s.currency=NEW.currency AND s.mode=NEW.mode AND line->>'order_id'=NEW.order_id::text AND NEW.recognized_refund_minor<=(line->>'gross_minor')::bigint-(line->>'refund_minor')::bigint AND NEW.artist_exposure_minor<=COALESCE((line->>'artist_pool_share_minor')::bigint,0)) THEN RAISE EXCEPTION 'Late dispute must match the original source, currency and statement share'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER royalty_late_dispute_source BEFORE INSERT ON royalty_late_disputes FOR EACH ROW EXECUTE FUNCTION lae_late_dispute_source();
CREATE TRIGGER royalty_late_disputes_immutable BEFORE UPDATE OR DELETE ON royalty_late_disputes FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE royalty_late_reviews(order_id UUID NOT NULL,statement_id UUID NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),route TEXT NOT NULL CHECK(route IN('reconciliation','reserve_review','legal_review','fraud_review')),actor_id TEXT NOT NULL,note TEXT NOT NULL,evidence_reference TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(order_id,statement_id),FOREIGN KEY(order_id,statement_id) REFERENCES royalty_late_disputes(order_id,statement_id));
CREATE TABLE royalty_late_events(order_id UUID NOT NULL,statement_id UUID NOT NULL,revision INTEGER NOT NULL,route TEXT NOT NULL,actor_id TEXT NOT NULL,note TEXT NOT NULL,evidence_reference TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(order_id,statement_id,revision),FOREIGN KEY(order_id,statement_id) REFERENCES royalty_late_disputes(order_id,statement_id));
CREATE TRIGGER royalty_late_events_immutable BEFORE UPDATE OR DELETE ON royalty_late_events FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
ALTER TABLE refund_policy_decisions DROP CONSTRAINT refund_policy_decisions_ground_check;
ALTER TABLE refund_policy_decisions ADD CONSTRAINT refund_policy_decisions_ground_check CHECK(ground IN('declined','before_activation_unused','unused_generation_purchase','duplicate_charge','failed_activation','verified_service_error','legal_requirement','provider_rule','verified_fraud'));
