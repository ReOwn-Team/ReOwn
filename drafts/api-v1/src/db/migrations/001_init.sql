CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone              text NOT NULL UNIQUE CHECK (phone ~ '^0[0-9]{9}$'),
  name               text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  school             text,
  role               text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked')),
  monthly_income     integer NOT NULL DEFAULT 0 CHECK (monthly_income BETWEEN 0 AND 500000000),
  other_debt_monthly integer NOT NULL DEFAULT 0 CHECK (other_debt_monthly BETWEEN 0 AND 500000000),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE otp_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL,
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_phone_idx ON otp_codes (phone, created_at DESC);

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_hash text NOT NULL UNIQUE,
  family_id    uuid NOT NULL,
  user_agent   text,
  ip           text,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE verifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('phone', 'cccd', 'bank', 'student')),
  status      text NOT NULL CHECK (status IN ('pending', 'verified', 'rejected')),
  doc_hash    text,
  doc_last4   text,
  provider_ref text,
  verified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, type)
);
CREATE UNIQUE INDEX verifications_doc_unique ON verifications (type, doc_hash)
  WHERE doc_hash IS NOT NULL AND status = 'verified';

CREATE TABLE listings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id    uuid NOT NULL REFERENCES users(id),
  title        text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
  category     text NOT NULL CHECK (category IN ('laptop', 'phone', 'study', 'fashion', 'home')),
  price        integer NOT NULL CHECK (price BETWEEN 10000 AND 100000000),
  market_price integer NOT NULL CHECK (market_price > 0),
  condition    integer NOT NULL CHECK (condition BETWEEN 1 AND 100),
  description  text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  hue          integer NOT NULL DEFAULT 200,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reserved', 'sold', 'hidden')),
  risk_level   text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  risk_flags   jsonb NOT NULL DEFAULT '[]',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listings_browse_idx ON listings (status, category, created_at DESC);
CREATE INDEX listings_seller_idx ON listings (seller_id);

CREATE TABLE orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid NOT NULL REFERENCES listings(id),
  buyer_id        uuid NOT NULL REFERENCES users(id),
  seller_id       uuid NOT NULL REFERENCES users(id),
  price           integer NOT NULL CHECK (price > 0),
  method          text NOT NULL CHECK (method IN ('full', 'bnpl')),
  term            integer CHECK (term IN (3, 6)),
  status          text NOT NULL CHECK (status IN ('paid', 'shipped', 'completed', 'cancelled_by_seller', 'refused_by_buyer', 'disputed', 'refunded')),
  payout_status   text NOT NULL DEFAULT 'held' CHECK (payout_status IN ('held', 'released', 'refunded')),
  release_at      timestamptz,
  idempotency_key text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  shipped_at      timestamptz,
  completed_at    timestamptz,
  closed_at       timestamptz,
  CHECK (buyer_id <> seller_id),
  CHECK ((method = 'bnpl') = (term IS NOT NULL)),
  UNIQUE (buyer_id, idempotency_key)
);
CREATE UNIQUE INDEX orders_one_live_per_listing ON orders (listing_id)
  WHERE status IN ('paid', 'shipped', 'completed', 'disputed');
CREATE INDEX orders_buyer_idx ON orders (buyer_id, created_at DESC);
CREATE INDEX orders_seller_idx ON orders (seller_id, created_at DESC);

CREATE TABLE ledger_entries (
  id         bigserial PRIMARY KEY,
  tx_id      uuid NOT NULL,
  account    text NOT NULL CHECK (account IN ('wallet', 'escrow', 'platform_fee', 'lender', 'external')),
  user_id    uuid REFERENCES users(id),
  order_id   uuid REFERENCES orders(id),
  amount     bigint NOT NULL CHECK (amount <> 0),
  memo       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((account = 'wallet') = (user_id IS NOT NULL))
);
CREATE INDEX ledger_wallet_idx ON ledger_entries (user_id) WHERE account = 'wallet';
CREATE INDEX ledger_tx_idx ON ledger_entries (tx_id);
CREATE INDEX ledger_order_idx ON ledger_entries (order_id);

CREATE FUNCTION ledger_check_balanced() RETURNS trigger AS $$
BEGIN
  IF (SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE tx_id = NEW.tx_id) <> 0 THEN
    RAISE EXCEPTION 'Ledger transaction % is not balanced', NEW.tx_id;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER ledger_balanced
  AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_check_balanced();

CREATE FUNCTION ledger_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

CREATE TABLE bnpl_plans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid NOT NULL UNIQUE REFERENCES orders(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  principal  integer NOT NULL CHECK (principal > 0),
  fee        integer NOT NULL CHECK (fee >= 0),
  total      integer NOT NULL CHECK (total = principal + fee),
  term       integer NOT NULL CHECK (term IN (3, 6)),
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid_off', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bnpl_user_idx ON bnpl_plans (user_id);

CREATE TABLE installments (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id   uuid NOT NULL REFERENCES bnpl_plans(id),
  n         integer NOT NULL CHECK (n >= 1),
  due_at    timestamptz NOT NULL,
  amount    integer NOT NULL CHECK (amount > 0),
  status    text NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'paid', 'cancelled')),
  paid_at   timestamptz,
  days_late integer CHECK (days_late >= 0),
  UNIQUE (plan_id, n),
  CHECK ((status = 'paid') = (paid_at IS NOT NULL))
);
CREATE INDEX installments_due_idx ON installments (status, due_at);

CREATE TABLE reviews (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid NOT NULL REFERENCES orders(id),
  from_user  uuid NOT NULL REFERENCES users(id),
  to_user    uuid NOT NULL REFERENCES users(id),
  direction  text NOT NULL CHECK (direction IN ('buyer_to_seller', 'seller_to_buyer')),
  stars      integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment    text CHECK (char_length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, direction),
  CHECK (from_user <> to_user)
);
CREATE INDEX reviews_to_idx ON reviews (to_user, direction);

CREATE TABLE disputes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL UNIQUE REFERENCES orders(id),
  opened_by   uuid NOT NULL REFERENCES users(id),
  reason      text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved_buyer', 'resolved_seller')),
  resolution  text,
  resolved_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE score_snapshots (
  id             bigserial PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('buyer', 'seller')),
  score          integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  tier           text NOT NULL,
  result         jsonb NOT NULL,
  engine_version text NOT NULL,
  trigger        text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX score_latest_idx ON score_snapshots (user_id, kind, created_at DESC);

CREATE TABLE audit_logs (
  id         bigserial PRIMARY KEY,
  actor_id   uuid,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  meta       jsonb NOT NULL DEFAULT '{}',
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_logs (entity, entity_id);
