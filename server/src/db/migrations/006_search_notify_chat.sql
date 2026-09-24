ALTER TABLE listings ADD COLUMN search_text text;
ALTER TABLE listings ADD COLUMN edited_at timestamptz;
DROP INDEX IF EXISTS listings_search_trgm;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX listings_search_text_trgm ON listings USING gin (search_text gin_trgm_ops)';
  END IF;
END $$;

CREATE TABLE search_log (
  id         bigserial PRIMARY KEY,
  term       text NOT NULL CHECK (char_length(term) BETWEEN 2 AND 60),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX search_log_recent ON search_log (created_at);

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  kind        text NOT NULL CHECK (kind ~ '^[a-z_.]{3,40}$'),
  title       text NOT NULL CHECK (char_length(title) <= 140),
  body        text CHECK (char_length(body) <= 500),
  link        text CHECK (link ~ '^/[A-Za-z0-9/_?=&%.-]*$'),
  dedupe_key  text UNIQUE,
  sms         boolean NOT NULL DEFAULT false,
  sms_sent_at timestamptz,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread ON notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX notifications_sms_pending ON notifications (created_at) WHERE sms AND sms_sent_at IS NULL;

CREATE TABLE conversations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id          uuid NOT NULL REFERENCES listings(id),
  buyer_id            uuid NOT NULL REFERENCES users(id),
  seller_id           uuid NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_message_at     timestamptz,
  buyer_last_read_at  timestamptz NOT NULL DEFAULT now(),
  seller_last_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_id),
  CHECK (buyer_id <> seller_id)
);
CREATE INDEX conversations_buyer ON conversations (buyer_id, last_message_at DESC);
CREATE INDEX conversations_seller ON conversations (seller_id, last_message_at DESC);

CREATE TABLE messages (
  id              bigserial PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  sender_id       uuid NOT NULL REFERENCES users(id),
  body            text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  flags           jsonb NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conv ON messages (conversation_id, id);
