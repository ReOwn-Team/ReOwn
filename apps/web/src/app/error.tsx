"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="container page">
      <section className="empty-state">
        <h1>Chưa thể hiển thị nội dung</h1>
        <p>
          Thử tải lại phần này. Dữ liệu demo đã lưu trên thiết bị vẫn được giữ.
        </p>
        <button className="button primary" onClick={reset}>
          Thử lại
        </button>
        <Link className="button secondary" href="/">
          Về trang chủ
        </Link>
      </section>
    </div>
  );
}
