CREATE TABLE wallet_balances (
  user_id    uuid PRIMARY KEY REFERENCES users(id),
  balance    bigint NOT NULL DEFAULT 0 CONSTRAINT wallet_balances_balance_check CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO wallet_balances (user_id, balance)
SELECT user_id, SUM(amount) FROM ledger_entries WHERE account = 'wallet' GROUP BY user_id;

CREATE FUNCTION wallet_apply_entry() RETURNS trigger AS $$
BEGIN
  UPDATE wallet_balances SET balance = balance + NEW.amount, updated_at = now() WHERE user_id = NEW.user_id;
  IF NOT FOUND THEN
    INSERT INTO wallet_balances (user_id, balance, updated_at) VALUES (NEW.user_id, NEW.amount, now());
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_wallet_balance AFTER INSERT ON ledger_entries
  FOR EACH ROW WHEN (NEW.account = 'wallet') EXECUTE FUNCTION wallet_apply_entry();

CREATE FUNCTION wallet_balances_guard() RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'wallet_balances chỉ được cập nhật qua sổ cái';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;
CREATE TRIGGER wallet_balances_no_direct BEFORE UPDATE OR DELETE ON wallet_balances
  FOR EACH ROW EXECUTE FUNCTION wallet_balances_guard();

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN insufficient_privilege OR undefined_file THEN
  RAISE NOTICE 'Bỏ qua pg_trgm: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX listings_search_trgm ON listings USING gin ((title || '' '' || description) gin_trgm_ops)';
  END IF;
END $$;

CREATE INDEX otp_expires_idx ON otp_codes (expires_at);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);
