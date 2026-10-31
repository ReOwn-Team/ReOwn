BEGIN;

-- Canonicalize existing identifiers before enforcing uniqueness. Duplicates abort
-- the transaction instead of deleting or silently merging accounts.
UPDATE "users" SET "email" = lower(btrim("email")), "phone" = btrim("phone");

CREATE UNIQUE INDEX "users_email_unique" ON "users"("email");
CREATE UNIQUE INDEX "users_phone_unique" ON "users"("phone");

COMMIT;
