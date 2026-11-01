ALTER TABLE "products"
ADD COLUMN "request_hash" VARCHAR(64),
ADD COLUMN "location" VARCHAR(200) NOT NULL DEFAULT '',
ADD COLUMN "fulfillment_methods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "products_seller_id_status_index" ON "products"("seller_id", "status");
CREATE INDEX "products_status_published_at_index" ON "products"("status", "published_at");
INSERT INTO "categories" ("id", "name", "slug", "sort_order", "is_active")
SELECT v.id::uuid, v.name, v.slug, v.sort_order, true FROM (VALUES
('00000000-0000-4000-8000-000000000101', 'Laptop', 'laptop', 1),
('00000000-0000-4000-8000-000000000102', 'Điện thoại', 'dien-thoai', 2),
('00000000-0000-4000-8000-000000000103', 'Phụ kiện', 'phu-kien', 3),
('00000000-0000-4000-8000-000000000104', 'Sách', 'sach', 4),
('00000000-0000-4000-8000-000000000105', 'Đồ dùng', 'do-dung', 5),
('00000000-0000-4000-8000-000000000106', 'Sở thích', 'so-thich', 6)
) AS v(id, name, slug, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM "categories" c WHERE c.slug = v.slug);
