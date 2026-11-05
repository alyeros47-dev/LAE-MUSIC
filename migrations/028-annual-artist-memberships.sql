-- Additive snapshots; preserve historical package and purchase entitlements.
ALTER TABLE artist_subscriptions ADD COLUMN included_generations INTEGER CHECK(included_generations>=0), ADD COLUMN publish_track_limit INTEGER CHECK(publish_track_limit>=0);
UPDATE artist_subscriptions SET included_generations=CASE plan WHEN 'starter' THEN 2 WHEN 'growth' THEN 3 WHEN 'professional' THEN 6 ELSE 0 END,
 publish_track_limit=CASE plan WHEN 'starter' THEN 7 WHEN 'growth' THEN 6 WHEN 'professional' THEN 12 ELSE 0 END;
-- Existing commerce snapshot trigger intentionally rejects UPDATEs; backfill via separate
-- immutable supplement instead of changing historical orders.
CREATE TABLE membership_order_terms (
 order_id UUID PRIMARY KEY REFERENCES commerce_orders(id),
 included_generations INTEGER NOT NULL CHECK(included_generations>=0),
 publish_track_limit INTEGER NOT NULL CHECK(publish_track_limit>=0),
 revision TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO membership_order_terms(order_id,included_generations,publish_track_limit,revision)
 SELECT id,CASE plan WHEN 'starter' THEN 2 WHEN 'growth' THEN 3 ELSE 6 END,
 CASE plan WHEN 'starter' THEN 7 WHEN 'growth' THEN 6 ELSE 12 END,'legacy-preserved'
 FROM commerce_orders WHERE kind='artist_subscription';
CREATE TRIGGER membership_order_terms_immutable BEFORE UPDATE OR DELETE ON membership_order_terms FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE membership_extra_order_terms (
 order_id UUID PRIMARY KEY REFERENCES commerce_orders(id), subscription_id BIGINT NOT NULL REFERENCES artist_subscriptions(id)
);
CREATE TRIGGER membership_extra_order_terms_immutable BEFORE UPDATE OR DELETE ON membership_extra_order_terms FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE membership_generation_terms (
 order_id UUID PRIMARY KEY REFERENCES studio_purchased_credits(order_id),
 subscription_id BIGINT NOT NULL REFERENCES artist_subscriptions(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER membership_generation_terms_immutable BEFORE UPDATE OR DELETE ON membership_generation_terms FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE creator_agreement_acceptances (
 id BIGSERIAL PRIMARY KEY, artist_id BIGINT NOT NULL REFERENCES creators(id),
 version TEXT NOT NULL, content_hash CHAR(64) NOT NULL, agreement JSONB NOT NULL,
 accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(artist_id,version,content_hash), UNIQUE(id,artist_id)
);
CREATE TRIGGER creator_agreement_acceptances_immutable BEFORE UPDATE OR DELETE ON creator_agreement_acceptances FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE membership_royalty_renewals (
 order_id UUID PRIMARY KEY REFERENCES commerce_orders(id), artist_id BIGINT NOT NULL REFERENCES creators(id),
 agreement_acceptance_id BIGINT NOT NULL REFERENCES creator_agreement_acceptances(id),
 amount_minor BIGINT NOT NULL CHECK(amount_minor>0), currency TEXT NOT NULL CHECK(currency='USD'),
 deduction_consent BOOLEAN NOT NULL CHECK(deduction_consent), consent_text TEXT NOT NULL,
 confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY(order_id,artist_id) REFERENCES commerce_orders(id,artist_id),
 FOREIGN KEY(agreement_acceptance_id,artist_id) REFERENCES creator_agreement_acceptances(id,artist_id)
);
CREATE TRIGGER membership_royalty_renewals_immutable BEFORE UPDATE OR DELETE ON membership_royalty_renewals FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
ALTER TABLE artist_notifications DROP CONSTRAINT artist_notifications_destination_check;
ALTER TABLE artist_notifications ADD CONSTRAINT artist_notifications_destination_check CHECK(destination IN ('/workspace?tab=membership','/workspace?tab=plans','/workspace?tab=purchases','/workspace?tab=releases','/workspace?tab=finance','/studio','/partners'));
