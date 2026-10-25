-- Additive: durable studio drafts and their media-copy leases; no existing balances or entitlements change.
CREATE TABLE IF NOT EXISTS studio_releases (
 id BIGSERIAL PRIMARY KEY,
 artist_id BIGINT NOT NULL REFERENCES creators(id),
 task_id TEXT NOT NULL REFERENCES sonic_test_tasks(task_id),
 clip_id VARCHAR(128) NOT NULL,
 title VARCHAR(140) NOT NULL,
 genre VARCHAR(60) NOT NULL,
 description VARCHAR(800) NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','copying','ready','failed','published')),
 rights_confirmed_at TIMESTAMPTZ NOT NULL,
 audio_key TEXT UNIQUE,
 audio_mime VARCHAR(32),
 audio_bytes INTEGER CHECK(audio_bytes>0 AND audio_bytes<=31457280),
 audio_sha256 CHAR(64),
 cover_key TEXT,
 cover_mime VARCHAR(32),
 warnings JSONB NOT NULL DEFAULT '[]',
 failure_code TEXT,
 lease_token UUID,
 lease_until TIMESTAMPTZ,
 attempts INTEGER NOT NULL DEFAULT 0,
 track_id BIGINT UNIQUE REFERENCES music_tracks(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(artist_id,task_id,clip_id),
 CHECK(status NOT IN ('ready','published') OR (audio_key IS NOT NULL AND audio_mime IS NOT NULL AND audio_bytes IS NOT NULL AND audio_sha256 IS NOT NULL)),
 CHECK(status<>'published' OR track_id IS NOT NULL),
 CHECK(status<>'copying' OR (lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_studio_releases_owner ON studio_releases(artist_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_releases_jobs ON studio_releases(status,lease_until,created_at);
ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS studio_release_id BIGINT UNIQUE REFERENCES studio_releases(id);
CREATE TABLE IF NOT EXISTS catalog_release_events (
 track_id BIGINT PRIMARY KEY REFERENCES music_tracks(id),
 artist_id BIGINT NOT NULL REFERENCES creators(id),
 delivered_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE listener_playlists ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE listener_playlist_tracks ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_music_discovery_new ON music_tracks((COALESCE(published_at,created_at)) DESC,id DESC) WHERE status='published';
CREATE INDEX IF NOT EXISTS idx_music_discovery_popular ON music_tracks(plays DESC,(COALESCE(published_at,created_at)) DESC,id DESC) WHERE status='published';
