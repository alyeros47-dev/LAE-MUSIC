-- Additive: new verified artist receipts only. Historical earnings stay intact.
INSERT INTO partner_policy_revisions(revision,document) VALUES('artist-direct20-creator-milestones-2026-11-15','{"direct_percent":20,"artist_indirect_percent":0,"team_depth":2,"stages":[[1000,90000],[10000,900000],[100000,9000000]],"currency":"USD","count_once_per_creator":true,"premium_unchanged":true,"historical_contracts":"preserved","cash_release_enabled":false}');
ALTER TABLE affiliate_receipt_policies DROP CONSTRAINT affiliate_receipt_policies_policy_revision_check;
ALTER TABLE affiliate_receipt_policies ADD CONSTRAINT affiliate_receipt_policies_policy_revision_check CHECK(policy_revision IN('affiliate-opt-in-premium30-2026-11-05','premium-opt-in20-team10-2026-11-06','artist-packages-direct20-team10-2026-11-15','artist-direct20-creator-milestones-2026-11-15'));
ALTER TABLE affiliate_receipt_policies DROP CONSTRAINT artist_policy_product_scope;
ALTER TABLE affiliate_receipt_policies ADD CONSTRAINT artist_policy_product_scope CHECK(policy_revision NOT IN('artist-packages-direct20-team10-2026-11-15','artist-direct20-creator-milestones-2026-11-15') OR artist_order_id IS NOT NULL);
CREATE OR REPLACE FUNCTION lae_pending_artist_commission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase record;
BEGIN
 SELECT o.*,s.direct_referrer_id,COALESCE(p.policy_revision,s.policy_revision) AS commission_revision INTO purchase
 FROM commerce_orders o JOIN commerce_order_referral_snapshots s ON s.order_id=o.id LEFT JOIN affiliate_receipt_policies p ON p.artist_order_id=o.id WHERE o.subscription_id=NEW.subscription_id;
 IF purchase.commission_revision IN('artist-packages-direct20-team10-2026-11-15','artist-direct20-creator-milestones-2026-11-15') THEN
  IF purchase.kind<>'artist_subscription' OR purchase.plan NOT IN('starter','growth','professional') OR NEW.tier<>1 OR NEW.referrer_id IS DISTINCT FROM purchase.direct_referrer_id OR NEW.referred_artist_id<>purchase.artist_id OR NEW.referrer_id=purchase.artist_id OR NEW.amount_cents<>(purchase.amount_minor*20+50)/100
  THEN RAISE EXCEPTION 'Artist commission must match its approved 20 percent direct referrer'; END IF;
 ELSIF purchase.commission_revision='affiliate-opt-in-premium30-2026-11-05' OR EXISTS(SELECT 1 FROM affiliate_receipt_policies p WHERE p.artist_order_id=purchase.id) THEN
  RAISE EXCEPTION 'New artist commission allocations await approved rules';
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION lae_artist_package_team_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase record;
BEGIN
 SELECT o.*,s.direct_referrer_id,s.team_leader_id,COALESCE(p.policy_revision,s.policy_revision) AS commission_revision INTO purchase FROM commerce_orders o JOIN commerce_order_referral_snapshots s ON s.order_id=o.id LEFT JOIN affiliate_receipt_policies p ON p.artist_order_id=o.id WHERE o.subscription_id=NEW.subscription_id;
 IF purchase.commission_revision='artist-direct20-creator-milestones-2026-11-15' THEN RAISE EXCEPTION 'Artist indirect percentage replaced by creator milestones'; END IF;
 IF purchase.commission_revision='artist-packages-direct20-team10-2026-11-15' AND (purchase.kind<>'artist_subscription' OR NEW.affiliate_id IS DISTINCT FROM purchase.direct_referrer_id OR NEW.team_leader_id IS DISTINCT FROM purchase.team_leader_id OR NEW.base_amount_cents<>purchase.amount_minor OR NEW.team_leader_id=NEW.affiliate_id OR NEW.team_leader_id=purchase.artist_id) THEN RAISE EXCEPTION 'Artist team reward must match its approved two-step referral'; END IF;
 IF purchase.commission_revision='affiliate-opt-in-premium30-2026-11-05' THEN RAISE EXCEPTION 'Artist team allocation still awaits approved rules'; END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION lae_artist_policy_product_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.policy_revision IN('artist-packages-direct20-team10-2026-11-15','artist-direct20-creator-milestones-2026-11-15') AND NOT EXISTS(SELECT 1 FROM commerce_orders o WHERE o.id=NEW.artist_order_id AND o.kind='artist_subscription' AND o.plan IN('starter','growth','professional')) THEN RAISE EXCEPTION 'Approved artist policy applies only to artist packages'; END IF;
 RETURN NEW;
