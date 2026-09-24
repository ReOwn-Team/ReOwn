import { USERS, PRODUCTS, SAMPLE_ORDERS } from '../data/mock.js';
import { installmentSchedule, fmt } from '../../shared/scoring/engine.js';
import { DAY, LATE_DAYS } from './shared.js';

export const KEY = 'reown-demo-v6';

export const initial = () => ({
  users: structuredClone(USERS), products: structuredClone(PRODUCTS), plans: [], orders: structuredClone(SAMPLE_ORDERS), currentUserId: null,
  notifications: [], conversations: [], messages: [], msgSeq: 0,
});

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...initial(), ...JSON.parse(raw) };
  } catch { }
  return initial();
}

function addNote(state, userId, n) {
  if (!userId) return state;
  if (n.dedupeKey && state.notifications.some((x) => x.dedupeKey === n.dedupeKey)) return state;
  const note = { id: 'n' + Date.now() + Math.random().toString(36).slice(2, 6), userId, read: false, createdAt: Date.now(), body: null, link: null, ...n };
  return { ...state, notifications: [note, ...state.notifications].slice(0, 200) };
}
const cut = (t) => (t.length > 48 ? t.slice(0, 47) + '…' : t);

function remind(state, now = Date.now()) {
  let s = state;
  for (const p of state.plans) {
    for (const i of p.installments) {
      if (i.status === 'paid' || i.due - now > 3 * DAY) continue;
      const days = Math.ceil((i.due - now) / DAY);
      const what = `kỳ ${i.n}/${p.installments.length} · ${fmt(i.amount)} · ${cut(p.title)}`;
      const n = days > 0 ? { kind: 'installment.due_soon', title: `Còn ${days} ngày đến hạn trả ${fmt(i.amount)}`, body: `${what}. Nạp đủ ví để trả đúng hạn, giữ điểm uy tín.`, dedupeKey: `due3:${i.id}` }
        : days > -1 ? { kind: 'installment.due_today', title: `Hôm nay đến hạn trả ${fmt(i.amount)}`, body: `${what}. Trả trễ sẽ bị trừ điểm uy tín.`, dedupeKey: `due0:${i.id}` }
          : { kind: 'installment.overdue', title: `Quá hạn ${-days} ngày: ${fmt(i.amount)}`, body: `${what}.`, dedupeKey: `overdue:${i.id}` };
      s = addNote(s, p.userId, { ...n, link: '/tai-khoan?tab=tra-sau' });
    }
  }
  return s;
}

export function autoReply(text) {
  const t = text.toLowerCase();
  if (/gi[aá]|b[oớ]t|fix|thương lượng/.test(t)) return 'Giá này mình để sát rồi bạn ơi. Bạn đặt qua ReOwn để được giữ tiền hộ và trả sau nhé.';
  if (/b[aả]o h[aà]nh|l[oỗ]i|x[uư][oớ]c|pin/.test(t)) return 'Máy chạy ổn, mình có ghi rõ tình trạng trong mô tả. Nhận hàng không đúng mô tả thì bạn khiếu nại trong 3 ngày được hoàn tiền.';
  if (/c[oò]n|kh[oô]ng/.test(t)) return 'Còn bạn nhé! Bạn đặt trên ReOwn là mình gửi trong ngày.';
  if (/g[aặ]p|xem|ship|giao/.test(t)) return 'Mình giao qua ReOwn luôn cho tiện, tiền được giữ hộ tới khi bạn nhận hàng.';
  return 'Mình đã đọc tin nhắn, bạn cần hỏi thêm gì cứ nhắn nhé.';
}

const mapUser = (state, id, fn) => ({ ...state, users: state.users.map((u) => (u.id === id ? fn(structuredClone(u)) : u)) });
const setOrder = (state, id, patch) => ({ ...state, orders: state.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)) });

