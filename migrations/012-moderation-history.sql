-- Additive moderation state. Original comments, reports and catalog records are retained.
ALTER TABLE song_comments ADD COLUMN moderation_revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE song_comments ADD COLUMN platform_hold BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE song_comments ADD COLUMN moderation_updated_at TIMESTAMPTZ;
UPDATE song_comments SET platform_hold=TRUE WHERE status='held';
ALTER TABLE comment_reports ADD COLUMN resolved_at TIMESTAMPTZ;
ALTER TABLE comment_reports ADD COLUMN resolution TEXT CHECK(resolution IN ('approved','hidden'));
ALTER TABLE comment_reports ADD CONSTRAINT comment_report_resolution_pair CHECK((resolved_at IS NULL)=(resolution IS NULL));
CREATE INDEX idx_comment_reports_pending ON comment_reports(comment_id,id) WHERE resolved_at IS NULL;
CREATE INDEX idx_comments_review ON song_comments(status,created_at DESC,id DESC);
ALTER TABLE music_reports ADD COLUMN review_status TEXT NOT NULL DEFAULT 'open' CHECK(review_status IN ('open','dismissed','unpublished'));
ALTER TABLE music_reports ADD COLUMN review_revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE music_reports ADD COLUMN resolution_note TEXT;
ALTER TABLE music_reports ADD COLUMN resolved_at TIMESTAMPTZ;
ALTER TABLE music_reports ADD CONSTRAINT music_report_review_pair CHECK((review_status='open')=(resolved_at IS NULL));
CREATE INDEX idx_music_reports_review ON music_reports(review_status,id DESC);
CREATE FUNCTION lae_comment_moderation_revision() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Comment history cannot be deleted; hide the comment instead'; END IF;
 IF NEW.status='held' THEN NEW.platform_hold:=TRUE; END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.status,NEW.platform_hold) IS DISTINCT FROM ROW(OLD.status,OLD.platform_hold) THEN
  NEW.moderation_revision:=OLD.moderation_revision+1;NEW.moderation_updated_at:=NOW();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER comment_moderation_revision BEFORE INSERT OR DELETE OR UPDATE OF status,platform_hold ON song_comments FOR EACH ROW EXECUTE FUNCTION lae_comment_moderation_revision();
CREATE FUNCTION lae_moderation_report_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Moderation report history is append-only'; END IF;
 IF TG_TABLE_NAME='comment_reports' THEN
  IF ROW(NEW.id,NEW.comment_id,NEW.reporter_id,NEW.reason,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.comment_id,OLD.reporter_id,OLD.reason,OLD.created_at)
   OR (OLD.resolved_at IS NOT NULL AND ROW(NEW.resolved_at,NEW.resolution) IS DISTINCT FROM ROW(OLD.resolved_at,OLD.resolution)) THEN RAISE EXCEPTION 'Moderation report history is append-only'; END IF;
 ELSE
  IF ROW(NEW.id,NEW.track_id,NEW.reason,NEW.details,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.track_id,OLD.reason,OLD.details,OLD.created_at)
   OR (OLD.resolved_at IS NOT NULL AND ROW(NEW.review_status,NEW.review_revision,NEW.resolution_note,NEW.resolved_at) IS DISTINCT FROM ROW(OLD.review_status,OLD.review_revision,OLD.resolution_note,OLD.resolved_at)) THEN RAISE EXCEPTION 'Moderation report history is append-only'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER comment_report_history BEFORE UPDATE OR DELETE ON comment_reports FOR EACH ROW EXECUTE FUNCTION lae_moderation_report_history();
CREATE TRIGGER music_report_history BEFORE UPDATE OR DELETE ON music_reports FOR EACH ROW EXECUTE FUNCTION lae_moderation_report_history();
