-- Additive listener registration attribution only. No receipts, balances or commissions change.
ALTER TABLE listeners ADD COLUMN referred_by BIGINT REFERENCES creators(id);
CREATE INDEX listeners_referred_by_idx ON listeners(referred_by) WHERE referred_by IS NOT NULL;
