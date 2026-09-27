import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../state/useStore.js';
import Art from '../components/Art.jsx';
import Icon from '../components/Icon.jsx';
import { Empty } from '../components/ui.jsx';
import { MESSAGE_FLAG_TEXT } from '../../shared/scoring/engine.js';
import { money, timeAgoShort } from '../lib/format.js';

const QUICK = ['Món này còn không bạn?', 'Có bớt giá không bạn?', 'Tình trạng máy thế nào bạn?'];
const time = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

function ConversationList({ items, activeId }) {
  if (!items) return <p className="muted small conv-empty">Đang tải…</p>;
  if (!items.length) return <p className="muted small conv-empty">Chưa có cuộc trò chuyện. Mở một món bất kỳ và bấm “Chat với người bán”.</p>;
  return (
    <ul className="conv-list">
      {items.map((c) => (
        <li key={c.id}>
          <Link to={`/tin-nhan/${c.id}`} className={`conv ${c.id === activeId ? 'on' : ''} ${c.unread ? 'unread' : ''}`}>
            <Art product={c.listing} size="xs" />
            <span className="conv-main">
              <span className="conv-top"><b>{c.other.name}</b><span className="conv-time">{c.lastMessageAt ? timeAgoShort(c.lastMessageAt) : ''}</span></span>
              <span className="conv-item">{c.role === 'seller' ? 'Hỏi mua: ' : ''}{c.listing.title}</span>
              {c.last && <span className="conv-last">{c.last.mine ? 'Bạn: ' : ''}{c.last.body}</span>}
            </span>
            {c.unread > 0 && <span className="conv-badge">{c.unread}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Thread({ id, onActivity }) {
  const { chat, mode, me, refreshInbox } = useStore();
  const nav = useNavigate();
  const [conv, setConv] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const [missing, setMissing] = useState(false);
  const lastId = useRef(0);
  const end = useRef(null);
  const input = useRef(null);

  const poll = useCallback(async () => {
    try {
      const r = await chat.thread(id, lastId.current);
      const first = lastId.current === 0;
      setConv(r.conversation);
      if (first || r.messages.length) refreshInbox?.();
      if (r.messages.length) {
        lastId.current = r.messages[r.messages.length - 1].id;
        setMsgs((m) => [...m, ...r.messages.filter((x) => !m.some((y) => y.id === x.id))]);
        onActivity?.();
      }
    } catch { setMissing(true); }
  }, [chat, id, onActivity, refreshInbox]);

  useEffect(() => {
    poll();
    const t = setInterval(() => { if (!document.hidden) poll(); }, mode === 'api' ? 4000 : 1000);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [id, poll, mode]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  const send = async (body = text) => {
    const b = body.trim();
    if (!b || sending) return;
    setSending(true); setErr('');
    try {
      await chat.send(id, b);
      setText('');
      await poll();
      input.current?.focus();
    } catch (e) { setErr(e.message); } finally { setSending(false); }
  };

  if (missing) return <Empty title="Không tìm thấy cuộc trò chuyện" action={<Link className="btn" to="/tin-nhan">Về hộp thư</Link>} />;
  if (!conv) return <p className="muted small conv-empty">Đang tải…</p>;
  const l = conv.listing;
  return (
    <div className="thread">
      <header className="thread-head">
        <button type="button" className="icon-btn thread-back" onClick={() => nav('/tin-nhan')} aria-label="Về danh sách"><Icon name="chevronLeft" /></button>
        <div className="thread-who"><b>{conv.other.name}</b><span className="small muted">{conv.role === 'buyer' ? 'Người bán' : 'Người mua'}</span></div>
      </header>
      <Link to={`/san-pham/${l.id}`} className="thread-item">
        <Art product={l} size="xs" />
        <span className="ti-main"><span className="ti-title">{l.title}</span>{l.price != null && <b className="price">{money(l.price)}</b>}</span>
        {l.status !== 'active' ? <span className="small muted">{l.status === 'hidden' ? 'Đã gỡ' : 'Đã có người mua'}</span>
          : conv.role === 'buyer' && <span className="btn btn-sm">Mua qua ReOwn</span>}
      </Link>
      <p className="thread-safe small"><Icon name="shield" size={16} />{conv.role === 'buyer'
        ? 'Tiền được ReOwn giữ hộ đến khi bạn nhận hàng. Không chuyển khoản riêng cho người bán.'
        : 'Chỉ nhận tiền qua ReOwn. Người mua đòi giao dịch ngoài là dấu hiệu lừa đảo.'}</p>

      <div className="msgs" role="log" aria-live="polite" aria-label="Tin nhắn">
        {msgs.length === 0 && conv.role === 'buyer' && (
          <div className="quick">
            <span className="small muted">Gợi ý câu hỏi</span>
            <div className="chips">{QUICK.map((q) => <button type="button" key={q} className="chip" onClick={() => send(q)}>{q}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => {
          const mine = m.sender_id === me.id;
          const flags = !mine ? (Array.isArray(m.flags) ? m.flags : []) : [];
          const showTime = i === 0 || new Date(m.created_at) - new Date(msgs[i - 1].created_at) > 10 * 60_000;
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : 'theirs'}`}>
              {showTime && <span className="msg-time">{time(m.created_at)}</span>}
              <p className="bubble">{m.body}</p>
              {m.auto && <span className="msg-auto">Trả lời tự động (bản demo)</span>}
              {flags.length > 0 && (
                <p className="msg-warn small"><Icon name="alert" size={14} />{flags.map((f) => MESSAGE_FLAG_TEXT[f]).filter(Boolean).join(' ')} Chỉ thanh toán trong ReOwn.</p>
              )}
            </div>
          );
        })}
        <div ref={end} />
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {err && <p className="composer-err small" role="alert">{err}</p>}
        <label htmlFor="msg" className="sr-only">Tin nhắn</label>
        <textarea id="msg" ref={input} rows={1} value={text} maxLength={1000} placeholder={conv.role === 'buyer' ? 'Nhắn cho người bán…' : 'Nhắn cho người mua…'}
          disabled={l.status === 'hidden'}
          onChange={(e) => { setText(e.target.value); setErr(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
        <button className="btn send" disabled={!text.trim() || sending} aria-label="Gửi"><Icon name="send" size={20} /></button>
      </form>
    </div>
  );
}

export default function Messages() {
  const { id } = useParams();
  const { chat, inbox } = useStore();
  const [items, setItems] = useState(null);
  const load = useCallback(() => chat.list().then(setItems).catch(() => setItems([])), [chat]);
  useEffect(() => { load(); }, [load, inbox.chats, id]);

  return (
    <div className={`messages ${id ? 'has-thread' : ''}`}>
      <aside className="panel conv-pane" aria-label="Cuộc trò chuyện">
        <h1 className="conv-h">Tin nhắn</h1>
        <ConversationList items={items} activeId={id} />
      </aside>
      <section className="panel thread-pane">
        {id ? <Thread key={id} id={id} onActivity={load} />
          : <div className="thread-idle"><Icon name="chat" size={32} /><p className="muted">Chọn một cuộc trò chuyện</p></div>}
      </section>
    </div>
  );
}
