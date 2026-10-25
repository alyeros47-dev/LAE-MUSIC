-- Additive named administration. Shared-key mode ends only after confirmed owner enrollment.
CREATE TABLE admin_auth_settings(id INTEGER PRIMARY KEY CHECK(id=1),named_enabled BOOLEAN NOT NULL DEFAULT FALSE);
INSERT INTO admin_auth_settings(id) VALUES(1);
CREATE TABLE admin_operators (
 id UUID PRIMARY KEY, display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 2 AND 100),
 email TEXT NOT NULL UNIQUE,password_salt TEXT NOT NULL,password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','content','finance','support')),
 status TEXT NOT NULL DEFAULT 'enrolling' CHECK(status IN ('enrolling','active','disabled')),
 auth_version INTEGER NOT NULL DEFAULT 1 CHECK(auth_version>0),sealed_factor TEXT NOT NULL,
 last_mfa_step BIGINT NOT NULL DEFAULT -1,
 enrollment_hash TEXT UNIQUE,enrollment_expires_at TIMESTAMPTZ,enrollment_issuer TEXT,
 replacement_factor TEXT,replacement_hash TEXT UNIQUE,replacement_expires_at TIMESTAMPTZ,
 invitation_id UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE admin_sessions (
 token_hash TEXT PRIMARY KEY,operator_id UUID NOT NULL REFERENCES admin_operators(id),
 auth_version INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL,mfa_at TIMESTAMPTZ NOT NULL,client_label TEXT NOT NULL,revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_admin_sessions_owner ON admin_sessions(operator_id,expires_at);
CREATE TABLE admin_recovery_codes (
 operator_id UUID NOT NULL REFERENCES admin_operators(id),code_hash TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),used_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ,
 PRIMARY KEY(operator_id,code_hash)
);
CREATE TABLE admin_operator_invitations (
 id UUID PRIMARY KEY,email TEXT NOT NULL,display_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','content','finance','support')),
 token_hash TEXT NOT NULL UNIQUE,inviter_id UUID NOT NULL REFERENCES admin_operators(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ NOT NULL,consumed_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_admin_invitation_open_email ON admin_operator_invitations(email) WHERE consumed_at IS NULL AND revoked_at IS NULL;
ALTER TABLE admin_operators ADD CONSTRAINT admin_operator_invitation_fk FOREIGN KEY(invitation_id) REFERENCES admin_operator_invitations(id);
