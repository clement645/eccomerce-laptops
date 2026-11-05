-- Hand-written: human-readable order numbers (EL-<year>-<n>) without races.
-- A sequence never hands out the same value twice, even under concurrent checkouts.
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1001 INCREMENT BY 1 NO CYCLE;
