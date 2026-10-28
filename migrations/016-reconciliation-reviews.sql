-- Additive operational annotations only. No grants, money, prices, holds or financial evidence are changed.
CREATE TABLE reconciliation_cases(
 id UUID PRIMARY KEY,source_kind TEXT NOT NULL CHECK(source_kind IN('artist_checkout','listener_checkout','artist_refund','listener_hold','commission','royalty_recovery','withdrawal')),
 source_id TEXT NOT NULL CHECK(length(source_id) BETWEEN 1 AND 100),source_snapshot JSONB NOT NULL,
 status TEXT NOT NULL CHECK(status IN('in_review','waiting_external','resolved')),assigned_actor TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(source_kind,source_id)
);
CREATE INDEX reconciliation_cases_review ON reconciliation_cases(status,updated_at DESC);
CREATE TABLE reconciliation_events(
 id BIGSERIAL PRIMARY KEY,case_id UUID NOT NULL REFERENCES reconciliation_cases(id),revision INTEGER NOT NULL CHECK(revision>0),
 action TEXT NOT NULL CHECK(action IN('claim','note','wait','resolve')),status TEXT NOT NULL CHECK(status IN('in_review','waiting_external','resolved')),
 assigned_actor TEXT NOT NULL,actor TEXT NOT NULL,note TEXT NOT NULL CHECK(length(note) BETWEEN 10 AND 1000),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(case_id,revision)
);
CREATE TRIGGER reconciliation_events_immutable BEFORE UPDATE OR DELETE ON reconciliation_events FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE FUNCTION lae_reconciliation_case_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reconciliation history cannot be deleted'; END IF;
 IF ROW(NEW.id,NEW.source_kind,NEW.source_id,NEW.source_snapshot,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.source_kind,OLD.source_id,OLD.source_snapshot,OLD.created_at) OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Reconciliation identity is immutable and revisions must advance once'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reconciliation_case_guard BEFORE UPDATE OR DELETE ON reconciliation_cases FOR EACH ROW EXECUTE FUNCTION lae_reconciliation_case_guard();
CREATE FUNCTION lae_reconciliation_event_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM reconciliation_events e WHERE e.case_id=NEW.id AND e.revision=NEW.revision AND e.status=NEW.status AND e.assigned_actor=NEW.assigned_actor) THEN RAISE EXCEPTION 'Every reconciliation revision requires matching immutable review evidence'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER reconciliation_event_binding AFTER INSERT OR UPDATE ON reconciliation_cases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lae_reconciliation_event_binding();

CREATE INDEX reconciliation_artist_attempts_attention ON payment_checkout_attempts(created_at,id) WHERE status IN('review','initializing');
CREATE INDEX reconciliation_listener_attempts_attention ON premium_attempts(created_at,id) WHERE status IN('review','initializing') OR benefit_hold;
CREATE INDEX reconciliation_withdrawals_attention ON finance_withdrawals(created_at,id) WHERE status IN('pending','approved');
CREATE INDEX reconciliation_journal_dates ON finance_journals(created_at,id);
