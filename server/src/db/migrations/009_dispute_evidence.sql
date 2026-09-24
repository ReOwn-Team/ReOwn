ALTER TABLE listing_images ADD COLUMN dispute_id uuid REFERENCES disputes(id) ON DELETE CASCADE;
ALTER TABLE listing_images ADD CHECK (dispute_id IS NULL OR listing_id IS NULL);
CREATE INDEX listing_images_dispute ON listing_images (dispute_id) WHERE dispute_id IS NOT NULL;
DROP INDEX listing_images_pending;
CREATE INDEX listing_images_pending ON listing_images (owner_id, created_at) WHERE listing_id IS NULL AND dispute_id IS NULL;
