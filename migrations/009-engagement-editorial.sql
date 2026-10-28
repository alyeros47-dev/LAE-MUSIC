-- Additive engagement history starts at rollout. Historical counters are not reconstructed.
CREATE TABLE music_play_gates (
 track_id BIGINT NOT NULL REFERENCES music_tracks(id), viewer_key TEXT NOT NULL,
 last_counted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(track_id,viewer_key)
);
CREATE TABLE music_play_events (
 id BIGSERIAL PRIMARY KEY, track_id BIGINT NOT NULL REFERENCES music_tracks(id),
 artist_id BIGINT NOT NULL REFERENCES creators(id), listener_id BIGINT REFERENCES listeners(id),
 viewer_key TEXT NOT NULL CHECK(viewer_key ~ '^[a-f0-9]{64}$'),
 received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 source TEXT NOT NULL CHECK(source IN ('player','legacy'))
);
CREATE INDEX idx_play_events_artist_time ON music_play_events(artist_id,received_at DESC);
CREATE INDEX idx_play_events_track_time ON music_play_events(track_id,received_at DESC);
CREATE INDEX idx_play_events_time ON music_play_events(received_at DESC);
CREATE TRIGGER play_events_immutable BEFORE UPDATE OR DELETE ON music_play_events FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE editorial_configuration (
 id INTEGER PRIMARY KEY CHECK(id=1), revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0),
 track_ids JSONB NOT NULL DEFAULT '[]', artist_ids JSONB NOT NULL DEFAULT '[]',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO editorial_configuration(id) VALUES(1);
CREATE TABLE homepage_promotions (
 id UUID PRIMARY KEY, title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 100),
 description TEXT NOT NULL DEFAULT '' CHECK(length(description)<=260),
 action_label TEXT NOT NULL CHECK(length(action_label) BETWEEN 2 AND 40), destination TEXT NOT NULL,
 starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, archived BOOLEAN NOT NULL DEFAULT FALSE,
 sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 100),
 revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0),
 artwork BYTEA, artwork_mime TEXT CHECK(artwork_mime IN ('image/png','image/jpeg','image/webp')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at),
 CHECK((artwork IS NULL)=(artwork_mime IS NULL)), CHECK(artwork IS NULL OR octet_length(artwork)<=700000)
);
CREATE INDEX idx_promotions_visible ON homepage_promotions(sort_order,created_at) WHERE archived=FALSE;
