-- Additive, prospective actual-currency obligations. Existing USD rows remain unchanged
-- as historical records / product-accounting references, never a second payout.
CREATE TABLE affiliate_native_policy(id INTEGER PRIMARY KEY CHECK(id=1),starts_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
INSERT INTO affiliate_native_policy(id) VALUES(1);
CREATE TABLE affiliate_native_outbox(order_id UUID PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN('artist','premium')),state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','complete')),attempts INTEGER NOT NULL DEFAULT 0,last_attempt_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE affiliate_native_earnings(
 id UUID PRIMARY KEY,artist_id BIGINT NOT NULL REFERENCES creators(id),order_id UUID NOT NULL,
 source_kind TEXT NOT NULL CHECK(source_kind IN('artist_direct','premium_direct','premium_team')),source_id TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN('live','test')),currency TEXT NOT NULL CHECK(currency IN('USD','NGN')),
 gross_minor BIGINT NOT NULL CHECK(gross_minor>0),amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
 usd_reference_minor BIGINT NOT NULL CHECK(usd_reference_minor>=0),exchange_rate TEXT NOT NULL,quote_id UUID NOT NULL REFERENCES payment_checkout_quotes(id),
 payment_id TEXT NOT NULL,provider TEXT NOT NULL,merchant_id TEXT NOT NULL,policy_revision TEXT NOT NULL,
 quarter TEXT,payable_minor BIGINT CHECK(payable_minor>=0),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','available','held','reversed')),
 funding_checked_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(source_kind,source_id,mode),
 CHECK(source_kind<>'premium_team' OR quarter IS NOT NULL)
);
CREATE INDEX affiliate_native_artist ON affiliate_native_earnings(artist_id,mode,currency,status);
CREATE TABLE affiliate_native_team_statements(
 id UUID PRIMARY KEY,artist_id BIGINT NOT NULL REFERENCES creators(id),mode TEXT NOT NULL CHECK(mode IN('live','test')),quarter TEXT NOT NULL,
 currency TEXT NOT NULL CHECK(currency IN('USD','NGN')),gross_minor BIGINT NOT NULL CHECK(gross_minor>0),bonus_minor BIGINT NOT NULL CHECK(bonus_minor>=0),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(artist_id,mode,quarter,currency)
);
CREATE TABLE affiliate_native_team_allocations(earning_id UUID PRIMARY KEY REFERENCES affiliate_native_earnings(id),statement_id UUID NOT NULL REFERENCES affiliate_native_team_statements(id),amount_minor BIGINT NOT NULL CHECK(amount_minor>=0));
CREATE TABLE affiliate_native_funding(
 earning_id UUID PRIMARY KEY REFERENCES affiliate_native_earnings(id),currency TEXT NOT NULL CHECK(currency IN('USD','NGN')),amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
 settlement_reference TEXT NOT NULL,evidence_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE affiliate_wallet_holds(artist_id BIGINT NOT NULL REFERENCES creators(id),mode TEXT NOT NULL CHECK(mode IN('live','test')),currency TEXT NOT NULL CHECK(currency IN('USD','NGN')),earning_id UUID NOT NULL REFERENCES affiliate_native_earnings(id),reason TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(earning_id));
CREATE TABLE affiliate_bank_accounts(
 id UUID PRIMARY KEY,artist_id BIGINT NOT NULL REFERENCES creators(id),mode TEXT NOT NULL CHECK(mode IN('live','test')),merchant_id TEXT NOT NULL,
 sealed_details TEXT NOT NULL,last_four CHAR(4) NOT NULL,bank_code TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE finance_withdrawals ADD COLUMN funds_source TEXT NOT NULL DEFAULT 'general' CHECK(funds_source IN('general','affiliate'));
CREATE TABLE affiliate_disbursements(
 withdrawal_id BIGINT PRIMARY KEY REFERENCES finance_withdrawals(id),artist_id BIGINT NOT NULL REFERENCES creators(id),bank_id UUID REFERENCES affiliate_bank_accounts(id),
 mode TEXT NOT NULL CHECK(mode IN('live','test')),currency TEXT NOT NULL CHECK(currency IN('USD','NGN')),merchant_id TEXT NOT NULL,reference TEXT NOT NULL UNIQUE,provider_reference TEXT,
 state TEXT NOT NULL DEFAULT 'awaiting_review' CHECK(state IN('awaiting_review','approved','submitting','pending','authorization_required','successful','failed','reversed','unknown','review_required')),
 submitted_at TIMESTAMPTZ,verified_at TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(state<>'successful' OR (verified_at IS NOT NULL AND provider_reference IS NOT NULL))
);
CREATE UNIQUE INDEX affiliate_single_active_request ON affiliate_disbursements(artist_id,mode,currency) WHERE state NOT IN('successful','failed','reversed');
CREATE TABLE affiliate_withdrawal_allocations(withdrawal_id BIGINT NOT NULL REFERENCES affiliate_disbursements(withdrawal_id),earning_id UUID NOT NULL REFERENCES affiliate_native_earnings(id),amount_minor BIGINT NOT NULL CHECK(amount_minor>0),PRIMARY KEY(withdrawal_id,earning_id));
CREATE TABLE affiliate_disbursement_events(id BIGSERIAL PRIMARY KEY,withdrawal_id BIGINT NOT NULL REFERENCES affiliate_disbursements(withdrawal_id),state TEXT NOT NULL,evidence_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(withdrawal_id,state,evidence_hash));
CREATE FUNCTION lae_native_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'status'-'payable_minor'-'funding_checked_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'payable_minor'-'funding_checked_at') OR (OLD.payable_minor IS NOT NULL AND NEW.payable_minor IS DISTINCT FROM OLD.payable_minor) THEN RAISE EXCEPTION 'Original commission currency and amounts are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER native_earning_identity BEFORE UPDATE ON affiliate_native_earnings FOR EACH ROW EXECUTE FUNCTION lae_native_identity_immutable();
CREATE TRIGGER native_earning_no_delete BEFORE DELETE ON affiliate_native_earnings FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER native_policy_immutable BEFORE UPDATE OR DELETE ON affiliate_native_policy FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER native_team_statement_immutable BEFORE UPDATE OR DELETE ON affiliate_native_team_statements FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER native_team_allocation_immutable BEFORE UPDATE OR DELETE ON affiliate_native_team_allocations FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER native_funding_immutable BEFORE UPDATE OR DELETE ON affiliate_native_funding FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER affiliate_bank_immutable BEFORE UPDATE OR DELETE ON affiliate_bank_accounts FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER affiliate_withdrawal_allocation_immutable BEFORE UPDATE OR DELETE ON affiliate_withdrawal_allocations FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER affiliate_disbursement_event_immutable BEFORE UPDATE OR DELETE ON affiliate_disbursement_events FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE FUNCTION lae_affiliate_paid_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.funds_source='affiliate' AND NEW.status='paid' AND NOT EXISTS(SELECT 1 FROM affiliate_disbursements p WHERE p.withdrawal_id=NEW.id AND p.artist_id=NEW.artist_id AND p.currency=NEW.currency AND p.state='successful' AND p.provider_reference=NEW.payout_reference AND p.verified_at IS NOT NULL) THEN RAISE EXCEPTION 'Affiliate payment requires verified disbursement evidence'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER affiliate_paid_guard AFTER INSERT OR UPDATE ON finance_withdrawals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lae_affiliate_paid_guard();
CREATE FUNCTION lae_affiliate_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n affiliate_native_earnings; p affiliate_disbursements; w finance_withdrawals; funded BIGINT; used BIGINT;
BEGIN
 SELECT * INTO n FROM affiliate_native_earnings WHERE id=NEW.earning_id;
 SELECT * INTO p FROM affiliate_disbursements WHERE withdrawal_id=NEW.withdrawal_id;
 SELECT * INTO w FROM finance_withdrawals WHERE id=NEW.withdrawal_id;
 SELECT amount_minor INTO funded FROM affiliate_native_funding WHERE earning_id=n.id;
 SELECT SUM(a.amount_minor) INTO used FROM affiliate_withdrawal_allocations a JOIN affiliate_disbursements x ON x.withdrawal_id=a.withdrawal_id WHERE a.earning_id=n.id AND x.state NOT IN('failed','reversed');
 IF funded IS NULL OR used>funded OR n.artist_id<>p.artist_id OR n.mode<>p.mode OR n.currency<>p.currency OR w.funds_source<>'affiliate' OR w.artist_id<>p.artist_id OR w.currency<>p.currency OR (SELECT COALESCE(SUM(amount_minor),0) FROM affiliate_withdrawal_allocations WHERE withdrawal_id=w.id)<>w.gross_minor THEN RAISE EXCEPTION 'Withdrawal must match distinct funded commissions in its original currency'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER affiliate_allocation_guard AFTER INSERT ON affiliate_withdrawal_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lae_affiliate_allocation_guard();
