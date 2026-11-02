"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    BadgeCheck,
    Upload,
    CheckCircle2,
    Clock3,
    Lock,
    RefreshCw,
    ShieldCheck,
    Trash2,
} from "lucide-react";

import { Dialog } from "@/components/ui/dialog";
import { authSession } from "@/lib/auth/session";
import {
    getKycStatus,
    issueMessage,
    issueTarget,
    KycRequestError,
    submitKyc,
    withdrawKyc,
    type KycIssue,
    type KycState,
} from "@/lib/kyc/client";
import { prepareImage } from "@/lib/kyc/image";
import { SelfieCapture } from "@/features/account/components/selfie-capture";
import { CardCamera } from "@/features/account/components/card-camera";
import "@/features/account/kyc.css";

type Step = "consent" | "card" | "selfie" | "review";
const steps: { id: Step; label: string }[] = [
    { id: "consent", label: "Đồng ý" },
    { id: "card", label: "Thẻ sinh viên" },
    { id: "selfie", label: "Chân dung" },
    { id: "review", label: "Gửi" },
];

function useObjectUrl(blob: Blob | null) {
    const url = useMemo(
        () => (blob ? URL.createObjectURL(blob) : null),
        [blob],
    );
    useEffect(
        () => () => {
            if (url) URL.revokeObjectURL(url);
        },
        [url],
    );
    return url;
}

