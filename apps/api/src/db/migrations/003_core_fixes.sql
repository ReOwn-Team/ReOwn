ALTER TABLE listings ALTER COLUMN market_price DROP NOT NULL;
COMMENT ON COLUMN listings.market_price IS 'Giá tham chiếu ReOwn tính lúc đăng (không phải giá người bán khai)';

ALTER TABLE bnpl_plans ADD COLUMN down_payment integer NOT NULL DEFAULT 0 CHECK (down_payment >= 0);
