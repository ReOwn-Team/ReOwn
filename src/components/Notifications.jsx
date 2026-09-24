import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../state/useStore.js';
import Icon from './Icon.jsx';
import { useDismiss } from '../lib/useDismiss.js';
import { timeAgoShort } from '../lib/format.js';

const ICON = {
  'order.new': 'bag', 'order.shipped': 'truck', 'order.completed': 'check', 'payout.released': 'wallet',
  'order.cancelled': 'close', 'order.refused': 'close', 'dispute.opened': 'alert', 'dispute.resolved': 'shield',
  'review.new': 'star', 'installment.due_soon': 'calendar', 'installment.due_today': 'calendar',
  'installment.overdue': 'alert', 'listing.price_drop': 'arrowUp',
};
const URGENT = new Set(['installment.overdue', 'installment.due_today', 'dispute.opened']);


function NotificationList({ onPick, compact, page }) {
  const { notes, inbox } = useStore();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const load = useCallback(() => notes.list().then(setData).catch(() => setData({ items: [], unread: 0 })), [notes]);
  useEffect(() => { load(); }, [load, inbox.notifications]);

  const open = async (n) => {
    if (!n.read) await notes.markRead([n.id]);
    onPick?.();
    if (n.link) nav(n.link);
  };
  const readAll = async () => { await notes.markRead(); load(); };

  return (
    <div className={`notes ${compact ? 'notes-compact' : ''}`}>
      <div className="notes-head">
        {page ? <h1 className="notes-h">Thông báo</h1> : <strong>Thông báo</strong>}
        {data?.unread > 0 && <button type="button" className="linkbtn small" onClick={readAll}>Đánh dấu đã đọc</button>}
      </div>
      {!data ? <p className="muted small notes-empty">Đang tải…</p>
        : data.items.length === 0 ? <p className="muted small notes-empty">Chưa có thông báo. Đơn hàng, tiền về ví và lịch trả kỳ sẽ hiện ở đây.</p>
          : (
            <ul className="notes-list">
              {data.items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`note ${n.read ? '' : 'unread'} ${URGENT.has(n.kind) ? 'urgent' : ''}`} onClick={() => open(n)}>
                    <span className="note-ic"><Icon name={ICON[n.kind] || 'info'} size={18} /></span>
                    <span className="note-main">
                      <span className="note-title">{n.title}</span>
                      {n.body && <span className="note-body">{n.body}</span>}
                      <span className="note-time">{timeAgoShort(n.created_at)}</span>
                    </span>
                    {!n.read && <span className="note-dot" aria-label="Chưa đọc" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
    </div>
  );
}

export function NotificationBell() {
  const { inbox } = useStore();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useDismiss(box, open, useCallback(() => setOpen(false), []));
  const n = inbox.notifications;
  const click = () => (window.matchMedia('(max-width: 640px)').matches ? nav('/thong-bao') : setOpen(!open));
  return (
    <div className="bell" ref={box}>
      <button type="button" className="icon-btn" onClick={click} aria-expanded={open} aria-label={n ? `Thông báo, ${n} chưa đọc` : 'Thông báo'}>
        <Icon name="bell" />{n > 0 && <span className="count">{n > 99 ? '99+' : n}</span>}
      </button>
      {open && <div className="bell-pop"><NotificationList compact onPick={() => setOpen(false)} /></div>}
    </div>
  );
}

export function ChatLink() {
  const { inbox } = useStore();
  const n = inbox.chats;
  return (
    <Link to="/tin-nhan" className="icon-btn" aria-label={n ? `Tin nhắn, ${n} chưa đọc` : 'Tin nhắn'}>
      <Icon name="chat" />{n > 0 && <span className="count">{n > 99 ? '99+' : n}</span>}
    </Link>
  );
}

export default function NotificationsPage() {
  return <section className="panel notes-page"><NotificationList page /></section>;
}
