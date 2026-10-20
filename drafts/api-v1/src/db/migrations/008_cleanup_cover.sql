ALTER TABLE listings DROP COLUMN IF EXISTS reviewed_at;
ALTER TABLE listings DROP COLUMN IF EXISTS reviewed_by;
ALTER TABLE listings DROP COLUMN IF EXISTS hue;
ALTER TABLE listings ADD COLUMN cover text CHECK (cover ~ '^[a-z0-9-]+\.(jpg|jpeg|png|webp)$');
