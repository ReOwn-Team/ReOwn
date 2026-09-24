ALTER TABLE listings ADD COLUMN icon text CHECK (icon ~ '^[a-z]{2,20}$');
ALTER TABLE listings ADD COLUMN location text CHECK (char_length(location) <= 40);
