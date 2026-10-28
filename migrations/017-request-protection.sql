-- Additive technical request budgets and aggregate operational counters. No business quotas or financial records change.
CREATE TABLE request_security_settings(id SMALLINT PRIMARY KEY CHECK(id=1),network_key TEXT NOT NULL CHECK(network_key ~ '^[a-f0-9]{64}$'),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TRIGGER request_security_settings_immutable BEFORE UPDATE OR DELETE ON request_security_settings FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TABLE request_rate_buckets(bucket TEXT PRIMARY KEY CHECK(bucket ~ '^[a-f0-9]{64}$'),rule TEXT NOT NULL CHECK(length(rule) BETWEEN 1 AND 40),subject_kind TEXT NOT NULL CHECK(subject_kind IN('network','account')),attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 1000000),expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX request_rate_expiry ON request_rate_buckets(expires_at);
CREATE TABLE request_security_metrics(hour TIMESTAMPTZ NOT NULL,rule TEXT NOT NULL CHECK(length(rule) BETWEEN 1 AND 40),subject_kind TEXT NOT NULL CHECK(subject_kind IN('network','account')),client_source TEXT NOT NULL CHECK(client_source IN('socket','trusted_forwarded','invalid_forwarded','account')),allowed BIGINT NOT NULL DEFAULT 0 CHECK(allowed>=0),blocked BIGINT NOT NULL DEFAULT 0 CHECK(blocked>=0),PRIMARY KEY(hour,rule,subject_kind,client_source));
CREATE INDEX request_metrics_retention ON request_security_metrics(hour);
