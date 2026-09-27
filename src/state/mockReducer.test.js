import { describe, it, expect } from 'vitest';
import { initial, reducer } from './mockReducer.js';

const casio = (s) => s.products.find((p) => p.id === 'p8');
const as = (s, id) => reducer(s, { type: 'login', id });
const wallet = (s, id) => s.users.find((u) => u.id === id).finance.savings;

function buy() {
  let s = as(initial(), 'u_lan');
  s = reducer(s, { type: 'placeOrder', product: casio(s), method: 'full' });
  return s;
}

describe('Bản demo: vòng đời đơn hàng', () => {
  it('đặt hàng → chờ người bán gửi, trừ ví người mua, báo người bán', () => {
    const before = wallet(as(initial(), 'u_lan'), 'u_lan');
    const s = buy();
    const o = s.orders[0];
    expect(o.status).toBe('paid');
    expect(wallet(s, 'u_lan')).toBe(before - 350_000);
    expect(s.notifications.some((n) => n.userId === 'u_s1' && n.kind === 'order.new')).toBe(true);
  });

  it('chỉ người bán xác nhận gửi được; nút mô phỏng chỉ dành cho người mua của đơn', () => {
    let s = buy();
    const id = s.orders[0].id;
    expect(reducer(s, { type: 'shipOrder', orderId: id }).orders[0].status).toBe('paid');
    s = as(s, 'u_s1');
    s = reducer(s, { type: 'shipOrder', orderId: id });
    expect(s.orders[0].status).toBe('shipped');
    expect(s.notifications.some((n) => n.userId === 'u_lan' && n.kind === 'order.shipped')).toBe(true);
    const b = buy();
    expect(reducer(as(b, 'u_huy'), { type: 'devShip', orderId: b.orders[0].id }).orders[0].status).toBe('paid');
    expect(reducer(b, { type: 'devShip', orderId: b.orders[0].id }).orders[0].status).toBe('shipped');
  });

  it('người bán huỷ → hoàn tiền, tin mở bán lại, người bán bị tính một lần huỷ', () => {
    let s = buy();
    const before = wallet(s, 'u_lan');
    s = as(s, 'u_s1');
    s = reducer(s, { type: 'sellerCancel', orderId: s.orders[0].id });
    expect(s.orders[0].status).toBe('cancelled_by_seller');
    expect(wallet(s, 'u_lan')).toBe(before + 350_000);
    expect(casio(s).sold).toBe(false);
    expect(s.users.find((u) => u.id === 'u_s1').seller.cancels).toBe(1);
  });

  it('từ chối nhận: tiền giữ tới khi người bán nhận lại hàng, rồi mới hoàn và mở bán lại', () => {
    let s = buy();
    const id = s.orders[0].id;
    const before = wallet(s, 'u_lan');
    s = reducer(as(s, 'u_s1'), { type: 'shipOrder', orderId: id, carrier: 'GHN', trackingCode: 'GHN123' });
    s = reducer(as(s, 'u_lan'), { type: 'bomOrder', orderId: id });
    expect(s.orders[0]).toMatchObject({ status: 'refused_by_buyer', payoutStatus: 'held' });
    expect(wallet(s, 'u_lan')).toBe(before);
    expect(casio(s).sold).toBe(true);
    expect(reducer(s, { type: 'returnReceived', orderId: id }).orders[0].payoutStatus).toBe('held');
    s = reducer(as(s, 'u_s1'), { type: 'returnReceived', orderId: id });
    expect(s.orders[0]).toMatchObject({ status: 'refused_by_buyer', payoutStatus: 'refunded' });
    expect(wallet(s, 'u_lan')).toBe(before + 350_000);
    expect(casio(s).sold).toBe(false);
  });

  it('người bán quá hạn gửi hàng: người mua mới huỷ được, tiền hoàn đủ', () => {
    let s = buy();
    const id = s.orders[0].id;
    const before = wallet(s, 'u_lan');
    expect(reducer(s, { type: 'cancelOverdue', orderId: id }).orders[0].status).toBe('paid');
    s = { ...s, orders: s.orders.map((o) => (o.id === id ? { ...o, createdAt: Date.now() - 4 * 86_400_000 } : o)) };
    expect(reducer(as(s, 'u_s1'), { type: 'cancelOverdue', orderId: id }).orders[0].status).toBe('paid');
    s = reducer(s, { type: 'cancelOverdue', orderId: id });
    expect(s.orders[0]).toMatchObject({ status: 'cancelled_by_seller', payoutStatus: 'refunded' });
    expect(wallet(s, 'u_lan')).toBe(before + 350_000);
  });

  it('admin gỡ tin → tin biến mất, người bán được báo kèm lý do', () => {
    let s = as(initial(), 'u_admin');
    s = reducer(s, { type: 'adminHide', id: 'p4', reason: 'Giá ảo để lừa' });
    expect(s.products.some((p) => p.id === 'p4')).toBe(false);
    expect(s.notifications.find((n) => n.userId === 'u_s4').body).toMatch(/Giá ảo/);
  });

  it('mỗi sản phẩm mẫu có tên file ảnh bìa hợp lệ', () => {
    for (const p of initial().products) expect(p.cover).toMatch(/^[a-z0-9-]+\.(jpg|jpeg|png|webp)$/);
  });
});