END $$;

-- Single evidence source for counting, reward review and database safeguards.
CREATE FUNCTION lae_creator_purchase_evidence(purchase_id UUID) RETURNS TABLE(creator_id BIGINT,direct_id BIGINT,leader_id BIGINT,mode TEXT,verified_at TIMESTAMPTZ) LANGUAGE sql STABLE AS $$
 SELECT o.artist_id,s.direct_referrer_id,s.team_leader_id,COALESCE(p.mode,CASE WHEN mr.order_id IS NOT NULL THEN 'live' END),r.verified_at
 FROM commerce_orders o JOIN commerce_receipts r ON r.order_id=o.id
 JOIN affiliate_receipt_policies rp ON rp.artist_order_id=o.id JOIN commerce_order_referral_snapshots s ON s.order_id=o.id
 JOIN artist_subscriptions sub ON sub.id=o.subscription_id
 LEFT JOIN payment_presentments p ON p.order_id=o.id LEFT JOIN payment_checkout_quotes q ON q.id=p.quote_id
 LEFT JOIN membership_royalty_renewals mr ON mr.order_id=o.id
 WHERE o.id=purchase_id AND o.kind='artist_subscription' AND o.plan IN('starter','growth','professional') AND o.status='paid' AND sub.status='paid' AND NOT sub.payment_hold
 AND rp.policy_revision='artist-direct20-creator-milestones-2026-11-15' AND r.currency='USD' AND r.amount_minor=o.amount_minor
 AND s.direct_referrer_id IS NOT NULL AND s.team_leader_id IS NOT NULL AND s.direct_referrer_id<>o.artist_id AND s.team_leader_id<>o.artist_id AND s.team_leader_id<>s.direct_referrer_id
 AND ((p.mode IN('live','test') AND p.base_currency=r.currency AND p.base_minor=r.amount_minor AND p.provider=r.provider AND p.merchant_id=r.merchant_id AND p.payment_id=r.payment_id AND q.base_minor=r.amount_minor AND q.charge_currency=p.charge_currency AND q.charge_minor=p.charge_minor)
 OR (mr.artist_id=o.artist_id AND mr.currency=r.currency AND mr.amount_minor=r.amount_minor AND r.provider='royalty_balance'))
 AND NOT EXISTS(SELECT 1 FROM payment_product_reversals rev WHERE rev.order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM payment_refund_cases rc WHERE rc.order_id=o.id AND rc.status NOT IN('declined','refunded'))
 AND NOT EXISTS(SELECT 1 FROM refund_complaints rc LEFT JOIN refund_complaint_reviews rr ON rr.complaint_id=rc.id WHERE rc.artist_order_id=o.id AND COALESCE(rr.status,'under_review')<>'resolved_no_refund')
