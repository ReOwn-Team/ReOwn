export const money = (v) => Math.round(v).toLocaleString('vi-VN') + '₫';

export function short(v) {
  if (v >= 1_000_000) return (Math.round(v / 100_000) / 10).toLocaleString('vi-VN') + 'tr';
  return Math.round(v / 1000) + 'K';
}

export const discount = (p, ref) => (ref && ref.price > p.price ? Math.round((1 - p.price / ref.price) * 100) : 0);

export const parseMoney = (s) => Number(String(s).replace(/\D/g, '')) || 0;

export function timeAgo(p) {
  const days = p.daysAgo ?? (p.createdAt ? (Date.now() - new Date(p.createdAt).getTime()) / 86_400_000 : null);
  if (days == null) return '';
  if (days < 1) return 'Hôm nay';
  if (days < 2) return 'Hôm qua';
  if (days < 30) return `${Math.floor(days)} ngày trước`;
  return `${Math.floor(days / 30)} tháng trước`;
}

export const TIER_LABEL = { A: 'Uy tín cao', B: 'Uy tín tốt', C: 'Uy tín khá', D: 'Cần lưu ý', E: 'Rủi ro cao' };

export function timeAgoShort(t) {
  const s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút`;
  if (s < 86_400) return `${Math.floor(s / 3600)} giờ`;
  return `${Math.floor(s / 86_400)} ngày`;
}

export const ORDER_STATUS = {
  paid: 'Chờ người bán gửi', shipped: 'Đang giao', completed: 'Hoàn tất', refused_by_buyer: 'Đã từ chối nhận',
  cancelled_by_seller: 'Người bán đã huỷ', disputed: 'Đang khiếu nại', refunded: 'Đã hoàn tiền',
  return_pending: 'Chờ gửi trả hàng', returning: 'Đang gửi trả',
};
/** Nhãn trạng thái theo cách giao: đơn gặp trực tiếp không có bước "đang giao" qua đơn vị vận chuyển. */
export const orderStatusLabel = (o) => (o.delivery === 'meetup' && (o.status === 'paid' || o.status === 'shipped') ? 'Chờ giao trực tiếp' : ORDER_STATUS[o.status]);

export const vnDateTime = (t) => (t ? new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '');
