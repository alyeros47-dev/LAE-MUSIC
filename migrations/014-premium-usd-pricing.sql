-- Additive: preserve all NGN history and earlier migration checksums. New Premium products use approved USD snapshots.
CREATE TABLE premium_price_catalogs(revision TEXT PRIMARY KEY,document JSONB NOT NULL,document_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK((document->>'base_currency'='USD' AND document->>'status'='approved' AND length(document->'approval'->>'evidence')>=10) IS TRUE));
CREATE TRIGGER premium_catalogs_immutable BEFORE UPDATE OR DELETE ON premium_price_catalogs FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
ALTER TABLE premium_orders DROP CONSTRAINT premium_orders_currency_check;
ALTER TABLE premium_orders ADD CONSTRAINT premium_orders_currency_check CHECK(currency IN('NGN','USD'));
ALTER TABLE premium_orders ADD COLUMN pricing_revision TEXT REFERENCES premium_price_catalogs(revision);
ALTER TABLE premium_orders ADD CONSTRAINT premium_usd_revision CHECK(currency<>'USD' OR pricing_revision IS NOT NULL);
ALTER TABLE premium_orders ADD CONSTRAINT premium_order_base UNIQUE(id,currency,amount_minor);
CREATE FUNCTION lae_premium_usd_price_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.currency='USD' AND NOT EXISTS(SELECT 1 FROM premium_price_catalogs c WHERE c.revision=NEW.pricing_revision AND (c.document->'plans'->NEW.plan->>'usd_minor')::bigint=NEW.amount_minor AND (c.document->'plans'->NEW.plan->>'days')::integer=NEW.days) THEN RAISE EXCEPTION 'Premium order must match an approved USD price revision'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER premium_usd_price_guard BEFORE INSERT ON premium_orders FOR EACH ROW EXECUTE FUNCTION lae_premium_usd_price_guard();
ALTER TABLE premium_receipts DROP CONSTRAINT premium_receipts_currency_check;
ALTER TABLE premium_receipts ADD CONSTRAINT premium_receipts_currency_check CHECK(currency IN('NGN','USD'));
ALTER TABLE royalty_statements DROP CONSTRAINT royalty_statements_currency_check;
ALTER TABLE royalty_statements ADD CONSTRAINT royalty_statements_currency_check CHECK(currency IN('NGN','USD'));
ALTER TABLE royalty_funding_sources DROP CONSTRAINT royalty_funding_sources_currency_check;
ALTER TABLE royalty_funding_sources ADD CONSTRAINT royalty_funding_sources_currency_check CHECK(currency IN('NGN','USD'));
-- Reuse the same quote table, exact conversion and trusted snapshot cache as artist checkout.
ALTER TABLE payment_checkout_quotes ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE payment_checkout_quotes ADD COLUMN premium_order_id UUID REFERENCES premium_orders(id);
ALTER TABLE payment_checkout_quotes ADD CONSTRAINT checkout_quote_one_product CHECK((order_id IS NULL)<>(premium_order_id IS NULL));
ALTER TABLE payment_checkout_quotes ADD CONSTRAINT premium_quote_base FOREIGN KEY(premium_order_id,base_currency,base_minor) REFERENCES premium_orders(id,currency,amount_minor);
ALTER TABLE payment_checkout_quotes ADD CONSTRAINT premium_quote_identity UNIQUE(id,premium_order_id);
CREATE INDEX premium_checkout_quote_order ON payment_checkout_quotes(premium_order_id,created_at DESC) WHERE premium_order_id IS NOT NULL;
ALTER TABLE premium_attempts ADD COLUMN quote_id UUID;
ALTER TABLE premium_attempts ADD CONSTRAINT premium_attempt_quote FOREIGN KEY(quote_id,order_id) REFERENCES payment_checkout_quotes(id,premium_order_id);
CREATE FUNCTION lae_premium_quote_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN RAISE EXCEPTION 'Premium checkout quote binding is immutable'; END IF;
 IF TG_OP='INSERT' AND NEW.quote_id IS NULL AND EXISTS(SELECT 1 FROM premium_orders WHERE id=NEW.order_id AND currency='USD') THEN RAISE EXCEPTION 'USD Premium checkout requires an immutable quote'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER premium_quote_guard BEFORE INSERT OR UPDATE ON premium_attempts FOR EACH ROW EXECUTE FUNCTION lae_premium_quote_guard();
