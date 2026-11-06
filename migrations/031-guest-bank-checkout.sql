-- Additive: verified bank payment may precede account registration. Existing receipts and accounts are preserved.
CREATE TABLE guest_purchase_orders(
 id UUID PRIMARY KEY,session_hash TEXT NOT NULL UNIQUE CHECK(session_hash ~ '^[a-f0-9]{64}$'),
 email TEXT NOT NULL CHECK(length(email)<=254),kind TEXT NOT NULL CHECK(kind IN('artist_subscription','premium_listener')),
 plan TEXT NOT NULL,currency TEXT NOT NULL CHECK(currency='USD'),amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
 product_snapshot JSONB NOT NULL,referrer_id BIGINT REFERENCES creators(id),team_leader_id BIGINT REFERENCES creators(id),
 policy_revision TEXT NOT NULL REFERENCES financial_policy_catalogs(revision),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL,CHECK(expires_at>created_at),UNIQUE(id,currency,amount_minor)
);
CREATE TRIGGER guest_purchase_orders_immutable BEFORE UPDATE OR DELETE ON guest_purchase_orders FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
ALTER TABLE payment_checkout_quotes ADD COLUMN guest_order_id UUID REFERENCES guest_purchase_orders(id);
ALTER TABLE payment_checkout_quotes DROP CONSTRAINT checkout_quote_one_product;
ALTER TABLE payment_checkout_quotes ADD CONSTRAINT checkout_quote_one_product CHECK(num_nonnulls(order_id,premium_order_id,guest_order_id)=1);
ALTER TABLE payment_checkout_quotes ADD CONSTRAINT guest_quote_base FOREIGN KEY(guest_order_id,base_currency,base_minor) REFERENCES guest_purchase_orders(id,currency,amount_minor);
ALTER TABLE manual_bank_payments ADD COLUMN guest_order_id UUID UNIQUE REFERENCES guest_purchase_orders(id);
ALTER TABLE manual_bank_payments DROP CONSTRAINT manual_bank_payments_check;
ALTER TABLE manual_bank_payments ADD CONSTRAINT manual_bank_one_product CHECK(num_nonnulls(artist_order_id,listener_order_id,guest_order_id)=1);
CREATE TABLE guest_purchase_fulfillments(
 payment_id UUID PRIMARY KEY REFERENCES manual_bank_payments(id),guest_order_id UUID NOT NULL UNIQUE REFERENCES guest_purchase_orders(id),
 artist_order_id UUID UNIQUE REFERENCES commerce_receipts(order_id),premium_order_id UUID UNIQUE REFERENCES premium_receipts(order_id),
 artist_id BIGINT REFERENCES creators(id),listener_id BIGINT REFERENCES listeners(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(num_nonnulls(artist_order_id,premium_order_id)=1),CHECK(num_nonnulls(artist_id,listener_id)=1),
 CHECK((artist_order_id IS NULL)=(artist_id IS NULL)),CHECK((premium_order_id IS NULL)=(listener_id IS NULL))
);
CREATE TRIGGER guest_purchase_fulfillments_immutable BEFORE UPDATE OR DELETE ON guest_purchase_fulfillments FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();

-- Fresh installations initialize this legacy ledger after migrations; preserve its exact original shape.
CREATE TABLE IF NOT EXISTS generation_ledger(id BIGSERIAL PRIMARY KEY,creator_id BIGINT NOT NULL REFERENCES creators(id),delta INTEGER NOT NULL,reason TEXT NOT NULL,reference TEXT NOT NULL UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
-- Tie companion lyrics consumption to its verified purchase for holds/refund review.
ALTER TABLE generation_ledger ADD COLUMN source_order_id UUID REFERENCES commerce_orders(id);
CREATE INDEX paid_lyrics_source_usage ON generation_ledger(creator_id,source_order_id) WHERE source_order_id IS NOT NULL;
