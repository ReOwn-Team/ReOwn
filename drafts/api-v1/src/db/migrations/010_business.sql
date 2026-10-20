-- Giao hàng: gửi qua đơn vị vận chuyển hoặc gặp trực tiếp (xác nhận bằng mã 6 số người mua đọc cho người bán)
ALTER TABLE orders
  ADD COLUMN delivery          text NOT NULL DEFAULT 'ship' CHECK (delivery IN ('ship', 'meetup')),
  ADD COLUMN ship_to           text CHECK (char_length(ship_to) <= 300),
  ADD COLUMN meetup_note       text CHECK (char_length(meetup_note) <= 200),
  ADD COLUMN carrier           text CHECK (char_length(carrier) <= 40),
  ADD COLUMN tracking_code     text CHECK (char_length(tracking_code) <= 40),
  ADD COLUMN handover_code     text CHECK (handover_code ~ '^\d{6}$'),
  ADD COLUMN handover_attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN refund_amount     integer CHECK (refund_amount >= 0),
  ADD COLUMN return_carrier    text CHECK (char_length(return_carrier) <= 40),
  ADD COLUMN return_tracking   text CHECK (char_length(return_tracking) <= 40),
  ADD COLUMN return_due_at     timestamptz,
  ADD COLUMN return_shipped_at timestamptz;

-- Trả hàng trước khi hoàn tiền: return_pending (chờ người mua gửi trả) → returning (đang gửi trả)
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'paid', 'shipped', 'completed', 'cancelled_by_seller', 'refused_by_buyer', 'disputed', 'return_pending', 'returning', 'refunded'));
DROP INDEX orders_one_live_per_listing;
CREATE UNIQUE INDEX orders_one_live_per_listing ON orders (listing_id)
  WHERE status IN ('paid', 'shipped', 'completed', 'disputed', 'return_pending', 'returning');

-- Tranh chấp hai chiều + hoàn một phần
ALTER TABLE disputes DROP CONSTRAINT disputes_status_check;
ALTER TABLE disputes ADD CONSTRAINT disputes_status_check CHECK (status IN ('open', 'resolved_buyer', 'resolved_seller', 'resolved_partial'));
ALTER TABLE disputes
  ADD COLUMN remedy              text CHECK (remedy IN ('refund', 'return_refund', 'partial')),
  ADD COLUMN refund_amount       integer CHECK (refund_amount > 0),
  ADD COLUMN seller_response     text CHECK (char_length(seller_response) BETWEEN 10 AND 1000),
  ADD COLUMN seller_responded_at timestamptz,
  ADD COLUMN respond_by          timestamptz;
UPDATE disputes SET respond_by = created_at + interval '48 hours' WHERE respond_by IS NULL;

-- Phí trả trễ theo kỳ
ALTER TABLE installments ADD COLUMN late_fee integer NOT NULL DEFAULT 0 CHECK (late_fee >= 0);

-- Rút tiền từ ví về tài khoản ngân hàng đã xác thực
CREATE TABLE withdrawals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id),
  amount     integer NOT NULL CHECK (amount > 0),
  bank_last4 text NOT NULL CHECK (bank_last4 ~ '^\d{4}$'),
  status     text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'failed')),
  reference  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX withdrawals_user_idx ON withdrawals (user_id, created_at DESC);
