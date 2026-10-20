ALTER TABLE listings ADD COLUMN reviewed_at timestamptz;
ALTER TABLE listings ADD COLUMN reviewed_by uuid REFERENCES users(id);
ALTER TABLE users ADD COLUMN locked_reason text CHECK (char_length(locked_reason) <= 300);
