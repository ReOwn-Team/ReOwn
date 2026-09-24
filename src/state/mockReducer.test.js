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