describe('Bản demo: giao nhận, khiếu nại, ví, trả sau', () => {
  const quat = (s) => s.products.find((p) => p.id === 'p14');
  const disputedOrder = () => {
    let s = buy();
    const id = s.orders[0].id;
    s = reducer(as(s, 'u_s1'), { type: 'shipOrder', orderId: id, carrier: 'GHN', trackingCode: 'GHN123456' });
    s = reducer(as(s, 'u_lan'), { type: 'openDispute', orderId: id, reason: 'Máy không lên nguồn', evidence: ['data:image/png;base64,x'] });
    return { s, id };
  };

  it('gặp trực tiếp: sai mã thì đếm lượt, đúng mã thì hoàn tất và trả tiền cho người bán', () => {
    let s = as(initial(), 'u_lan');
    s = reducer(s, { type: 'placeOrder', product: quat(s), method: 'full', delivery: 'meetup', meetupNote: 'Cổng A' });
    const o = s.orders[0];
    expect(o.handoverCode).toMatch(/^\d{6}$/);
    s = as(s, 'u_s1');
    const seller0 = wallet(s, 'u_s1');
    s = reducer(s, { type: 'handover', orderId: o.id, code: o.handoverCode === '000000' ? '111111' : '000000' });
    expect(s.orders[0]).toMatchObject({ status: 'paid', handoverAttempts: 1 });
    s = reducer(s, { type: 'handover', orderId: o.id, code: o.handoverCode });
    expect(s.orders[0].status).toBe('completed');
    expect(wallet(s, 'u_s1')).toBe(seller0 + 180_000 - Math.round(180_000 * 0.04));
  });

  it('khiếu nại: người bán phản hồi một lần; admin hoàn một phần chia tiền cho hai bên', () => {
    let { s, id } = disputedOrder();
    s = reducer(as(s, 'u_s1'), { type: 'respondDispute', orderId: id, text: 'Có video đóng gói', evidence: [] });
    expect(s.orders[0].dispute.sellerResponse).toBe('Có video đóng gói');
    const [b0, s0] = [wallet(s, 'u_lan'), wallet(s, 'u_s1')];
    s = reducer(s, { type: 'adminResolve', orderId: id, outcome: 'partial', resolution: 'Lỗi nhỏ', refundAmount: 100_000 });
    expect(s.orders[0]).toMatchObject({ status: 'completed', refundAmount: 100_000, dispute: { status: 'resolved_partial' } });
    expect(wallet(s, 'u_lan')).toBe(b0 + 100_000);
    expect(wallet(s, 'u_s1')).toBe(s0 + 250_000 - 10_000);
  });

  it('trả hàng rồi hoàn tiền: chờ gửi trả → đang gửi trả → người bán nhận lại → hoàn tiền', () => {
    let { s, id } = disputedOrder();
    const b0 = wallet(s, 'u_lan');
    s = reducer(s, { type: 'adminResolve', orderId: id, outcome: 'return', resolution: 'Trả hàng' });
    expect(s.orders[0].status).toBe('return_pending');
    s = reducer(as(s, 'u_lan'), { type: 'returnShip', orderId: id, carrier: 'GHTK', trackingCode: 'S123' });
    expect(s.orders[0].status).toBe('returning');
    s = reducer(as(s, 'u_s1'), { type: 'returnReceived', orderId: id });
    expect(s.orders[0].status).toBe('refunded');
    expect(wallet(s, 'u_lan')).toBe(b0 + 350_000);
  });

  it('rút tiền trừ ví và lưu lịch sử; tất toán sớm trả hết các kỳ còn lại', () => {
    let s = as(initial(), 'u_lan');
    const w0 = wallet(s, 'u_lan');
    s = reducer(s, { type: 'withdraw', amount: 200_000 });
    expect(wallet(s, 'u_lan')).toBe(w0 - 200_000);
    expect(s.users.find((u) => u.id === 'u_lan').withdrawals[0].amount).toBe(200_000);
    s = reducer(s, { type: 'placeOrder', product: casio(s), method: 3 });
    const plan = s.plans[0];
    const before = wallet(s, 'u_lan');
    s = reducer(s, { type: 'payoff', planId: plan.id });
    expect(s.plans[0].installments.every((i) => i.status === 'paid')).toBe(true);
    expect(wallet(s, 'u_lan')).toBe(before - plan.installments.reduce((a, i) => a + i.amount, 0));
  });
});
