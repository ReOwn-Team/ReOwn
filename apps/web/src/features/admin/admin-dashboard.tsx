"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BadgeCheck, Boxes, ClipboardList, Flag, ShieldCheck, UsersRound } from "lucide-react";

type Statistics = { users: number; activeUsers: number; products: number; publishedProducts: number; orders: number; reports: number };
const format = (value: number) => new Intl.NumberFormat("vi-VN").format(value);

export function AdminDashboard() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/statistics", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 403 ? "Bạn không có quyền xem thống kê." : "Không tải được thống kê. Vui lòng thử lại.");
        return response.json() as Promise<Statistics>;
      })
      .then((data) => { setStats(data); setError(""); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không tải được thống kê."); });
    return () => controller.abort();
  }, [revision]);
  const metrics = stats ? [
    { label: "Người dùng", value: stats.users, icon: UsersRound, detail: `${format(stats.activeUsers)} đang hoạt động` },
    { label: "Tin đăng", value: stats.products, icon: Boxes, detail: `${format(stats.publishedProducts)} đang hiển thị` },
    { label: "Đơn hàng", value: stats.orders, icon: ClipboardList, detail: "Tất cả trạng thái" },
    { label: "Báo cáo", value: stats.reports, icon: Flag, detail: "Tất cả trạng thái" },
  ] : [];
  return (
    <div className="admin-dashboard">
      <header className="admin-page-heading"><div><h1>Tổng quan</h1><p>Theo dõi hoạt động và xử lý các công việc của ReOwn.</p></div><button type="button" className="admin-refresh" onClick={() => { setError(""); setStats(null); setRevision((n) => n + 1); }}>Làm mới dữ liệu</button></header>
      {error ? <div className="admin-error" role="alert">{error} <button onClick={() => setRevision((n) => n + 1)}>Thử lại</button></div> : !stats ? <div className="admin-loading" role="status">Đang tải thống kê…</div> : <>
        <div className="admin-metrics" aria-label="Thống kê tổng quan">{metrics.map(({ label, value, icon: Icon, detail }) => <article className="admin-metric" key={label}><div className="admin-metric-title"><span>{label}</span><Icon size={19} aria-hidden="true" /></div><strong>{format(value)}</strong><small>{detail}</small></article>)}</div>
        <div className="admin-dashboard-grid">
          <section className="admin-panel admin-breakdown" aria-labelledby="breakdown-heading"><div className="admin-panel-heading"><div><h2 id="breakdown-heading">Tình hình nền tảng</h2><p>Tỷ lệ hiện tại theo dữ liệu hệ thống</p></div><BadgeCheck size={20} aria-hidden="true" /></div>
            {[{label: "Người dùng hoạt động", value: stats.activeUsers, total: stats.users}, {label: "Tin đăng đang hiển thị", value: stats.publishedProducts, total: stats.products}].map((row) => {
              const ratio = row.total ? Math.min(100, Math.round(row.value / row.total * 100)) : 0;
              return <div className="admin-bar-row" key={row.label}><div><strong>{row.label}</strong><span>{format(row.value)} / {format(row.total)}</span></div><div className="admin-bar" role="img" aria-label={`${row.label}: ${format(row.value)} trên ${format(row.total)}`}><span style={{ width: `${ratio}%` }} /></div><small>{row.total ? `${ratio}% tổng số` : "Chưa có dữ liệu"}</small></div>;
            })}
            <p className="admin-panel-note">Số liệu là ảnh chụp tại thời điểm tải và có thể thay đổi khi có hoạt động mới.</p>
          </section>
          <section className="admin-panel admin-actions" aria-labelledby="actions-heading"><div className="admin-panel-heading"><div><h2 id="actions-heading">Công việc quản trị</h2><p>Truy cập nhanh các khu vực cần xử lý</p></div></div>
            <Link href="/admin/products"><span className="admin-action-icon"><ClipboardList size={20}/></span><span><strong>Duyệt sản phẩm</strong><small>Kiểm tra tin đăng chờ phê duyệt</small></span><ArrowUpRight size={18}/></Link>
            <Link href="/admin/kyc"><span className="admin-action-icon"><ShieldCheck size={20}/></span><span><strong>Xác thực sinh viên</strong><small>Xem xét hồ sơ KYC thủ công</small></span><ArrowUpRight size={18}/></Link>
            <Link href="/admin/users"><span className="admin-action-icon"><UsersRound size={20}/></span><span><strong>Người dùng</strong><small>Xem danh sách và trạng thái</small></span><ArrowUpRight size={18}/></Link>
          </section>
        </div>
      </>}
    </div>
  );
}
