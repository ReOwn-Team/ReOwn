import { USERS, PRODUCTS, SAMPLE_ORDERS } from '../data/mock.js';
import { installmentSchedule, fmt } from '../../shared/scoring/engine.js';
import { DAY, LATE_DAYS } from './shared.js';
import { DISPUTE_RESPONSE_HOURS, RETURN_SHIP_DAYS, HANDOVER_MAX_ATTEMPTS, lateFeeFor, shipDeadline } from '../../shared/policy.js';
import { DISPUTE_WINDOW_DAYS } from '../../shared/scoring/config.js';

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
  if (/b[aả]o h[aà]nh|l[oỗ]i|x[uư][oớ]c|pin/.test(t)) return 'Máy chạy ổn, mình có ghi rõ tình trạng trong mô tả. Nhận hàng không đúng mô tả thì bạn khiếu nại trong 3 ngày sau khi nhận là được hoàn tiền.';
  if (/c[oò]n|kh[oô]ng/.test(t)) return 'Còn bạn nhé! Bạn đặt trên ReOwn là mình gửi trong ngày.';
  if (/g[aặ]p|xem|ship|giao/.test(t)) return 'Mình giao qua ReOwn luôn cho tiện, tiền được giữ hộ tới khi bạn nhận hàng.';
  return 'Mình đã đọc tin nhắn, bạn cần hỏi thêm gì cứ nhắn nhé.';
}

