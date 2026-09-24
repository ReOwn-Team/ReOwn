import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../state/useStore.js';
import Icon from '../components/Icon.jsx';
import * as client from '../api/client.js';

const DEMO = [
  { phone: '0900000002', name: 'Trần Ngọc Lan', note: 'Người mua uy tín cao' },
  { phone: '0900000001', name: 'Nguyễn Minh', note: 'Tài khoản mới, chưa có CCCD' },
  { phone: '0900000003', name: 'Lê Quốc Huy', note: 'Từng trả trễ' },
  { phone: '0900000011', name: 'Phạm Gia Bảo', note: 'Người bán hạng A' },
  { phone: '0999999999', name: 'Quản trị ReOwn', note: 'Trang quản trị (bản demo: mã 2 lớp nhập 6 số bất kỳ)' },
];
const MOCK_CODE = '123456';

export default function Login() {
  const { mode, dispatch, devTools, demo, users } = useStore();
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState('phone');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const mockUser = (p) => users.find((u) => u.phone === p);

  const send = async (e, p = phone) => {
    e?.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'mock') {
        if (!mockUser(p)) throw new Error('Bản trải nghiệm chỉ có các tài khoản mẫu bên dưới');
        setCode(MOCK_CODE);
      } else {
        const r = await client.requestOtp(p);
        if (r.devCode) setCode(r.devCode);
      }
      setPhone(p); setStep('code');
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  const from = useLocation().state?.from;
  const done = () => nav(from && !from.startsWith('/dang-nhap') ? from : '/', { replace: true });

  const verify = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'mock') {
        if (code !== MOCK_CODE) throw new Error('Mã không đúng');
        await dispatch({ type: 'login', id: mockUser(phone).id });
        done();
      } else {
        const { created } = await client.verifyOtp(phone, code);
        await dispatch({ type: 'afterLogin' });
        if (created) setStep('name'); else done();
      }
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  const saveName = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await client.api('/me', { method: 'PATCH', body: { name: name.trim() } });
      await dispatch({ type: 'afterLogin' });
      done();
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <div className="login-page">
      <section className="login-brand">
        <span className="logo logo-lg">Re<span>Own</span></span>
        <h1>Đồ cũ chất lượng, trả sau nhẹ nhàng</h1>
        <ul>
          <li><Icon name="shield" /> Tiền giữ hộ đến khi bạn nhận hàng</li>
          <li><Icon name="bag" /> Trả sau 3 kỳ 0% cho sinh viên</li>
          <li><Icon name="user" /> Người bán được chấm điểm uy tín</li>
        </ul>
      </section>
      <section className="login-card">
        <h2>{{ phone: 'Đăng nhập / Đăng ký', code: 'Nhập mã xác thực', name: 'Chào mừng bạn đến ReOwn' }[step]}</h2>
        <form className="form" onSubmit={{ phone: send, code: verify, name: saveName }[step]}>
          {step === 'name' ? (
            <>
              <p className="small muted">Tài khoản mới đã được tạo. Cho người bán biết tên bạn nhé.</p>
              <div className="field">
                <label htmlFor="nm">Họ tên</label>
                <input id="nm" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus minLength={2} maxLength={80} required />
              </div>
              <button className="btn btn-buy" disabled={busy || name.trim().length < 2}>Hoàn tất</button>
              <button type="button" className="linkbtn" onClick={done}>Để sau</button>
            </>
          ) : step === 'phone' ? (
            <>
              <div className="field">
                <label htmlFor="ph">Số điện thoại</label>
                <input id="ph" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="09xx xxx xxx" required />
              </div>
              <button className="btn btn-buy" disabled={busy || phone.length !== 10}>Tiếp tục</button>
              <p className="small muted">Mã 6 số gửi qua SMS, không cần mật khẩu.</p>
            </>
          ) : (
            <>
              <p className="small muted">Mã đã gửi tới <b>{phone}</b>{devTools ? ' (đã điền sẵn)' : ''}.</p>
              <div className="field">
                <label htmlFor="otp">Mã OTP</label>
                <input id="otp" className="otp" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
              </div>
              <button className="btn btn-buy" disabled={busy || code.length !== 6}>Đăng nhập</button>
              <button type="button" className="linkbtn" onClick={() => { setStep('phone'); setCode(''); }}>Đổi số điện thoại</button>
            </>
          )}
          {err && <p className="alert alert-high small" role="alert">{err}</p>}
        </form>
        {devTools && step === 'phone' && (
          <div className="demo-accts">
            <h3>Dùng thử bằng tài khoản mẫu</h3>
            {demo && <p className="small muted">Bản trình diễn: dữ liệu dùng chung và tự làm mới lúc 3:00 mỗi ngày. Không nhập thông tin thật.</p>}
            {DEMO.map((d) => (
              <button key={d.phone} className="demo-acct" onClick={() => send(null, d.phone)}>
                <span className="avatar">{d.name.split(' ').pop()[0]}</span>
                <span><b>{d.name}</b><span className="small muted">{d.note}</span></span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
