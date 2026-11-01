ALTER TABLE products ADD COLUMN review_status VARCHAR(30) NOT NULL DEFAULT 'not_required', ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
CREATE TABLE product_evidence (
 id UUID PRIMARY KEY, product_id UUID NOT NULL, original_key TEXT, original_mime TEXT NOT NULL,
 sha256 VARCHAR(64) NOT NULL, metadata JSONB NOT NULL, expires_at TIMESTAMPTZ(3) NOT NULL,
 purged_at TIMESTAMPTZ(3), created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX product_evidence_expires_at_idx ON product_evidence(expires_at);
CREATE INDEX product_evidence_product_id_idx ON product_evidence(product_id);
CREATE TABLE product_reviews (
 id UUID PRIMARY KEY, product_id UUID NOT NULL REFERENCES products(id), revision INTEGER NOT NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'pending', snapshot JSONB NOT NULL,
 reviewed_by UUID, reason TEXT, reviewed_at TIMESTAMPTZ(3), created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(product_id, revision)
);
CREATE INDEX product_reviews_status_created_at_idx ON product_reviews(status, created_at);
CREATE TABLE product_inspections (
 id UUID PRIMARY KEY, review_id UUID NOT NULL REFERENCES product_reviews(id), status VARCHAR(30) NOT NULL DEFAULT 'queued',
 attempts INTEGER NOT NULL DEFAULT 0, model TEXT, prompt_version TEXT NOT NULL DEFAULT 'v1', report JSONB,
 error_code TEXT, next_attempt_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX product_inspections_status_next_attempt_at_idx ON product_inspections(status, next_attempt_at);