function core(state, a) {
  switch (a.type) {
    case 'login': return { ...state, currentUserId: a.id };
    case 'logout': return { ...state, currentUserId: null, adminMfaFor: null };
    case 'adminMfa': return { ...state, adminMfaFor: state.currentUserId };
    case 'updateFinance':
      return mapUser(state, state.currentUserId, (u) => { u.finance = { ...u.finance, ...a.finance }; return u; });
    case 'verify':
      return mapUser(state, state.currentUserId, (u) => { u.verify[a.key] = true; return u; });
    case 'topup':
      return mapUser(state, state.currentUserId, (u) => { u.finance.savings += a.amount; return u; });

    case 'placeOrder': {
      const { product, method } = a;
      const buyerId = state.currentUserId;
      const orderId = 'o' + Date.now();
      let s = { ...state, products: state.products.map((p) => (p.id === product.id ? { ...p, sold: true } : p)) };
      let plan = null;
      if (method === 'full') {
        s = mapUser(s, buyerId, (u) => { u.finance.savings = Math.max(0, u.finance.savings - product.price); return u; });
      } else {
        const sch = installmentSchedule(product.price, method, a.downRate || 0);
        const now = Date.now();
        if (sch.down) s = mapUser(s, buyerId, (u) => { u.finance.savings -= sch.down; return u; });
        plan = {
          id: 'pl' + Date.now(), userId: buyerId, orderId, title: product.title, total: sch.total, down: sch.down,
          installments: sch.amounts.map((amount, i) => ({ id: `${orderId}-${i + 1}`, n: i + 1, due: now + (i + 1) * 30 * DAY, amount, status: 'due' })),
        };
      }
      const buyerName = state.users.find((u) => u.id === buyerId)?.name;
      const order = { id: orderId, productId: product.id, title: product.title, price: product.price, buyerId, buyerName, sellerId: product.sellerId, method, status: 'paid', payoutStatus: 'held', createdAt: Date.now(), myStars: null };
      return { ...s, orders: [order, ...s.orders], plans: plan ? [plan, ...s.plans] : s.plans };
    }
    case 'shipOrder':
    case 'devShip': {
      const o = state.orders.find((x) => x.id === a.orderId);
      const who = a.type === 'devShip' ? o?.buyerId : o?.sellerId;
      if (!o || o.status !== 'paid' || who !== state.currentUserId) return state;
      return setOrder(state, o.id, { status: 'shipped', shippedAt: Date.now() });
    }
    case 'sellerCancel': {
      const o = state.orders.find((x) => x.id === a.orderId);
      if (!o || o.status !== 'paid' || o.sellerId !== state.currentUserId) return state;
      let s = setOrder(state, o.id, { status: 'cancelled_by_seller', payoutStatus: 'refunded' });
      const plan = s.plans.find((p) => p.orderId === o.id);
      const back = o.method === 'full' ? o.price : (plan?.down || 0);
      s = { ...s, products: s.products.map((p) => (p.id === o.productId ? { ...p, sold: false } : p)), plans: s.plans.filter((p) => p.orderId !== o.id) };
      if (back) s = mapUser(s, o.buyerId, (u) => { u.finance.savings += back; return u; });
      return mapUser(s, o.sellerId, (u) => { u.seller.cancels = (u.seller.cancels || 0) + 1; return u; });
    }
    case 'confirmReceived': {
      const o = state.orders.find((x) => x.id === a.orderId);
      let s = setOrder(state, o.id, { status: 'completed', payoutStatus: 'released', completedAt: Date.now(), releaseAt: Date.now(), myStars: a.stars });
      s = mapUser(s, o.buyerId, (u) => { u.buyer.orders += 1; return u; });
      return mapUser(s, o.sellerId, (u) => {
        u.seller.sales += 1; u.seller.shipTotal += 1; u.seller.shippedOnTime += 1;
        u.seller.reviews = [...u.seller.reviews, { by: o.buyerId, stars: a.stars }];
        return u;
      });
    }
    case 'bomOrder': {
      const o = state.orders.find((x) => x.id === a.orderId);
      let s = setOrder(state, o.id, { status: 'refused_by_buyer', payoutStatus: 'refunded' });
      const plan = s.plans.find((p) => p.orderId === o.id);
      const back = o.method === 'full' ? o.price
        : (plan?.down || 0) + (plan?.installments.filter((i) => i.status === 'paid').reduce((a, i) => a + i.amount, 0) || 0);
      s = { ...s, products: s.products.map((p) => (p.id === o.productId ? { ...p, sold: false } : p)), plans: s.plans.filter((p) => p.orderId !== o.id) };
      if (back) s = mapUser(s, o.buyerId, (u) => { u.finance.savings += back; return u; });
      return mapUser(s, o.buyerId, (u) => { u.buyer.boms += 1; return u; });
    }
    case 'openDispute':
      if (!a.evidence?.length) return state;
      return setOrder(state, a.orderId, { status: 'disputed', dispute: { status: 'open', reason: a.reason, evidence: a.evidence, openedAt: Date.now() } });
    case 'payInstallment': {
      const { planId, n, mode } = a;
      const inst = state.plans.find((p) => p.id === planId)?.installments.find((i) => i.n === n);
      const charge = mode === 'default' || !inst ? 0 : inst.amount;
      const s = {
        ...state,
        plans: state.plans.map((p) => p.id !== planId ? p : {
          ...p,
          installments: p.installments.map((i) => i.n !== n ? i
            : mode === 'default' ? { ...i, status: 'overdue' }
            : { ...i, status: 'paid', daysLate: LATE_DAYS[mode] }),
        }),
      };
      return mapUser(s, state.currentUserId, (u) => {
        const r = u.buyer.repayment;
        if (mode === 'onTime') r.onTime += 1;
        if (mode === 'late') r.late += 1;
        if (mode === 'severe') r.severe += 1;
        if (mode === 'default') { r.defaults += 1; u.buyer.activeDefault = (u.buyer.activeDefault || 0) + 1; }
        if (mode === 'clearDefault') u.buyer.activeDefault = Math.max(0, (u.buyer.activeDefault || 0) - 1);
        u.finance.savings -= charge;
        return u;
      });
    }
    case 'adminResolve': {
      const o = state.orders.find((x) => x.id === a.orderId);
      const buyerWon = a.outcome === 'buyer';
      let s = setOrder(state, o.id, {
        status: buyerWon ? 'refunded' : 'completed', payoutStatus: buyerWon ? 'refunded' : 'released',
        dispute: { ...o.dispute, status: buyerWon ? 'resolved_buyer' : 'resolved_seller', resolution: a.resolution, resolvedAt: Date.now() },
      });
      if (buyerWon) {
        s = mapUser(s, o.sellerId, (u) => { u.seller.disputesLost = (u.seller.disputesLost || 0) + 1; return u; });
        if (o.method === 'full' && s.users.some((u) => u.id === o.buyerId)) s = mapUser(s, o.buyerId, (u) => { u.finance.savings += o.price; return u; });
      } else if (s.users.some((u) => u.id === o.buyerId)) {
        s = mapUser(s, o.buyerId, (u) => { u.buyer.disputesLost = (u.buyer.disputesLost || 0) + 1; return u; });
      }
      s = addNote(s, o.buyerId, { kind: 'dispute.resolved', title: buyerWon ? `Bạn thắng khiếu nại: ${cut(o.title)}` : `Khiếu nại không được chấp nhận: ${cut(o.title)}`, link: '/tai-khoan?tab=don-mua' });
      s = addNote(s, o.sellerId, { kind: 'dispute.resolved', title: buyerWon ? `Thua khiếu nại: ${cut(o.title)}` : `Khiếu nại đã xử lý có lợi cho bạn: ${cut(o.title)}`, link: '/kenh-nguoi-ban?don=tat-ca' });
      return s;
    }
    case 'adminHide': {
      const p = state.products.find((x) => x.id === a.id);
      let s = { ...state, products: state.products.filter((x) => x.id !== a.id) };
      return p ? addNote(s, p.sellerId, { kind: 'listing.hidden', title: `Tin bị gỡ: ${cut(p.title)}`, body: a.reason ? `Lý do: ${a.reason}` : 'Tin vi phạm quy định đăng tin của ReOwn.', link: '/kenh-nguoi-ban?tab=tin-dang' }) : s;
    }

    case 'readNotes':
      return { ...state, notifications: state.notifications.map((n) => (n.userId === state.currentUserId && (!a.ids || a.ids.includes(n.id)) ? { ...n, read: true } : n)) };
    case 'remind': return remind(state);
    case 'devDueIn':
      return remind({ ...state, plans: state.plans.map((p) => p.id !== a.planId ? p : { ...p, installments: p.installments.map((i) => (i.n === a.n ? { ...i, due: Date.now() + a.days * DAY - 3_600_000 } : i)) }) });

    case 'openConv': {
      if (state.conversations.some((c) => c.id === a.id)) return state;
      return { ...state, conversations: [...state.conversations, { id: a.id, listingId: a.listingId, buyerId: a.buyerId, sellerId: a.sellerId, createdAt: Date.now(), lastMessageAt: null, buyerRead: Date.now(), sellerRead: Date.now() }] };
    }
    case 'sendMsg': {
      const seq = state.msgSeq + 1;
      const m = { id: seq, conversationId: a.id, sender_id: a.senderId, body: a.body, flags: a.flags || [], created_at: Date.now(), auto: !!a.auto };
      return {
        ...state, msgSeq: seq, messages: [...state.messages, m].slice(-2000),
        conversations: state.conversations.map((c) => c.id !== a.id ? c : { ...c, lastMessageAt: m.created_at, ...(a.senderId === c.buyerId ? { buyerRead: m.created_at } : { sellerRead: m.created_at }) }),
      };
    }
    case 'readConv':
      return { ...state, conversations: state.conversations.map((c) => c.id !== a.id ? c : { ...c, ...(a.userId === c.buyerId ? { buyerRead: Date.now() } : { sellerRead: Date.now() }) }) };

    case 'editListing': {
      const before = state.products.find((p) => p.id === a.id);
      let s = { ...state, products: state.products.map((p) => (p.id === a.id ? { ...p, ...a.product, desc: a.product.description ?? p.desc, editedAt: Date.now() } : p)) };
      if (before && a.product.price < before.price) {
        for (const c of state.conversations.filter((x) => x.listingId === a.id)) {
          s = addNote(s, c.buyerId, { kind: 'listing.price_drop', title: `Giảm giá: ${cut(a.product.title || before.title)}`, body: `${fmt(before.price)} → ${fmt(a.product.price)}`, link: `/san-pham/${a.id}`, dedupeKey: `pricedrop:${a.id}:${c.buyerId}:${a.product.price}` });
        }
      }
      return s;
    }
    case 'hideListing':
      return { ...state, products: state.products.filter((p) => p.id !== a.id) };

    case 'addListing': {
      const p = { ...a.product, desc: a.product.description, id: 'p' + Date.now(), sellerId: state.currentUserId, sold: false, daysAgo: 0 };
      return { ...state, products: [p, ...state.products] };
    }
    default: return state;
  }
}

