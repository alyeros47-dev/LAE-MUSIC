-- Additive: keep all existing studio records, credit rules and upload codes intact.
-- The original engine creates generation_records lazily. Initialize that exact
-- existing contract on a fresh database before adding the provenance foreign key.
CREATE TABLE IF NOT EXISTS generation_records (
 id BIGSERIAL PRIMARY KEY,creator_id BIGINT NOT NULL REFERENCES creators(id),
 code_hash CHAR(64) NOT NULL UNIQUE,model TEXT NOT NULL,title TEXT NOT NULL,
 lyrics TEXT NOT NULL,style TEXT NOT NULL,used_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),generated_track_id BIGINT UNIQUE
);
CREATE TABLE music_dna_generations (
 generation_id BIGINT PRIMARY KEY REFERENCES generation_records(id),
 artist_id BIGINT NOT NULL REFERENCES creators(id),style_id TEXT NOT NULL,catalogue_revision TEXT NOT NULL,
 variation_id CHAR(64) NOT NULL,voice TEXT NOT NULL CHECK(voice IN ('neutral','male','female','duet','custom')),
 languages JSONB NOT NULL CHECK(jsonb_typeof(languages)='array'),
 lyrics_fingerprint CHAR(64) NOT NULL UNIQUE,profile_snapshot JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(artist_id,variation_id)
);
CREATE INDEX idx_music_dna_artist_history ON music_dna_generations(artist_id,generation_id DESC);
CREATE TRIGGER music_dna_history_immutable BEFORE UPDATE OR DELETE ON music_dna_generations FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
