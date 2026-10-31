CREATE TABLE listing_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES users(id),
  listing_id  uuid REFERENCES listings(id),
  position    smallint CHECK (position BETWEEN 0 AND 2),
  mime        text NOT NULL CHECK (mime = 'image/webp'),
  bytes       bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 600000),
  width       integer NOT NULL CHECK (width BETWEEN 1 AND 1600),
  height      integer NOT NULL CHECK (height BETWEEN 1 AND 1600),
  sha256      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((listing_id IS NULL) = (position IS NULL))
);
CREATE UNIQUE INDEX listing_images_slot ON listing_images (listing_id, position) WHERE listing_id IS NOT NULL;
CREATE INDEX listing_images_pending ON listing_images (owner_id, created_at) WHERE listing_id IS NULL;
