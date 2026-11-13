-- Additive Monnify provider support; no historical receipts or allocations change.
ALTER TABLE payment_checkout_quotes DROP CONSTRAINT payment_checkout_quotes_provider_check;
ALTER TABLE payment_checkout_quotes ADD CONSTRAINT payment_checkout_quotes_provider_check CHECK(provider IN('paystack','flutterwave','manual_bank_transfer','monnify'));
ALTER TABLE payment_checkout_attempts DROP CONSTRAINT payment_checkout_attempts_provider_check;
ALTER TABLE payment_checkout_attempts ADD CONSTRAINT payment_checkout_attempts_provider_check CHECK(provider IN('paystack','flutterwave','manual_bank_transfer','monnify'));
ALTER TABLE payment_checkout_attempts DROP CONSTRAINT payment_checkout_attempts_mode_check;
ALTER TABLE payment_checkout_attempts ADD CONSTRAINT payment_checkout_attempts_mode_check CHECK(mode='test' OR (provider IN('manual_bank_transfer','monnify') AND mode='live'));
ALTER TABLE payment_presentments DROP CONSTRAINT payment_presentments_mode_check;
ALTER TABLE payment_presentments ADD CONSTRAINT payment_presentments_mode_check CHECK(mode='test' OR (provider IN('manual_bank_transfer','monnify') AND mode='live'));
ALTER TABLE premium_attempts DROP CONSTRAINT premium_attempts_provider_check;
ALTER TABLE premium_attempts ADD CONSTRAINT premium_attempts_provider_check CHECK(provider IN('paystack','flutterwave','manual_bank_transfer','monnify'));
