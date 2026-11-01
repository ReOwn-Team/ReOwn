"use client";
import { useEffect, useState, type FormEvent } from "react";

import { useMock } from "@/mocks/store";

import { authSession } from "@/lib/auth/session";
import { errorMessage } from "@/lib/auth/errors";

export function ProfileTab({ onVerify }: { onVerify: () => void }) {
  const { user, notify } = useMock();
  const [name, setName] = useState(user!.name);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    authSession
      .getProfile()
      .then((profile) => {
        if (active) setName(profile.displayName);
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim() || name.trim().length > 100) {
      setError("Nhập tên từ 1 đến 100 ký tự.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const profile = await authSession.updateProfile(name.trim());
      setName(profile.displayName);
      notify("Đã lưu thay đổi hồ sơ.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="panel profile-panel"
      onSubmit={submit}
      aria-busy={busy || loading}
    >
      <h2>Tổng quan</h2>
      <dl className="profile-overview">
        {[
          ["Tên hiển thị", user!.name],
          ["Email", user!.email],
          ["Số điện thoại", user!.phone],
          ["Loại tài khoản", user!.role === "user" ? "Mua và bán" : user!.role],
          [
            "Tình trạng tài khoản",
            user!.status === "active" ? "Đang hoạt động" : "Không hoạt động",
          ],
          [
            "Xác nhận SĐT",
            user!.phoneVerified === 1 ? "Đã xác nhận" : "Chưa xác nhận",
          ],
          [
            "Xác nhận email",
            user!.emailVerified === 1 ? "Đã xác nhận" : "Chưa xác nhận",
          ],
          [
            "Xác thực danh tính",
            ["Chưa xác thực", "Đang chờ duyệt", "Đã xác thực", "Chưa được duyệt"][
              user!.kycStatus
            ] ?? "Chưa xác thực",
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="profile-avatar">
        <span className="profile-avatar-image">
          {user!.name
            .split(" ")
            .map((v) => v[0])
            .slice(-2)
            .join("")}
        </span>
        <span className="badge neutral">Ảnh đại diện bằng chữ</span>
        <div>
          <strong>Ảnh đại diện của bạn</strong>
          <p className="small muted">
            Ảnh đại diện dùng chữ viết tắt từ tên hiển thị của bạn.
          </p>
        </div>
      </div>
      <h2>Cá nhân</h2>
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="profile-name">Tên hiển thị</label>
          <input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            disabled={busy || loading}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="profile-email">Email</label>
          <input id="profile-email" type="email" value={user!.email} readOnly />
        </div>
        <div className="field">
          <label htmlFor="profile-phone">Số điện thoại đăng nhập</label>
          <input id="profile-phone" type="tel" value={user!.phone} readOnly />
        </div>
      </div>
      <p className="small muted">
        Bạn có thể đổi tên hiển thị. Email và số điện thoại đăng nhập hiện chưa
        thể thay đổi.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button className="button primary" disabled={busy || loading}>
          {busy ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
      </div>
      <button className="plain-button" type="button" onClick={onVerify}>
        Xác thực bằng thẻ sinh viên
      </button>
    </form>
  );
}