export function VerificationDialog({ onClose }: { onClose: () => void }) {
    const [state, setState] = useState<KycState | null>(null);
    const [loadError, setLoadError] = useState("");
    const [step, setStep] = useState<Step>("consent");
    const [agreed, setAgreed] = useState(false);
    const [card, setCard] = useState<Blob | null>(null);
    const [selfie, setSelfie] = useState<Blob | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [issues, setIssues] = useState<KycIssue[]>([]);
    const [restarting, setRestarting] = useState(false);
    const [confirmWithdraw, setConfirmWithdraw] = useState(false);
    const cardPicker = useRef<HTMLInputElement>(null);
    const cardUrl = useObjectUrl(card);
    const selfieUrl = useObjectUrl(selfie);

    useEffect(() => {
        let active = true;
        getKycStatus()
            .then((value) => active && setState(value))
            .catch((reason: unknown) => {
                if (active)
                    setLoadError(
                        reason instanceof Error
                            ? reason.message
                            : "Không tải được trạng thái.",
                    );
            });
        return () => {
            active = false;
        };
    }, []);

    async function choose(file: File | undefined, set: (blob: Blob) => void) {
        if (!file) return;
        setError("");
        try {
            set(await prepareImage(file));
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Không đọc được ảnh.",
            );
        }
    }

    async function send() {
        if (!agreed || !card || !selfie || !state || busy) return;
        setBusy(true);
        setError("");
        setIssues([]);
        try {
            await submitKyc(card, selfie, state.consentVersion);
            setCard(null);
            setSelfie(null);
            setState({
                ...state,
                status: "needs_review",
                requiresReverification: false,
            });
            void authSession.reload();
        } catch (reason) {
            if (reason instanceof KycRequestError && reason.issues.length) {
                setIssues(reason.issues);
                const targets = reason.issues.map(issueTarget);
                // Send the user back to the first photo that needs retaking.
                if (targets.includes("card")) {
                    setCard(null);
                    setStep("card");
                } else if (targets.includes("selfie")) {
                    setSelfie(null);
                    setStep("selfie");
                } else {
                    setCard(null);
                    setSelfie(null);
                    setStep("card");
                }
            } else
                setError(
                    reason instanceof Error
                        ? reason.message
                        : "Chưa gửi được hồ sơ.",
                );
        } finally {
            setBusy(false);
        }
    }

    async function withdraw() {
        if (restarting) return;
        setRestarting(true);
        setError("");
        try {
            await withdrawKyc();
            setState((value) =>
                value ? { ...value, status: "none", reason: null } : value,
            );
            setStep("consent");
            setAgreed(false);
            setConfirmWithdraw(false);
            void authSession.reload();
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Chưa xoá được dữ liệu.",
            );
        } finally {
            setRestarting(false);
        }
    }

    const index = steps.findIndex((item) => item.id === step);
    const flow =
        state &&
        (state.status === "none" ||
            state.status === "rejected" ||
            state.status === "expired" ||
            state.requiresReverification);

    return (
        <Dialog
            title="Xác thực sinh viên"
            onClose={onClose}
            className="kyc-dialog"
        >
            <div className="kyc-body" aria-busy={busy}>
                <header className="kyc-head">
                    <h2>Xác thực sinh viên</h2>
                    <p className="muted">
                        Dùng thẻ sinh viên Đại học Công Thương TP.HCM để người
                        mua và người bán yên tâm hơn khi giao dịch.
                    </p>
                </header>

                {!state && !loadError && (
                    <p className="muted" role="status">
                        Đang tải…
                    </p>
                )}
                {loadError && (
                    <p className="error" role="alert">
                        {loadError}
                    </p>
                )}

                {state && !state.available && (
                    <p className="kyc-note" role="status">
                        Tính năng xác thực chưa sẵn sàng trên máy chủ. Vui lòng
                        quay lại sau.
                    </p>
                )}

                {state?.status === "needs_review" && (
                    <section className="kyc-result" aria-live="polite">
                        <Clock3 size={32} aria-hidden="true" />
                        <h3>Hồ sơ đang chờ duyệt</h3>
                        <p className="muted">
                            Chúng tôi đã nhận ảnh của bạn. Hồ sơ chờ quản trị
                            viên xem xét; kết quả hiển thị tại trang Tài khoản.
                            Hồ sơ chưa được duyệt được đưa vào diện xoá sau 14
                            ngày.
                        </p>
                        <button
                            className="plain-button"
                            onClick={() => {
                                setError("");
                                setConfirmWithdraw(true);
                            }}
                            disabled={restarting || confirmWithdraw}
                        >
                            <Trash2 size={16} aria-hidden="true" />
                            {restarting
                                ? "Đang xoá…"
                                : "Rút hồ sơ và xoá dữ liệu"}
                        </button>
                    </section>
                )}

                {state?.status === "verified" && (
                    <section
                        className="kyc-result kyc-result-ok"
                        aria-live="polite"
                    >
                        <BadgeCheck size={32} aria-hidden="true" />
                        <h3>Tài khoản đã được xác thực</h3>
                        <p className="muted">
                            ReOwn lưu mã hoá ảnh thẻ, ảnh chân dung, MSSV và họ
                            tên để xác minh danh tính, xử lý tranh chấp và thực
                            hiện nghĩa vụ thanh toán. Chỉ quản trị viên được ủy
                            quyền mới có thể xem; mọi lần xem đều được ghi nhận.
                        </p>
                        {state.requiresReverification && (
                            <>
                                <p className="kyc-note" role="status">
                                    Hồ sơ cũ không còn bằng chứng định danh theo
                                    chính sách lưu giữ hiện tại. Hãy xác thực
                                    lại để cập nhật hồ sơ.
                                </p>
                                <button
                                    className="button primary"
                                    type="button"
                                    onClick={() => {
                                        setState((value) =>
                                            value
                                                ? {
                                                      ...value,
                                                      status: "none",
                                                      requiresReverification: false,
                                                  }
                                                : value,
                                        );
                                        setStep("consent");
                                        setAgreed(false);
                                        setError("");
                                    }}
                                >
                                    Xác thực lại
                                </button>
                            </>
                        )}
                    </section>
                )}

                {confirmWithdraw && state?.status === "needs_review" && (
                    <section
                        className="kyc-confirm"
                        aria-labelledby="kyc-withdraw-title"
                    >
                        <h3 id="kyc-withdraw-title">Rút hồ sơ?</h3>
                        <p>
                            Hồ sơ sẽ không tiếp tục được duyệt; ảnh và dữ liệu
                            đọc được sẽ bị xoá. Mã băm có khóa của MSSV, điểm
                            đối chiếu và nhật ký kiểm toán vẫn có thể được lưu.
                        </p>
                        {error && (
                            <p className="error" role="alert">
                                {error}
                            </p>
                        )}
                        <div className="kyc-actions">
                            <button
                                type="button"
                                className="button secondary"
                                disabled={restarting}
                                onClick={() => {
                                    setConfirmWithdraw(false);
                                    setError("");
                                }}
                            >
                                Huỷ
                            </button>
                            <button
                                type="button"
                                className="button primary"
                                disabled={restarting}
                                onClick={withdraw}
                            >
                                {restarting
                                    ? "Đang xử lý…"
                                    : "Xác nhận rút hồ sơ"}
                            </button>
                        </div>
                    </section>
                )}

                {state?.available && flow && (
                    <>
                        {state.status === "rejected" && step === "consent" && (
                            <p className="kyc-note kyc-note-warn" role="status">
                                Lần xác thực trước chưa được duyệt
                                {state.reason ? `: ${state.reason}` : "."} Bạn
                                có thể gửi lại.
                            </p>
                        )}
                        <ol className="kyc-steps" aria-label="Các bước">
                            {steps.map((item, position) => (
                                <li
                                    key={item.id}
                                    aria-current={
                                        position === index ? "step" : undefined
                                    }
                                    data-done={position < index}
                                >
                                    <span aria-hidden="true">
                                        {position < index ? (
                                            <CheckCircle2 size={16} />
                                        ) : (
                                            position + 1
                                        )}
                                    </span>
                                    {item.label}
                                </li>
                            ))}
                        </ol>

                        {issues.length > 0 && (
                            <ul className="kyc-issues" role="alert">
                                {[...new Set(issues)].map((issue) => (
                                    <li key={issue}>{issueMessage[issue]}</li>
                                ))}
                            </ul>
                        )}
                        {error && (
                            <p className="error" role="alert">
                                {error}
                            </p>
                        )}

                        {step === "consent" && (
                            <section className="kyc-panel">
                                <ul className="kyc-facts">
                                    <li>
                                        <ShieldCheck
                                            size={18}
                                            aria-hidden="true"
                                        />
                                        <span>
                                            <strong>Xác minh danh tính.</strong>{" "}
                                            Ảnh mặt trước thẻ và ảnh chân dung
                                            dùng để đối chiếu khuôn mặt và đọc
                                            thông tin trên thẻ, gồm MSSV, họ
                                            tên.
                                        </span>
                                    </li>
                                    <li>
                                        <Lock size={18} aria-hidden="true" />
                                        <span>
                                            <strong>
                                                Xử lý trong hệ thống ReOwn.
                                            </strong>{" "}
                                            Ảnh được xử lý trên máy chủ ReOwn,
                                            mã hoá khi lưu; chỉ quản trị viên
                                            được ủy quyền xem để xác minh, xử lý
                                            tranh chấp và nghĩa vụ thanh toán.
                                        </span>
                                    </li>
                                    <li>
                                        <Trash2 size={18} aria-hidden="true" />
                                        <span>
                                            <strong>
                                                Lưu giữ sau xác thực.
                                            </strong>{" "}
                                            Với hồ sơ được duyệt, ReOwn lưu mã
                                            hoá ảnh thẻ, ảnh chân dung, MSSV và
                                            họ tên để phục vụ xác minh danh
                                            tính, tranh chấp và nghĩa vụ thanh
                                            toán. Hồ sơ chưa được duyệt quá 14
                                            ngày được đưa vào diện xoá. Bạn có
                                            thể rút hồ sơ khi đang chờ duyệt.
                                        </span>
                                    </li>
                                </ul>
                                <label className="kyc-consent">
                                    <input
                                        type="checkbox"
                                        checked={agreed}
                                        onChange={(event) =>
                                            setAgreed(event.target.checked)
                                        }
                                    />
                                    <span>
                                        Tôi đồng ý để ReOwn xử lý và lưu mã hoá
                                        ảnh thẻ sinh viên, ảnh chân dung, dữ
                                        liệu khuôn mặt, MSSV và họ tên cho mục
                                        đích xác minh danh tính, xử lý tranh
                                        chấp và nghĩa vụ thanh toán như mô tả ở
                                        trên.
                                    </span>
                                </label>
                                <button
                                    className="button primary full"
                                    disabled={!agreed}
                                    onClick={() => setStep("card")}
                                >
                                    Tiếp tục
                                </button>
                            </section>
                        )}

                        {step === "card" && (
                            <section className="kyc-panel">
                                {cardUrl ? (
                                    <div className="kyc-viewport kyc-viewport-card">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={cardUrl}
                                            alt="Ảnh mặt trước thẻ sinh viên bạn đã chọn"
                                        />
                                    </div>
                                ) : (
                                    <CardCamera
                                        onCapture={(blob) =>
                                            void choose(
                                                new File([blob], "card.jpg"),
                                                setCard,
                                            )
                                        }
                                    />
                                )}
                                <ul className="kyc-tips">
                                    <li>
                                        Đặt thẻ trên nền phẳng, đủ sáng, không
                                        bị loá.
                                    </li>
                                    <li>
                                        Chụp thẳng, thấy rõ ảnh chân dung, họ
                                        tên và MSSV.
                                    </li>
                                    <li>
                                        Có thể để thẻ trong bao nhựa nếu không
                                        phản chiếu.
                                    </li>
                                </ul>
                                <div className="kyc-actions">
                                    {cardUrl && (
                                        <button
                                            className="button secondary"
                                            onClick={() => setCard(null)}
                                        >
                                            <RefreshCw
                                                size={18}
                                                aria-hidden="true"
                                            />{" "}
                                            Chụp lại thẻ
                                        </button>
                                    )}
                                    <button
                                        className="button secondary"
                                        onClick={() =>
                                            cardPicker.current?.click()
                                        }
                                    >
                                        <Upload size={18} aria-hidden="true" />
                                        {cardUrl
                                            ? "Chọn ảnh thẻ khác"
                                            : "Chọn ảnh thẻ từ thư viện"}
                                    </button>
                                    {cardUrl && (
                                        <button
                                            className="button primary"
                                            onClick={() => {
                                                setIssues([]);
                                                setStep("selfie");
                                            }}
                                        >
                                            Tiếp tục
                                        </button>
                                    )}
                                </div>
                                <input
                                    ref={cardPicker}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"

                                    hidden
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        event.target.value = "";
                                        void choose(file, setCard);
                                    }}
                                />
                            </section>
                        )}

                        {step === "selfie" && (
                            <section className="kyc-panel">
                                {selfieUrl ? (
                                    <>
                                        <div className="kyc-viewport kyc-viewport-selfie">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={selfieUrl}
                                                alt="Ảnh chân dung bạn vừa chụp"
                                            />
                                        </div>
                                        <div className="kyc-actions">
                                            <button
                                                className="button secondary"
                                                onClick={() => setSelfie(null)}
                                            >
                                                <RefreshCw
                                                    size={18}
                                                    aria-hidden="true"
                                                />{" "}
                                                Chụp lại
                                            </button>
                                            <button
                                                className="button primary"
                                                onClick={() => {
                                                    setIssues([]);
                                                    setStep("review");
                                                }}
                                            >
                                                Tiếp tục
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <ul className="kyc-tips">
                                            <li>
                                                Nhìn thẳng, bỏ khẩu trang, kính
                                                râm và mũ.
                                            </li>
                                            <li>
                                                Ở nơi đủ sáng, chỉ có một mình
                                                bạn trong khung hình.
                                            </li>
                                        </ul>
                                        <p className="kyc-note">
                                            Ảnh chân dung cần được chụp bằng
                                            camera. Hệ thống chỉ đối chiếu ảnh
                                            tĩnh, không kiểm tra người thật trực
                                            tiếp; quản trị viên vẫn cần xem xét
                                            và có thể không xác minh được danh
                                            tính chỉ từ ảnh.
                                        </p>
                                        <SelfieCapture
                                            onCapture={(blob) =>
                                                void choose(
                                                    new File(
                                                        [blob],
                                                        "selfie.jpg",
                                                    ),
                                                    setSelfie,
                                                )
                                            }
                                        />
                                    </>
                                )}
                                <button
                                    className="plain-button"
                                    onClick={() => setStep("card")}
                                >
                                    Quay lại
                                </button>
                            </section>
                        )}

                        {step === "review" && (
                            <section className="kyc-panel">
                                <div className="kyc-review">
                                    {cardUrl && (
                                        <figure>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={cardUrl}
                                                alt="Mặt trước thẻ sinh viên"
                                            />
                                            <figcaption>
                                                Thẻ sinh viên
                                            </figcaption>
                                        </figure>
                                    )}
                                    {selfieUrl && (
                                        <figure>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={selfieUrl}
                                                alt="Ảnh chân dung"
                                            />
                                            <figcaption>Chân dung</figcaption>
                                        </figure>
                                    )}
                                </div>
                                <p className="small muted" role="status">
                                    {busy
                                        ? "Đang kiểm tra ảnh, thường mất 10–20 giây. Vui lòng không đóng cửa sổ."
                                        : "Kiểm tra ảnh đủ rõ rồi gửi. Bạn có thể quay lại để chụp lại."}
                                </p>
                                <div className="kyc-actions">
                                    <button
                                        className="button secondary"
                                        onClick={() => setStep("selfie")}
                                        disabled={busy}
                                    >
                                        Quay lại
                                    </button>
                                    <button
                                        className="button primary"
                                        onClick={send}
                                        disabled={
                                            busy || !agreed || !card || !selfie
                                        }
                                    >
                                        {busy
                                            ? "Đang kiểm tra…"
                                            : "Gửi xác thực"}
                                    </button>
                                </div>
                            </section>
                        )}
                    </>
                )}
            </div>
        </Dialog>
    );
}
