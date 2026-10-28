-- Additive: persistent complimentary music requests; no purchase, commission or withdrawable balance.
CREATE TABLE IF NOT EXISTS artist_test_generations (
  reservation_reference TEXT PRIMARY KEY,
  artist_id BIGINT NOT NULL REFERENCES creators(id),
  task_reference TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','completed','restored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS artist_test_generations_owner ON artist_test_generations(artist_id,status);
