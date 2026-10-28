-- Additive Premium-only website offline grants and append-only synchronized signals. No paid downloads or new commissions.
CREATE TABLE offline_devices(id UUID PRIMARY KEY,listener_id BIGINT NOT NULL REFERENCES listeners(id),public_jwk JSONB NOT NULL,label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 80),last_sequence BIGINT NOT NULL DEFAULT 0,revoked_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(id,listener_id));
CREATE INDEX offline_devices_owner ON offline_devices(listener_id,created_at DESC);
CREATE TABLE offline_challenges(id UUID PRIMARY KEY,device_id UUID NOT NULL REFERENCES offline_devices(id),nonce TEXT NOT NULL UNIQUE,action TEXT NOT NULL CHECK(action IN('grant','sync')),expires_at TIMESTAMPTZ NOT NULL,consumed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX offline_challenges_device ON offline_challenges(device_id,created_at DESC);
CREATE TABLE offline_grants(id UUID PRIMARY KEY,listener_id BIGINT NOT NULL REFERENCES listeners(id),device_id UUID NOT NULL,track_id BIGINT NOT NULL REFERENCES music_tracks(id),entitlement_id BIGINT NOT NULL,asset_hash TEXT NOT NULL,issued_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ NOT NULL,token JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK(expires_at>issued_at),UNIQUE(id,device_id,listener_id),FOREIGN KEY(device_id,listener_id) REFERENCES offline_devices(id,listener_id),FOREIGN KEY(entitlement_id,listener_id) REFERENCES premium_entitlements(id,listener_id));
CREATE INDEX offline_grants_device ON offline_grants(device_id,track_id,expires_at);
CREATE TABLE offline_media_tickets(id UUID PRIMARY KEY,grant_id UUID NOT NULL REFERENCES offline_grants(id),token_hash TEXT NOT NULL UNIQUE,expires_at TIMESTAMPTZ NOT NULL,consumed_at TIMESTAMPTZ);
CREATE TABLE offline_sync_batches(id UUID PRIMARY KEY,device_id UUID NOT NULL REFERENCES offline_devices(id),challenge_id UUID NOT NULL REFERENCES offline_challenges(id),payload_hash TEXT NOT NULL,signature TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE offline_play_events(id UUID PRIMARY KEY,device_id UUID NOT NULL,listener_id BIGINT NOT NULL,grant_id UUID NOT NULL,batch_id UUID NOT NULL REFERENCES offline_sync_batches(id),sequence BIGINT NOT NULL CHECK(sequence>0),event_hash TEXT NOT NULL,started_at TIMESTAMPTZ NOT NULL,ended_at TIMESTAMPTZ NOT NULL,listened_ms INTEGER NOT NULL,status TEXT NOT NULL,playback_id UUID UNIQUE REFERENCES premium_playback(id),received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(device_id,sequence),FOREIGN KEY(grant_id,device_id,listener_id) REFERENCES offline_grants(id,device_id,listener_id));
CREATE INDEX offline_events_review ON offline_play_events(received_at DESC,status);
ALTER TABLE premium_streams ADD COLUMN source TEXT NOT NULL DEFAULT 'online' CHECK(source IN('online','offline'));
ALTER TABLE premium_streams ADD COLUMN offline_event_id UUID UNIQUE REFERENCES offline_play_events(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE premium_streams ADD CONSTRAINT offline_stream_source CHECK((source='offline')=(offline_event_id IS NOT NULL));
CREATE TRIGGER offline_grants_immutable BEFORE UPDATE OR DELETE ON offline_grants FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER offline_batches_immutable BEFORE UPDATE OR DELETE ON offline_sync_batches FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE TRIGGER offline_events_immutable BEFORE UPDATE OR DELETE ON offline_play_events FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE FUNCTION lae_offline_device_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Offline device history cannot be deleted'; END IF;
 IF ROW(NEW.id,NEW.listener_id,NEW.public_jwk,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.listener_id,OLD.public_jwk,OLD.created_at) OR NEW.last_sequence<OLD.last_sequence OR OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN RAISE EXCEPTION 'Offline device identity and revocation cannot be rewritten'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER offline_device_guard BEFORE UPDATE OR DELETE ON offline_devices FOR EACH ROW EXECUTE FUNCTION lae_offline_device_guard();
CREATE TABLE offline_grant_revocations(grant_id UUID PRIMARY KEY REFERENCES offline_grants(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TRIGGER offline_revocations_immutable BEFORE UPDATE OR DELETE ON offline_grant_revocations FOR EACH ROW EXECUTE FUNCTION lae_reject_history_mutation();
CREATE FUNCTION lae_offline_one_use_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Offline verification history cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-'consumed_at') IS DISTINCT FROM (to_jsonb(OLD)-'consumed_at') OR OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at THEN RAISE EXCEPTION 'Offline verification binding is immutable and single-use'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER offline_challenge_guard BEFORE UPDATE OR DELETE ON offline_challenges FOR EACH ROW EXECUTE FUNCTION lae_offline_one_use_guard();
CREATE TRIGGER offline_ticket_guard BEFORE UPDATE OR DELETE ON offline_media_tickets FOR EACH ROW EXECUTE FUNCTION lae_offline_one_use_guard();