export function reducer(state, a) {
  let next = core(state, a);
  const title = (id) => cut(next.products.find((p) => p.id === id)?.title || 'đơn hàng');
  if (a.type === 'placeOrder' && next.orders[0] && next.orders[0] !== state.orders[0]) {
    const o = next.orders[0];
    next = addNote(next, o.sellerId, { kind: 'order.new', title: `Có đơn mới: ${cut(o.title)}`, body: 'Gửi hàng trong 3 ngày để giữ điểm giao đúng hẹn.', link: '/kenh-nguoi-ban?don=can-gui' });
  }
  const o = a.orderId && next.orders.find((x) => x.id === a.orderId);
  const changed = o && state.orders.find((x) => x.id === o.id)?.status !== o.status;
  if (changed && (a.type === 'shipOrder' || a.type === 'devShip')) next = addNote(next, o.buyerId, { kind: 'order.shipped', title: `Người bán đã gửi: ${cut(o.title)}`, body: 'Kiểm tra hàng khi nhận rồi bấm "Đã nhận hàng". Sai mô tả thì khiếu nại trong 3 ngày.', link: '/tai-khoan?tab=don-mua' });
  if (changed && a.type === 'sellerCancel') next = addNote(next, o.buyerId, { kind: 'order.cancelled', title: `Người bán huỷ đơn: ${cut(o.title)}`, body: 'Tiền đã hoàn về ví ReOwn của bạn.', link: '/tai-khoan?tab=don-mua' });
  if (o && a.type === 'confirmReceived') {
    next = addNote(next, o.sellerId, { kind: 'order.completed', title: `Người mua đã nhận: ${title(o.productId)}`, body: 'Tiền về ví ngay.', link: '/kenh-nguoi-ban?don=hoan-tat' });
    next = addNote(next, o.sellerId, { kind: 'payout.released', title: `+${fmt(Math.round(o.price * 0.96))} vào ví ReOwn`, body: 'Tiền bán hàng (đã trừ phí sàn 4%).', link: '/tai-khoan?tab=vi', dedupeKey: `payout:${o.id}` });
  }
  if (o && a.type === 'bomOrder') next = addNote(next, o.sellerId, { kind: 'order.refused', title: `Người mua từ chối nhận: ${title(o.productId)}`, body: 'Tin đã mở bán lại.', link: '/kenh-nguoi-ban?don=huy' });
  if (o && a.type === 'openDispute') next = addNote(next, o.sellerId, { kind: 'dispute.opened', title: `Khiếu nại đơn ${title(o.productId)}`, body: 'Tiền được giữ lại chờ ReOwn xử lý.', link: '/kenh-nguoi-ban?don=huy' });
  if (['placeOrder', 'payInstallment'].includes(a.type)) next = remind(next);
  return next;
}