CREATE TABLE premium_presentments(
 order_id UUID PRIMARY KEY REFERENCES premium_receipts(order_id),quote_id UUID NOT NULL,attempt_id UUID NOT NULL UNIQUE REFERENCES premium_attempts(id),
 base_currency TEXT NOT NULL CHECK(base_currency='USD'),base_minor BIGINT NOT NULL CHECK(base_minor>0),
 charge_currency TEXT NOT NULL,charge_minor BIGINT NOT NULL CHECK(charge_minor>0),usd_equivalent_minor BIGINT NOT NULL CHECK(usd_equivalent_minor=base_minor),
 rate_snapshot_id UUID REFERENCES currency_rate_snapshots(id),exchange_rate TEXT NOT NULL,conversion_at TIMESTAMPTZ NOT NULL,verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY(quote_id,order_id) REFERENCES payment_checkout_quotes(id,premium_order_id),CHECK(charge_currency='USD' OR rate_snapshot_id IS NOT NULL),CHECK(charge_currency<>'USD' OR charge_minor=base_minor)
);
CREATE FUNCTION lae_premium_presentment_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM premium_attempts a JOIN payment_checkout_quotes q ON q.id=a.quote_id LEFT JOIN currency_rate_snapshots s ON s.id=q.rate_snapshot_id WHERE a.id=NEW.attempt_id AND a.order_id=NEW.order_id AND q.id=NEW.quote_id AND q.base_currency=NEW.base_currency AND q.base_minor=NEW.base_minor AND q.charge_currency=NEW.charge_currency AND q.charge_minor=NEW.charge_minor AND q.rate_snapshot_id IS NOT DISTINCT FROM NEW.rate_snapshot_id AND NEW.exchange_rate=CASE WHEN q.charge_currency='USD' THEN '1' ELSE s.rates->>q.charge_currency END AND NEW.conversion_at=COALESCE(s.as_of,q.created_at)) THEN RAISE EXCEPTION 'Premium presentment must match its original immutable quote and exchange evidence'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER premium_presentment_guard BEFORE INSERT ON premium_presentments FOR EACH ROW EXECUTE FUNCTION lae_premium_presentment_guard();
CREATE TRIGGER premium_presentments_immutable BEFORE UPDATE OR DELETE ON premium_presentments FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE FUNCTION lae_premium_presentment_required() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.currency='USD' AND NOT EXISTS(SELECT 1 FROM premium_presentments p WHERE p.order_id=NEW.order_id AND p.base_minor=NEW.amount_minor) THEN RAISE EXCEPTION 'A USD Premium receipt requires original-currency presentment evidence'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER premium_presentment_required AFTER INSERT ON premium_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lae_premium_presentment_required();
CREATE TABLE premium_cost_conversions(order_id UUID NOT NULL,revision INTEGER NOT NULL,cost_currency TEXT NOT NULL,fees_minor BIGINT NOT NULL CHECK(fees_minor>=0),tax_minor BIGINT NOT NULL CHECK(tax_minor>=0),base_currency TEXT NOT NULL,base_fees_minor BIGINT NOT NULL,base_tax_minor BIGINT NOT NULL,rate_snapshot_id UUID REFERENCES currency_rate_snapshots(id),exchange_rate TEXT NOT NULL,conversion_at TIMESTAMPTZ NOT NULL,PRIMARY KEY(order_id,revision),FOREIGN KEY(order_id,revision) REFERENCES premium_payment_costs(order_id,revision));
CREATE TRIGGER premium_cost_conversions_immutable BEFORE UPDATE OR DELETE ON premium_cost_conversions FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
-- Keep original refund currency/evidence as well as the fixed USD reversal amount.
CREATE TABLE premium_refund_presentments(
 order_id UUID PRIMARY KEY REFERENCES premium_reversals(order_id),charge_currency TEXT NOT NULL,charge_minor BIGINT NOT NULL CHECK(charge_minor>0),
 base_currency TEXT NOT NULL CHECK(base_currency IN('USD','NGN')),base_minor BIGINT NOT NULL CHECK(base_minor>0),
 rate_snapshot_id UUID REFERENCES currency_rate_snapshots(id),exchange_rate TEXT NOT NULL,conversion_at TIMESTAMPTZ NOT NULL,verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE FUNCTION lae_premium_refund_presentment_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM premium_receipts r LEFT JOIN premium_presentments p ON p.order_id=r.order_id WHERE r.order_id=NEW.order_id AND r.currency=NEW.base_currency AND r.amount_minor=NEW.base_minor AND NEW.charge_currency=COALESCE(p.charge_currency,r.currency) AND NEW.charge_minor=COALESCE(p.charge_minor,r.amount_minor) AND NEW.rate_snapshot_id IS NOT DISTINCT FROM p.rate_snapshot_id AND NEW.exchange_rate=COALESCE(p.exchange_rate,'1') AND NEW.conversion_at=COALESCE(p.conversion_at,r.verified_at)) THEN RAISE EXCEPTION 'Refund presentment must preserve the original payment conversion evidence'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER premium_refund_presentment_guard BEFORE INSERT ON premium_refund_presentments FOR EACH ROW EXECUTE FUNCTION lae_premium_refund_presentment_guard();
CREATE TRIGGER premium_refund_presentments_immutable BEFORE UPDATE OR DELETE ON premium_refund_presentments FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
-- New cost provenance must match the normalized immutable cost and receipt rows.
ALTER TABLE premium_receipts ADD CONSTRAINT premium_receipt_currency UNIQUE(order_id,currency);
ALTER TABLE premium_payment_costs ADD CONSTRAINT premium_cost_normalized UNIQUE(order_id,revision,fees_minor,tax_minor);
ALTER TABLE premium_cost_conversions ADD CONSTRAINT premium_cost_receipt_currency FOREIGN KEY(order_id,base_currency) REFERENCES premium_receipts(order_id,currency);
ALTER TABLE premium_cost_conversions ADD CONSTRAINT premium_cost_normalized_match FOREIGN KEY(order_id,revision,base_fees_minor,base_tax_minor) REFERENCES premium_payment_costs(order_id,revision,fees_minor,tax_minor);
CREATE FUNCTION lae_premium_cost_conversion_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.cost_currency=NEW.base_currency THEN
  IF NEW.exchange_rate<>'1' OR NEW.rate_snapshot_id IS NOT NULL OR NEW.fees_minor<>NEW.base_fees_minor OR NEW.tax_minor<>NEW.base_tax_minor THEN RAISE EXCEPTION 'Base-currency costs must not be converted twice'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM premium_presentments p WHERE p.order_id=NEW.order_id AND p.charge_currency=NEW.cost_currency AND p.base_currency=NEW.base_currency AND p.exchange_rate=NEW.exchange_rate AND p.rate_snapshot_id=NEW.rate_snapshot_id AND p.conversion_at=NEW.conversion_at) THEN RAISE EXCEPTION 'Cost conversion must use the original payment snapshot'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER premium_cost_conversion_guard BEFORE INSERT ON premium_cost_conversions FOR EACH ROW EXECUTE FUNCTION lae_premium_cost_conversion_guard();