const mapUser = (state, id, fn) => ({ ...state, users: state.users.map((u) => (u.id === id ? fn(structuredClone(u)) : u)) });
const setOrder = (state, id, patch) => ({ ...state, orders: state.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
const hasUser = (state, id) => state.users.some((u) => u.id === id);
const credit = (state, id, amount) => (amount && hasUser(state, id) ? mapUser(state, id, (u) => { u.finance.savings += amount; return u; }) : state);
const payout = (price) => price - Math.round(price * 0.04);

/** Hoàn tất đơn: cộng số liệu uy tín cho hai bên; tiền còn giữ hộ hết hạn khiếu nại rồi mới về ví người bán (xem releaseDue). */
function completeOrder(state, o, stars = null) {
  const now = Date.now();
  let s = setOrder(state, o.id, { status: 'completed', payoutStatus: 'held', completedAt: now, releaseAt: now + DISPUTE_WINDOW_DAYS * DAY, shippedAt: o.shippedAt || now, myStars: stars ?? o.myStars });
  if (hasUser(s, o.buyerId)) s = mapUser(s, o.buyerId, (u) => { u.buyer.orders += 1; return u; });
  s = mapUser(s, o.sellerId, (u) => {
    u.seller.sales += 1; u.seller.shipTotal += 1; u.seller.shippedOnTime += 1;
    if (stars) u.seller.reviews = [...u.seller.reviews, { by: o.buyerId, stars }];
    return u;
  });
  return s;
}

/** Giải ngân các đơn đã hết hạn khiếu nại: tiền (trừ phí sàn 4%) về ví người bán. */
function releaseDue(state, now = Date.now()) {
  let s = state;
  for (const o of state.orders) {
    if (o.status !== 'completed' || o.payoutStatus !== 'held' || !o.releaseAt || o.releaseAt > now) continue;
    s = credit(setOrder(s, o.id, { payoutStatus: 'released' }), o.sellerId, payout(o.price));
    s = addNote(s, o.sellerId, { kind: 'payout.released', title: `+${fmt(payout(o.price))} vào ví ReOwn`, body: `Tiền bán ${cut(o.title)} (đã trừ phí sàn 4%).`, link: '/tai-khoan?tab=vi', dedupeKey: `payout:${o.id}` });
  }
  return s;
}

/** Hoàn tiền cho người mua (trả thẳng: về ví; trả sau: huỷ khoản vay, hoàn phần đã trả). */
function refundOrder(state, o, patch) {
  let s = setOrder(state, o.id, { payoutStatus: 'refunded', ...patch });
  const plan = s.plans.find((p) => p.orderId === o.id);
  const back = o.method === 'full' ? o.price
    : (plan?.down || 0) + (plan?.installments.filter((i) => i.status === 'paid').reduce((a, i) => a + i.amount, 0) || 0);
  s = { ...s, plans: s.plans.filter((p) => p.orderId !== o.id) };
  return credit(s, o.buyerId, back);
}

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
      const delivery = a.delivery === 'meetup' ? 'meetup' : 'ship';
      const order = {
        id: orderId, productId: product.id, title: product.title, price: product.price, buyerId, buyerName, sellerId: product.sellerId, method, status: 'paid', payoutStatus: 'held', createdAt: Date.now(), myStars: null,
        delivery, shipTo: delivery === 'ship' ? a.shipTo : null, meetupNote: delivery === 'meetup' ? a.meetupNote || null : null,
        handoverCode: delivery === 'meetup' ? String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0') : null, handoverAttempts: 0,
      };
      return { ...s, orders: [order, ...s.orders], plans: plan ? [plan, ...s.plans] : s.plans };
    }
    case 'shipOrder':
    case 'devShip': {
      const o = state.orders.find((x) => x.id === a.orderId);
      const who = a.type === 'devShip' ? o?.buyerId : o?.sellerId;
      if (!o || o.status !== 'paid' || who !== state.currentUserId) return state;
      return setOrder(state, o.id, { status: 'shipped', shippedAt: Date.now(), carrier: a.carrier || (a.type === 'devShip' ? 'GHN' : null), trackingCode: a.trackingCode || (a.type === 'devShip' ? 'DEMO' + o.id.slice(-6) : null) });
    }
    case 'handover': {
      const o = state.orders.find((x) => x.id === a.orderId);
      if (!o || o.sellerId !== state.currentUserId || o.delivery !== 'meetup' || !['paid', 'shipped'].includes(o.status)) return state;
      if ((o.handoverAttempts || 0) >= HANDOVER_MAX_ATTEMPTS) return state;
      if (a.code !== o.handoverCode) return setOrder(state, o.id, { handoverAttempts: (o.handoverAttempts || 0) + 1 });
      return completeOrder(state, o);
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
      const ok = o && (o.status === 'shipped' || (o.delivery === 'meetup' && o.status === 'paid'));
      if (!ok || o.buyerId !== state.currentUserId) return state;
      return completeOrder(state, o, a.stars);
    }
    case 'bomOrder': {
      // Từ chối nhận: hàng hoàn về người bán, tiền vẫn giữ hộ tới khi người bán xác nhận đã nhận lại (như máy chủ).
      const o = state.orders.find((x) => x.id === a.orderId);
      if (!o || o.buyerId !== state.currentUserId || o.status !== 'shipped') return state;
      const s = setOrder(state, o.id, { status: 'refused_by_buyer', refusedAt: Date.now() });
      return mapUser(s, o.buyerId, (u) => { u.buyer.boms += 1; return u; });
    }
    case 'cancelOverdue': {
      const o = state.orders.find((x) => x.id === a.orderId);
      if (!o || o.buyerId !== state.currentUserId || o.status !== 'paid' || Date.now() < shipDeadline(o.delivery, o.createdAt)) return state;
      const s = refundOrder(state, o, { status: 'cancelled_by_seller' });
      return { ...s, products: s.products.filter((p) => p.id !== o.productId) };
    }
    case 'openDispute':
      if (!a.evidence?.length) return state;
      return setOrder(state, a.orderId, { status: 'disputed', dispute: { status: 'open', reason: a.reason, evidence: a.evidence, openedAt: Date.now(), respondBy: Date.now() + DISPUTE_RESPONSE_HOURS * 3_600_000 } });
    case 'respondDispute': {
      const o = state.orders.find((x) => x.id === a.orderId);
      if (!o || o.sellerId !== state.currentUserId || o.dispute?.status !== 'open' || o.dispute.sellerResponse) return state;
      return setOrder(state, o.id, { dispute: { ...o.dispute, sellerResponse: a.text, sellerRespondedAt: Date.now(), sellerEvidence: a.evidence || [] } });
    }
    case 'returnShip': {
      const o = state.orders.find((x) => x.id === a.orderId);
      if (!o || o.buyerId !== state.currentUserId || o.status !== 'return_pending') return state;
      return setOrder(state, o.id, { status: 'returning', returnInfo: { ...o.returnInfo, carrier: a.carrier, trackingCode: a.trackingCode || null, shippedAt: Date.now() } });
    }
    case 'returnReceived': {
      const o = state.orders.find((x) => x.id === a.orderId);
      const refused = o?.status === 'refused_by_buyer' && o.payoutStatus === 'held';
      if (!o || o.sellerId !== state.currentUserId || (o.status !== 'returning' && !refused)) return state;
      // Hàng bị từ chối nhận còn nguyên nên mở bán lại; hàng trả sau khiếu nại thì gỡ tin.
      if (refused) {
        const s = refundOrder(state, o, {});
        return { ...s, products: s.products.map((p) => (p.id === o.productId ? { ...p, sold: false } : p)) };
      }
      const s = refundOrder(state, o, { status: 'refunded' });
      return { ...s, products: s.products.filter((p) => p.id !== o.productId) };
    }
    case 'withdraw':
      return mapUser(state, state.currentUserId, (u) => {
        u.finance.savings -= a.amount;
        u.withdrawals = [{ id: 'w' + Date.now(), amount: a.amount, bankLast4: u.bankLast4 || '6789', reference: 'RW' + Date.now().toString(36).toUpperCase(), status: 'paid', createdAt: Date.now() }, ...(u.withdrawals || [])];
        return u;
      });
    case 'payoff': {
      const plan = state.plans.find((p) => p.id === a.planId && p.userId === state.currentUserId);
      if (!plan) return state;
      const now = Date.now();
      let charge = 0, count = 0;
      const installments = plan.installments.map((i) => {
        if (i.status === 'paid') return i;
        const fee = lateFeeFor(i.due, now);
        charge += i.amount + fee; count += 1;
        return { ...i, status: 'paid', daysLate: Math.max(0, Math.floor((now - i.due) / DAY)), lateFee: fee };
      });
      const s = { ...state, plans: state.plans.map((p) => (p.id === plan.id ? { ...p, installments, status: 'paid_off' } : p)) };
      return mapUser(s, state.currentUserId, (u) => { u.finance.savings -= charge; u.buyer.repayment.onTime += count; return u; });
    }
    case 'payInstallment': {
      const { planId, n, mode } = a;
      const inst = state.plans.find((p) => p.id === planId)?.installments.find((i) => i.n === n);
      const fee = !inst || mode === 'default' ? 0 : mode === 'onTime' ? lateFeeFor(inst.due) : lateFeeFor(inst.due, inst.due + (LATE_DAYS[mode] || 0) * DAY + 3_600_000);
      const charge = mode === 'default' || !inst ? 0 : inst.amount + fee;
      const s = {
        ...state,
        plans: state.plans.map((p) => p.id !== planId ? p : {
          ...p,
          installments: p.installments.map((i) => i.n !== n ? i
            : mode === 'default' ? { ...i, status: 'overdue' }
            : { ...i, status: 'paid', daysLate: LATE_DAYS[mode], lateFee: fee }),
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
      if (!o || o.dispute?.status !== 'open') return state;
      const status = { buyer: 'resolved_buyer', return: 'resolved_buyer', partial: 'resolved_partial', seller: 'resolved_seller' }[a.outcome];
      const remedy = { buyer: 'refund', return: 'return_refund', partial: 'partial', seller: null }[a.outcome];
      const dispute = { ...o.dispute, status, remedy, resolution: a.resolution, resolvedAt: Date.now(), refundAmount: a.outcome === 'partial' ? a.refundAmount : null };
      let s;
      if (a.outcome === 'buyer') s = refundOrder(state, o, { status: 'refunded', dispute });
      else if (a.outcome === 'return') s = setOrder(state, o.id, { status: 'return_pending', dispute, returnInfo: { dueAt: Date.now() + RETURN_SHIP_DAYS * DAY } });
      else if (a.outcome === 'partial') {
        s = setOrder(state, o.id, { status: 'completed', payoutStatus: 'released', refundAmount: a.refundAmount, completedAt: o.completedAt || Date.now(), dispute });
        s = credit(s, o.buyerId, a.refundAmount);
        s = credit(s, o.sellerId, payout(o.price - a.refundAmount));
      } else s = credit(setOrder(state, o.id, { status: 'completed', payoutStatus: 'released', completedAt: o.completedAt || Date.now(), dispute }), o.sellerId, payout(o.price));
      if (a.outcome === 'buyer' || a.outcome === 'partial') s = mapUser(s, o.sellerId, (u) => { u.seller.disputesLost = (u.seller.disputesLost || 0) + 1; return u; });
      if (a.outcome === 'seller' && hasUser(s, o.buyerId)) s = mapUser(s, o.buyerId, (u) => { u.buyer.disputesLost = (u.buyer.disputesLost || 0) + 1; return u; });
      const T = {
        buyer: [`Bạn thắng khiếu nại: ${cut(o.title)}`, `Thua khiếu nại: ${cut(o.title)}`],
        return: [`Khiếu nại được chấp nhận: ${cut(o.title)}`, `Người mua sẽ gửi trả hàng: ${cut(o.title)}`],
        partial: [`Hoàn một phần ${fmt(a.refundAmount || 0)}: ${cut(o.title)}`, `Hoàn một phần cho người mua: ${cut(o.title)}`],
        seller: [`Khiếu nại không được chấp nhận: ${cut(o.title)}`, `Khiếu nại đã xử lý có lợi cho bạn: ${cut(o.title)}`],
      }[a.outcome];
      s = addNote(s, o.buyerId, { kind: 'dispute.resolved', title: T[0], body: a.outcome === 'return' ? 'Gửi trả hàng cho người bán trong 5 ngày, nhập mã vận đơn trên ứng dụng.' : null, link: '/tai-khoan?tab=don-mua' });
      return addNote(s, o.sellerId, { kind: 'dispute.resolved', title: T[1], link: '/kenh-nguoi-ban?don=khieu-nai' });
    }
    case 'adminHide': {
      const p = state.products.find((x) => x.id === a.id);
      let s = { ...state, products: state.products.filter((x) => x.id !== a.id) };
      return p ? addNote(s, p.sellerId, { kind: 'listing.hidden', title: `Tin bị gỡ: ${cut(p.title)}`, body: a.reason ? `Lý do: ${a.reason}` : 'Tin vi phạm quy định đăng tin của ReOwn.', link: '/kenh-nguoi-ban?tab=tin-dang' }) : s;
    }

    case 'readNotes':
      return { ...state, notifications: state.notifications.map((n) => (n.userId === state.currentUserId && (!a.ids || a.ids.includes(n.id)) ? { ...n, read: true } : n)) };
    case 'remind': return remind(releaseDue(state));
    case 'devRelease': {
      const o = state.orders.find((x) => x.id === a.orderId);
      if (!o || o.sellerId !== state.currentUserId || o.status !== 'completed' || o.payoutStatus !== 'held') return state;
      return releaseDue(setOrder(state, o.id, { releaseAt: Date.now() - 1 }));
    }
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
  if (changed && (a.type === 'shipOrder' || a.type === 'devShip')) next = addNote(next, o.buyerId, { kind: 'order.shipped', title: `Người bán đã gửi: ${cut(o.title)}`, body: 'Kiểm tra hàng khi nhận rồi bấm "Đã nhận hàng". Sai mô tả thì bấm "Hàng không đúng mô tả" trước khi xác nhận.', link: '/tai-khoan?tab=don-mua' });
  if (changed && a.type === 'sellerCancel') next = addNote(next, o.buyerId, { kind: 'order.cancelled', title: `Người bán huỷ đơn: ${cut(o.title)}`, body: 'Tiền đã hoàn về ví ReOwn của bạn.', link: '/tai-khoan?tab=don-mua' });
  if (o && a.type === 'confirmReceived') {
    next = addNote(next, o.sellerId, { kind: 'order.completed', title: `Người mua đã nhận: ${title(o.productId)}`, body: `Tiền về ví sau ${DISPUTE_WINDOW_DAYS} ngày, khi hết hạn khiếu nại.`, link: '/kenh-nguoi-ban?don=hoan-tat' });
  }
  if (changed && a.type === 'bomOrder') next = addNote(next, o.sellerId, { kind: 'order.refused', title: `Người mua từ chối nhận: ${title(o.productId)}`, body: 'Hàng đang được hoàn về. Khi nhận lại, bấm "Đã nhận lại hàng" để hoàn tiền cho khách và mở bán lại.', link: '/kenh-nguoi-ban?don=khieu-nai' });
  if (changed && a.type === 'cancelOverdue') next = addNote(next, o.sellerId, { kind: 'order.cancelled', title: `Đơn bị huỷ vì quá hạn gửi: ${cut(o.title)}`, body: 'Tin đã được gỡ và điểm giao đúng hẹn bị trừ.', link: '/kenh-nguoi-ban?don=da-huy' });
  if (changed && a.type === 'openDispute') next = addNote(next, o.sellerId, { kind: 'dispute.opened', title: `Khiếu nại đơn ${title(o.productId)}`, body: 'Phản hồi kèm ảnh/video đóng gói trong 48 giờ để ReOwn xét công bằng.', link: '/kenh-nguoi-ban?don=khieu-nai' });
  if (o && a.type === 'respondDispute' && o.dispute?.sellerResponse) next = addNote(next, o.buyerId, { kind: 'dispute.responded', title: `Người bán đã phản hồi khiếu nại: ${title(o.productId)}`, link: '/tai-khoan?tab=don-mua' });
  if (changed && a.type === 'handover') next = addNote(next, o.buyerId, { kind: 'order.completed', title: `Đã nhận hàng: ${cut(o.title)}`, body: `Sai mô tả thì khiếu nại trong ${DISPUTE_WINDOW_DAYS} ngày, tiền vẫn đang được giữ hộ.`, link: '/tai-khoan?tab=don-mua' });
  if (changed && a.type === 'returnShip') next = addNote(next, o.sellerId, { kind: 'return.shipped', title: `Người mua đã gửi trả: ${title(o.productId)}`, body: 'Nhận được hàng thì bấm "Đã nhận lại hàng".', link: '/kenh-nguoi-ban?don=khieu-nai' });
  const refundedNow = o && state.orders.find((x) => x.id === o.id)?.payoutStatus !== o.payoutStatus;
  if (refundedNow && a.type === 'returnReceived') next = addNote(next, o.buyerId, { kind: 'return.refunded', title: `Đã hoàn tiền: ${cut(o.title)}`, body: 'Người bán đã nhận lại hàng.', link: '/tai-khoan?tab=don-mua' });
  if (['placeOrder', 'payInstallment'].includes(a.type)) next = remind(next);
  return next;
}
