-- Additive durable in-app records only. No emails, push delivery, payments or entitlement changes.
CREATE TABLE artist_notifications (
 id BIGSERIAL PRIMARY KEY,artist_id BIGINT NOT NULL REFERENCES creators(id),
 source_key TEXT NOT NULL CHECK(length(source_key) BETWEEN 1 AND 250),
 kind TEXT NOT NULL CHECK(kind IN ('subscription','purchase','studio','withdrawal','commission','refund')),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 140),
 message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 800),
 destination TEXT NOT NULL CHECK(destination IN ('/workspace?tab=plans','/workspace?tab=purchases','/workspace?tab=releases','/workspace?tab=finance','/studio','/partners')),
 event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),read_at TIMESTAMPTZ,
 UNIQUE(artist_id,source_key)
);
CREATE INDEX idx_artist_notifications_inbox ON artist_notifications(artist_id,id DESC);
CREATE INDEX idx_artist_notifications_unread ON artist_notifications(artist_id,id DESC) WHERE read_at IS NULL;
CREATE FUNCTION lae_artist_notification_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Artist notification history is append-only'; END IF;
 IF ROW(NEW.id,NEW.artist_id,NEW.source_key,NEW.kind,NEW.title,NEW.message,NEW.destination,NEW.event_at,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.artist_id,OLD.source_key,OLD.kind,OLD.title,OLD.message,OLD.destination,OLD.event_at,OLD.created_at)
 THEN RAISE EXCEPTION 'Artist notification history is append-only'; END IF;
 IF OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at THEN RAISE EXCEPTION 'Notification acknowledgement cannot be reset'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER artist_notifications_history BEFORE UPDATE OR DELETE ON artist_notifications FOR EACH ROW EXECUTE FUNCTION lae_artist_notification_history();

CREATE FUNCTION lae_artist_record_notification() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE owner_id BIGINT; event_key TEXT; event_kind TEXT; event_title TEXT; event_message TEXT; target TEXT;
BEGIN
 IF TG_TABLE_NAME='commerce_orders' THEN
  IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NULL; END IF;
  IF NEW.status NOT IN ('paid','cancelled') THEN RETURN NULL; END IF;
  owner_id:=NEW.artist_id;event_key:='purchase:'||NEW.id||':'||NEW.status;event_kind:='purchase';target:='/workspace?tab=purchases';
  IF NEW.status='paid' THEN event_title:='Purchase payment verified';event_message:='Your product payment was verified. Review your purchase and account benefits. Provider settlement and withdrawable earnings are separate.';
  ELSE event_title:='Purchase record cancelled';event_message:='Your unpaid purchase record was cancelled. This does not represent a money refund.'; END IF;
 ELSIF TG_TABLE_NAME='finance_withdrawals' THEN
  IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NULL; END IF;
  owner_id:=NEW.artist_id;event_key:='withdrawal:'||NEW.id||':'||NEW.status;event_kind:='withdrawal';target:='/workspace?tab=finance';
  IF NEW.status='pending' THEN event_title:='Withdrawal requested';event_message:='Your request was recorded and the gross amount reserved. Review the 3% service charge and net amount in your earnings workspace.';
  ELSIF NEW.status='approved' THEN event_title:='Withdrawal approved';event_message:='Your request was approved. Funds remain reserved; this is not a completed bank payment.';
  ELSIF NEW.status='rejected' THEN event_title:='Withdrawal rejected';event_message:='Your request was rejected and its reserved amount released. Review the withdrawal record.';
  ELSE RETURN NULL; END IF;
 ELSIF TG_TABLE_NAME='studio_releases' THEN
  IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NULL; END IF;
  IF NEW.status NOT IN ('ready','failed','published') THEN RETURN NULL; END IF;
  owner_id:=NEW.artist_id;event_key:='release:'||NEW.id||':'||NEW.status||':'||NEW.attempts;event_kind:='studio';target:='/workspace?tab=releases';
  IF NEW.status='ready' THEN event_title:='Your studio draft is ready';event_message:='The audio copy completed. Preview your private draft and review its details before publishing.';
  ELSIF NEW.status='published' THEN event_title:='Your studio song is published';event_message:='Your draft was published to the catalog. Open your release records to review it.';
  ELSE event_title:='A studio import needs attention';event_message:='The audio could not be saved as a draft. Review the import status before taking another action.'; END IF;
 ELSIF TG_TABLE_NAME='sonic_test_tasks' THEN
  IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NULL; END IF;
  IF NEW.status NOT IN ('succeeded','failed') THEN RETURN NULL; END IF;
  owner_id:=NEW.creator_id;event_key:='generation:'||md5(NEW.task_id)||':'||NEW.status;event_kind:='studio';target:='/studio';
  IF NEW.status='succeeded' THEN event_title:='Generation completed';event_message:='Your provider task completed. Review the available previews and save an owned result as a private studio draft.';
  ELSE event_title:='Generation needs attention';event_message:='Your task was recorded as failed. Review its status and allowance records. This notification does not authorize a retry or another charge.'; END IF;
 ELSIF TG_TABLE_NAME='affiliate_subscription_commissions' THEN
  IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NULL; END IF;
  IF NEW.tier<>1 OR NEW.status NOT IN ('pending','reversed','reconciliation_required') THEN RETURN NULL; END IF;
  owner_id:=NEW.referrer_id;event_key:='commission:'||NEW.id||':'||NEW.status;event_kind:='commission';target:='/partners';
  IF NEW.status='pending' THEN event_title:='Product-sale commission recorded';event_message:='A direct product-sale commission is pending clearance and reconciliation. Pending commissions are not withdrawable.';
  ELSE event_title:='Commission record updated';event_message:='A related purchase reversal changed a commission record. Review the sales history and any reconciliation hold.'; END IF;
 ELSIF TG_TABLE_NAME='payment_product_reversals' THEN
  SELECT artist_id INTO owner_id FROM commerce_orders WHERE id=NEW.order_id;
  event_key:='refund:'||NEW.order_id;event_kind:='refund';target:='/workspace?tab=purchases';event_title:='Product refund verified';event_message:='A full product refund was independently verified and its purchase benefits reversed. Review the original purchase and refund records.';
 ELSE RETURN NULL; END IF;
 INSERT INTO artist_notifications(artist_id,source_key,kind,title,message,destination) VALUES(owner_id,event_key,event_kind,event_title,event_message,target) ON CONFLICT(artist_id,source_key) DO NOTHING;
 RETURN NULL;
END $$;
CREATE TRIGGER artist_notice_purchase AFTER INSERT OR UPDATE OF status ON commerce_orders FOR EACH ROW EXECUTE FUNCTION lae_artist_record_notification();
CREATE TRIGGER artist_notice_withdrawal AFTER INSERT OR UPDATE OF status ON finance_withdrawals FOR EACH ROW EXECUTE FUNCTION lae_artist_record_notification();
CREATE TRIGGER artist_notice_release AFTER INSERT OR UPDATE OF status ON studio_releases FOR EACH ROW EXECUTE FUNCTION lae_artist_record_notification();
CREATE TRIGGER artist_notice_generation AFTER INSERT OR UPDATE OF status ON sonic_test_tasks FOR EACH ROW EXECUTE FUNCTION lae_artist_record_notification();
CREATE TRIGGER artist_notice_commission AFTER INSERT OR UPDATE OF status ON affiliate_subscription_commissions FOR EACH ROW EXECUTE FUNCTION lae_artist_record_notification();
CREATE TRIGGER artist_notice_refund AFTER INSERT ON payment_product_reversals FOR EACH ROW EXECUTE FUNCTION lae_artist_record_notification();
