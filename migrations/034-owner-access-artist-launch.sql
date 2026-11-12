-- Additive owner access and artist launch promotion.
-- Freeze the pre-update artist IDs once. Do not infer ownership from an email,
-- selected plan, client payload, account name or a reusable environment flag.
LOCK TABLE creators IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE artist_owner_access (
 artist_id BIGINT PRIMARY KEY REFERENCES creators(id),
 granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO artist_owner_access(artist_id) SELECT id FROM creators;
CREATE TRIGGER artist_owner_access_immutable BEFORE UPDATE OR DELETE ON artist_owner_access
 FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();

CREATE TABLE artist_launch_campaign (
 singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
 capacity INTEGER NOT NULL DEFAULT 200 CHECK(capacity=200),
 allocated INTEGER NOT NULL DEFAULT 0 CHECK(allocated BETWEEN 0 AND 200),
 activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO artist_launch_campaign(singleton) VALUES(TRUE);
CREATE TABLE artist_launch_grants (
 artist_id BIGINT PRIMARY KEY REFERENCES creators(id),
 slot SMALLINT NOT NULL UNIQUE CHECK(slot BETWEEN 1 AND 200),
 granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER artist_launch_grants_immutable BEFORE UPDATE OR DELETE ON artist_launch_grants
 FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE artist_free_music_usage (
 reservation_reference TEXT PRIMARY KEY,
 artist_id BIGINT NOT NULL REFERENCES creators(id),
 access_kind TEXT NOT NULL CHECK(access_kind IN ('owner','promotion')),
 task_reference TEXT UNIQUE,
 status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','completed','restored')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX artist_one_live_promotional_generation ON artist_free_music_usage(artist_id)
 WHERE access_kind='promotion' AND status IN ('reserved','completed');

CREATE TABLE IF NOT EXISTS generation_wallets (
 creator_id BIGINT PRIMARY KEY REFERENCES creators(id) ON DELETE CASCADE,
 credits INTEGER NOT NULL DEFAULT 0 CHECK(credits>=0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Every artist creation route uses this same transaction-bound allocation.
-- The single conditional UPDATE serializes concurrent registrations at 200.
CREATE FUNCTION lae_allocate_artist_launch() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE allocated_slot INTEGER;
BEGIN
 IF EXISTS(SELECT 1 FROM artist_owner_access WHERE artist_id=NEW.id) THEN RETURN NEW; END IF;
 UPDATE artist_launch_campaign SET allocated=allocated+1
  WHERE singleton AND allocated<capacity RETURNING allocated INTO allocated_slot;
 IF FOUND THEN
  INSERT INTO artist_launch_grants(artist_id,slot) VALUES(NEW.id,allocated_slot);
  -- One companion lyrics draft lets the same single music trial use either
  -- AI Creates My Song or the existing own-lyrics workflow.
  INSERT INTO generation_ledger(creator_id,delta,reason,reference)
   VALUES(NEW.id,1,'artist_launch_lyrics','artist-launch-200:'||NEW.id::text);
  INSERT INTO generation_wallets(creator_id,credits) VALUES(NEW.id,1)
   ON CONFLICT(creator_id) DO UPDATE SET credits=generation_wallets.credits+1,updated_at=NOW();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER artist_launch_registration AFTER INSERT ON creators
 FOR EACH ROW EXECUTE FUNCTION lae_allocate_artist_launch();
