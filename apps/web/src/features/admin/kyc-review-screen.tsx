"use client";
import { useCallback, useEffect, useState } from "react";

import { AuthGate } from "@/features/auth/components/auth-gate";
import { useMock } from "@/mocks/store";
import {
  decideKyc,
  flagLabel,
  getKycReview,
  kycAssetUrl,
  listKycReviews,
  type KycReviewDetail,
  type KycReviewSummary,
} from "@/lib/kyc/client";

export function KycReviewScreen() {
  return (
    <AuthGate title="Đăng nhập để duyệt xác thực">
      <Reviewer />
    </AuthGate>
  );
}

function Reviewer() {
  const { user, notify } = useMock();
  const [queue, setQueue] = useState<KycReviewSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const isAdmin = user?.role === "admin";

  const refresh = useCallback(async () => {
    try {
      setQueue(await listKycReviews());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tải được danh sách.");
    }
  }, []);
  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [isAdmin, refresh]);

  if (!isAdmin)
    return (
      <div className="container page">
        <h1>Không có quyền truy cập</h1>
        <p className="muted">Trang này chỉ dành cho quản trị viên.</p>
      </div>
    );

  return (
    <div className="container page">
      <h1>Duyệt xác thực sinh viên</h1>
      <p className="muted">
        Mỗi lần mở ảnh hoặc thông tin đều được ghi nhật ký. Dữ liệu bị xoá ngay
        sau khi bạn quyết định.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="kyc-review-layout">
        <nav aria-label="Hồ sơ chờ duyệt">
          {queue === null ? (
            <p className="muted" role="status">Đang tải…</p>
          ) : queue.length === 0 ? (
            <p className="muted">Không có hồ sơ nào chờ duyệt.</p>
          ) : (
            <ul className="kyc-queue">
              {queue.map((item) => (
                <li key={item.id}>
                  <button
                    aria-current={item.id === selected}
                    onClick={() => setSelected(item.id)}
                  >
                    <strong>{item.user.displayName}</strong>
                    <small>
                      {new Date(item.createdAt).toLocaleString("vi-VN")} ·
                      khớp {Math.round(item.faceScore * 100)}%
                    </small>
                    {item.flags.length > 0 && (
                      <small className="kyc-flag-count">
                        {item.flags.length} điểm cần lưu ý
                      </small>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
        {selected && (
          <Detail
            key={selected}
            id={selected}
            onDone={(message) => {
              notify(message);
              setSelected(null);
              void refresh();
            }}
          />
        )}
      </div>
    </div>
  );
}

function Detail({ id, onDone }: { id: string; onDone: (message: string) => void }) {
  const [detail, setDetail] = useState<KycReviewDetail | null>(null);
  const [error, setError] = useState("");
  const [studentId, setStudentId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getKycReview(id)
      .then((value) => {
        if (!active) return;
        setDetail(value);
        setStudentId(value.extracted.studentId);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Không mở được hồ sơ.");
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function decide(decision: "approve" | "reject") {
    if (!detail || busy) return;
    if (decision === "reject" && reason.trim().length < 3) {
      setError("Nhập lý do từ chối (ít nhất 3 ký tự).");
      return;
    }
    if (decision === "approve" && !/^\d{10}$/.test(studentId)) {
      setError("MSSV gồm đúng 10 chữ số.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await decideKyc(id, {
        decision,
        ...(decision === "reject"
          ? { reason: reason.trim() }
          : studentId !== detail.extracted.studentId
            ? { studentId }
            : {}),
      });
      onDone(decision === "approve" ? "Đã duyệt xác thực." : "Đã từ chối hồ sơ.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa lưu được quyết định.");
    } finally {
      setBusy(false);
    }
  }

  if (!detail)
    return (
      <div className="kyc-detail" aria-busy={!error}>
        {error ? <p className="error" role="alert">{error}</p> : <p className="muted" role="status">Đang mở hồ sơ…</p>}
      </div>
    );
  const { extracted } = detail;
  return (
    <section className="kyc-detail" aria-label="Chi tiết hồ sơ" aria-busy={busy}>
      <div className="kyc-detail-images">
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={kycAssetUrl(id, "card_front")} alt="Mặt trước thẻ sinh viên" />
          <figcaption>Thẻ sinh viên</figcaption>
        </figure>
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={kycAssetUrl(id, "selfie")} alt="Ảnh chân dung" />
          <figcaption>Chân dung · độ khớp {Math.round(detail.faceScore * 100)}%</figcaption>
        </figure>
      </div>
      <dl className="kyc-facts-grid">
        <div><dt>Tài khoản</dt><dd>{detail.user.displayName}</dd></div>
        <div><dt>Email</dt><dd>{detail.user.email}</dd></div>
        <div><dt>Họ tên trên thẻ</dt><dd>{extracted.fullName ?? "Không đọc được"}</dd></div>
        <div><dt>Ngày sinh</dt><dd>{extracted.dateOfBirth ?? "Không đọc được"}</dd></div>
        <div><dt>Ngành</dt><dd>{extracted.major ?? "Không đọc được"}</dd></div>
        <div>
          <dt>Niên khoá</dt>
          <dd>{extracted.cohort ? `${extracted.cohort.start}–${extracted.cohort.end}` : "Không đọc được"}</dd>
        </div>
      </dl>
      {detail.flags.length > 0 && (
        <ul className="kyc-flags" aria-label="Điểm cần lưu ý">
          {detail.flags.map((flag) => (
            <li key={flag}>{flagLabel[flag]}</li>
          ))}
        </ul>
      )}
      <div className="kyc-decision">
        <div className="field">
          <label htmlFor="kyc-student-id">MSSV (sửa nếu đọc sai)</label>
          <input
            id="kyc-student-id"
            inputMode="numeric"
            maxLength={10}
            value={studentId}
            onChange={(event) => setStudentId(event.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="field">
          <label htmlFor="kyc-reason">Lý do từ chối (người dùng sẽ thấy)</label>
          <textarea
            id="kyc-reason"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="kyc-actions">
          <button className="button danger" disabled={busy} onClick={() => decide("reject")}>
            Từ chối
          </button>
          <button className="button primary" disabled={busy} onClick={() => decide("approve")}>
            {busy ? "Đang lưu…" : "Duyệt"}
          </button>
        </div>
      </div>
    </section>
  );
}
