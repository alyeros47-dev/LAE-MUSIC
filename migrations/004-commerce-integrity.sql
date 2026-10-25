-- Additive integrity constraints; conflicting historical rows require reconciliation, never deletion.
CREATE UNIQUE INDEX idx_finance_single_transfer ON finance_transfers(journal_id);
CREATE UNIQUE INDEX idx_subscription_owner_identity ON artist_subscriptions(id,artist_id);
ALTER TABLE commerce_orders ADD CONSTRAINT commerce_subscription_owner_fk
 FOREIGN KEY(subscription_id,artist_id) REFERENCES artist_subscriptions(id,artist_id);
ALTER TABLE commerce_orders ADD CONSTRAINT commerce_subscription_entitlement_check
 CHECK((kind='artist_subscription' OR subscription_id IS NULL) AND (status<>'paid' OR kind<>'artist_subscription' OR subscription_id IS NOT NULL));
-- Fulfillment inserts the grant and receipt in one transaction, so validate their link at commit.
ALTER TABLE studio_purchased_credits ADD CONSTRAINT purchased_credit_receipt_fk
 FOREIGN KEY(order_id) REFERENCES commerce_receipts(order_id) DEFERRABLE INITIALLY DEFERRED;
