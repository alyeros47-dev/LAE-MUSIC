-- Additive only. Preserve existing role IDs, songs, purchases and balances. Link only after
-- explicit password/session proof; matching email addresses alone are not proof.
CREATE TABLE IF NOT EXISTS account_role_links (
 artist_id BIGINT PRIMARY KEY REFERENCES creators(id),
 listener_id BIGINT NOT NULL UNIQUE REFERENCES listeners(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