$$;
CREATE TABLE creator_milestone_qualifications(
 id BIGSERIAL PRIMARY KEY,creator_id BIGINT NOT NULL REFERENCES creators(id),leader_id BIGINT NOT NULL REFERENCES creators(id),direct_referrer_id BIGINT NOT NULL REFERENCES creators(id),
 order_id UUID NOT NULL UNIQUE REFERENCES commerce_receipts(order_id),mode TEXT NOT NULL CHECK(mode IN('live','test')),verified_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(creator_id,mode),CHECK(creator_id<>leader_id AND creator_id<>direct_referrer_id AND leader_id<>direct_referrer_id)
);
CREATE INDEX creator_milestone_qualification_leader ON creator_milestone_qualifications(leader_id,mode,id);
CREATE TABLE creator_milestone_rewards(
 id UUID PRIMARY KEY,leader_id BIGINT NOT NULL REFERENCES creators(id),mode TEXT NOT NULL CHECK(mode IN('live','test')),stage SMALLINT NOT NULL CHECK(stage IN(1,2,3)),qualifying_count INTEGER NOT NULL,
 amount_minor BIGINT NOT NULL,currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency='USD'),status TEXT NOT NULL DEFAULT 'pending' CHECK(status='pending'),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(leader_id,mode,stage),
 CHECK((stage=1 AND qualifying_count=1000 AND amount_minor=90000) OR (stage=2 AND qualifying_count=10000 AND amount_minor=900000) OR (stage=3 AND qualifying_count=100000 AND amount_minor=9000000))
);
CREATE TABLE creator_milestone_reward_members(
 qualification_id BIGINT PRIMARY KEY REFERENCES creator_milestone_qualifications(id),reward_id UUID NOT NULL REFERENCES creator_milestone_rewards(id)
);
CREATE INDEX creator_milestone_members_reward ON creator_milestone_reward_members(reward_id);
CREATE TRIGGER creator_qualifications_immutable BEFORE UPDATE OR DELETE ON creator_milestone_qualifications FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER creator_rewards_immutable BEFORE UPDATE OR DELETE ON creator_milestone_rewards FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER creator_reward_members_immutable BEFORE UPDATE OR DELETE ON creator_milestone_reward_members FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE FUNCTION lae_creator_qualification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM lae_creator_purchase_evidence(NEW.order_id) e WHERE e.creator_id=NEW.creator_id AND e.direct_id=NEW.direct_referrer_id AND e.leader_id=NEW.leader_id AND e.mode=NEW.mode AND e.verified_at=NEW.verified_at) THEN RAISE EXCEPTION 'Creator milestone requires verified second-level artist purchase'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER creator_qualification_guard AFTER INSERT ON creator_milestone_qualifications DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lae_creator_qualification_guard();
CREATE FUNCTION lae_creator_reward_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (SELECT COUNT(*) FROM creator_milestone_reward_members m JOIN creator_milestone_qualifications q ON q.id=m.qualification_id JOIN LATERAL lae_creator_purchase_evidence(q.order_id) e ON e.creator_id=q.creator_id AND e.leader_id=q.leader_id AND e.mode=q.mode WHERE m.reward_id=NEW.id AND q.leader_id=NEW.leader_id AND q.mode=NEW.mode)<>NEW.qualifying_count
 OR (SELECT COUNT(*) FROM creator_milestone_reward_members WHERE reward_id=NEW.id)<>NEW.qualifying_count
 OR (SELECT COUNT(*) FROM creator_milestone_rewards WHERE leader_id=NEW.leader_id AND mode=NEW.mode AND stage<NEW.stage)<>NEW.stage-1
 THEN RAISE EXCEPTION 'Creator milestone reward requires distinct verified creators and prior milestones'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER creator_reward_guard AFTER INSERT ON creator_milestone_rewards DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lae_creator_reward_guard();
-- Reward membership can only be added in the same transaction that creates the reward.
-- This prevents a later insert from silently altering an already earned award.
CREATE FUNCTION lae_creator_reward_member_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM creator_milestone_rewards r JOIN creator_milestone_qualifications q ON q.id=NEW.qualification_id WHERE r.id=NEW.reward_id AND r.leader_id=q.leader_id AND r.mode=q.mode AND r.xmin::text::bigint=txid_current()%4294967296) THEN RAISE EXCEPTION 'Creator reward membership is immutable after earning'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER creator_reward_member_guard BEFORE INSERT ON creator_milestone_reward_members FOR EACH ROW EXECUTE FUNCTION lae_creator_reward_member_guard();
