-- Additive receipt-review support. Preserve historical submissions and decisions.
-- A receipt upload is not a
-- claim that the customer supplied a bank transaction number or transfer time.
ALTER TABLE manual_bank_submissions ALTER COLUMN transfer_reference DROP NOT NULL;
ALTER TABLE manual_bank_submissions ALTER COLUMN transferred_at DROP NOT NULL;
ALTER TABLE manual_bank_submissions ADD CONSTRAINT manual_bank_submission_evidence_check
 CHECK ((transfer_reference IS NOT NULL AND transferred_at IS NOT NULL)
 OR (proof IS NOT NULL AND transfer_reference IS NULL AND transferred_at IS NULL));

ALTER TABLE manual_bank_reviews ADD COLUMN verification_method TEXT NOT NULL DEFAULT 'bank_details'
 CHECK (verification_method IN ('bank_details','receipt_review'));
ALTER TABLE manual_bank_reviews ADD COLUMN receipt_hash TEXT CHECK (receipt_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE manual_bank_reviews ADD CONSTRAINT manual_bank_review_receipt_unique UNIQUE(mode,receipt_hash);
ALTER TABLE manual_bank_reviews DROP CONSTRAINT manual_bank_reviews_check;
ALTER TABLE manual_bank_reviews ADD CONSTRAINT manual_bank_review_verification_check
 CHECK (decision='rejected' OR (received_minor IS NOT NULL AND received_minor>0 AND currency IS NOT NULL AND currency IN ('USD','NGN') AND (
  (verification_method='bank_details' AND bank_reference IS NOT NULL AND bank_reference_hash IS NOT NULL AND received_at IS NOT NULL)
  OR (verification_method='receipt_review' AND bank_reference IS NULL AND bank_reference_hash IS NULL AND received_at IS NULL)
 )));
