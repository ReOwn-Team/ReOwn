// Quy định nghiệp vụ dùng chung cho máy chủ và giao diện (một nguồn số liệu duy nhất).
export const LATE_FEE = 30_000;
export const LATE_FEE_GRACE_DAYS = 3;
export const WITHDRAW_MIN = 50_000;
export const WITHDRAW_DAILY_MAX = 3;
export const DISPUTE_RESPONSE_HOURS = 48;
export const RETURN_SHIP_DAYS = 5;
export const RETURN_CONFIRM_DAYS = 7;
export const HANDOVER_MAX_ATTEMPTS = 5;
// Người bán phải gửi hàng (hoặc giao trực tiếp) trong hạn; quá hạn người mua được tự huỷ,
// quá thêm AUTO_CANCEL_GRACE_DAYS thì ReOwn tự huỷ và hoàn tiền để tiền không bị kẹt.
export const SHIP_DEADLINE_DAYS = 3;
export const MEETUP_DEADLINE_DAYS = 7;
export const AUTO_CANCEL_GRACE_DAYS = 2;

/** Hạn người bán phải gửi / giao hàng cho một đơn (mốc thời gian, ms). */
export function shipDeadline(delivery, createdAt) {
  const days = delivery === 'meetup' ? MEETUP_DEADLINE_DAYS : SHIP_DEADLINE_DAYS;
  return new Date(createdAt).getTime() + days * 86_400_000;
}
export const CARRIERS = ['GHN', 'GHTK', 'J&T Express', 'Viettel Post', 'SPX Express', 'Ahamove', 'Grab Express', 'Khác'];

/** Phí trễ của một kỳ nếu trả vào thời điểm `at` (trễ quá số ngày ân hạn thì tính một lần mỗi kỳ). */
export function lateFeeFor(due, at = Date.now()) {
  const days = Math.floor((new Date(at).getTime() - new Date(due).getTime()) / 86_400_000);
  return days > LATE_FEE_GRACE_DAYS ? LATE_FEE : 0;
}
