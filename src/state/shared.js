import { createContext, useEffect, useState } from 'react';

export const Ctx = createContext(null);
export const DAY = 86_400_000;
export const LATE_DAYS = { onTime: 0, late: 5, severe: 15, clearDefault: 35 };

export function useToast() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(t);
  }, [toast]);
  return [toast, setToast];
}

// Thông báo sau mỗi thao tác — dùng chung cho 2 chế độ
const MSG = {
  verify: 'Đã xác thực — điểm được cập nhật', placeOrder: 'Đặt hàng thành công — tiền được ReOwn giữ hộ đến khi bạn nhận hàng',
  confirmReceived: 'Đã xác nhận nhận hàng', bomOrder: 'Đã từ chối nhận hàng — tiền được hoàn',
  openDispute: 'Đã gửi khiếu nại — tiền được giữ lại chờ xử lý', addListing: 'Đã đăng tin', topup: 'Đã nạp tiền (giả lập)',
  shipOrder: 'Đã xác nhận gửi hàng', devShip: 'Mô phỏng: người bán đã gửi hàng', sellerCancel: 'Đã huỷ đơn và hoàn tiền cho người mua',
  editListing: 'Đã lưu thay đổi', handover: 'Giao hàng thành công — tiền đã về ví của bạn', respondDispute: 'Đã gửi phản hồi — ReOwn sẽ xem xét ảnh của hai bên',
  returnShip: 'Đã báo gửi trả hàng', returnReceived: 'Đã xác nhận nhận lại hàng — tiền được hoàn cho người mua', withdraw: 'Đã chuyển tiền về tài khoản ngân hàng (mô phỏng)',
  payoff: 'Đã tất toán khoản trả sau', hideListing: 'Đã gỡ tin', devDueIn: 'Mô phỏng: kỳ trả sắp đến hạn — xem chuông thông báo', review: 'Đã gửi đánh giá',
};
const PAY_MSG = { onTime: 'Đã trả kỳ', late: 'Mô phỏng: trả trễ 5 ngày', severe: 'Mô phỏng: trả trễ 15 ngày', default: 'Mô phỏng: quá hạn hơn 30 ngày', clearDefault: 'Đã tất toán khoản quá hạn' };
export const toastFor = (a) => (a.type === 'payInstallment' ? PAY_MSG[a.mode] : MSG[a.type]);
