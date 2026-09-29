export const BUYER_WEIGHTS = {
  identity: 25,
  repayment: 35,
  behavior: 20,
  capacity: 15,
  tenure: 5,
};

export const BUYER_IDENTITY_POINTS = { phone: 5, cccd: 10, bank: 6, student: 4 };

export const REPAYMENT_PRIOR = { good: 3, bad: 2 };
export const REPAYMENT_PENALTY = { late: 0.5, severe: 4, default: 12 };

export const DTI = { comfortable: 0.2, max: 0.5 };
export const MAX_INSTALLMENT_SHARE = 0.3;
export const INCOME_CAP = { selfDeclared: 3_000_000, bankVerified: 8_000_000 };

export const SELLER_WEIGHTS = {
  identity: 25,
  rating: 30,
  dispute: 20,
  delivery: 15,
  activity: 10,
};

export const SELLER_IDENTITY_POINTS = { phone: 5, cccd: 12, bank: 8 };
export const RATING_PRIOR = { mean: 3.5, weight: 3 };
export const MIN_REVIEWER_WEIGHT = 0.2;

export const TIERS = [
  { id: 'A', min: 80, label: 'Xuất sắc' },
  { id: 'B', min: 65, label: 'Tốt' },
  { id: 'C', min: 50, label: 'Khá' },
  { id: 'D', min: 35, label: 'Cần cải thiện' },
  { id: 'E', min: 0, label: 'Rủi ro cao' },
];

export const BNPL_POLICY = {
  A: { limit: 6_000_000, maxTerm: 6 },
  B: { limit: 4_000_000, maxTerm: 6 },
  C: { limit: 2_000_000, maxTerm: 3 },
  D: { limit: 0, maxTerm: 0 },
  E: { limit: 0, maxTerm: 0 },
};

export const DOWN_PAYMENT = { A: 0, B: 0.1, C: 0.2, D: 1, E: 1 };

export const BNPL_TERMS = [
  { term: 3, feeRate: 0 },
  { term: 6, feeRate: 0.025 },
];
export const DEFAULT_CAP = 30;
export const THIN_FILE_MIN_ONTIME = 3;
export const THIN_FILE_TIER = 'C';

export const SELLER_POLICY = {
  A: { escrowDays: 3, boost: 1.15, note: 'Giải ngân ngay khi hết 3 ngày khiếu nại, được ưu tiên hiển thị' },
  B: { escrowDays: 3, boost: 1.05, note: 'Giải ngân khi hết 3 ngày khiếu nại' },
  C: { escrowDays: 4, boost: 1.0, note: 'Giải ngân sau 4 ngày' },
  D: { escrowDays: 5, boost: 0.85, note: 'Giải ngân sau 5 ngày, giảm hiển thị' },
  E: { escrowDays: 7, boost: 0, note: 'Ẩn khỏi gợi ý AI, giữ tiền 7 ngày' },
};
export const UNVERIFIED_SELLER_MAX_LISTINGS = 3;
/** Người mua được khiếu nại trong N ngày sau khi nhận hàng — tiền phải còn giữ hộ ít nhất bằng chừng ấy. */
export const DISPUTE_WINDOW_DAYS = 3;

export const SUSPICIOUS_PRICE_RATIO = 0.45;

export function tierOf(score) {
  return TIERS.find((t) => score >= t.min);
}

export const MAX_BNPL_LIMIT = Math.max(...Object.values(BNPL_POLICY).map((p) => p.limit));
