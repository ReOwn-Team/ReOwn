"use client";
import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type FormEvent,
} from "react";
import Image from "next/image";
import { Hcaptcha } from "@/features/auth/components/hcaptcha";

import { Eye, EyeOff } from "lucide-react";
import { useMock } from "@/mocks/store";
import type { OtpChallenge } from "@/lib/auth/profile";
import { authSession } from "@/lib/auth/session";
import { AuthError, errorMessage } from "@/lib/auth/errors";
import { Dialog } from "@/components/ui/dialog";

export function AuthOverlay() {
    const { authOpen, setAuthOpen, finishAuth } = useMock();
    if (!authOpen) return null;
    return (
        <AuthForm onClose={() => setAuthOpen(false)} onFinish={finishAuth} />
    );
}
function normalizePhone(value: string) {
    const compact = value.trim().replace(/\s/g, "");
    return /^0\d{9}$/.test(compact) ? `+84${compact.slice(1)}` : compact;
}
function AuthForm({
    onClose,
    onFinish,
}: {
    onClose: () => void;
    onFinish: () => void;
}) {
    const [view, setView] = useState<"login" | "register" | "forgot">("login");
    const authLayout = useRef<HTMLDivElement>(null);
    const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
    useLayoutEffect(() => {
        // A taller form must start at its tabs, even after native focus scrolling.
        if (authLayout.current) authLayout.current.scrollTop = 0;
    }, [view, challenge]);
    const [code, setCode] = useState("");
    const [resendIn, setResendIn] = useState(0);
    const [resendAt, setResendAt] = useState(0);
    const [expiresAt, setExpiresAt] = useState(0);
    const [remaining, setRemaining] = useState(0);
    const [otpAction, setOtpAction] = useState<"verify" | "resend" | null>(
        null,
    );
    const [otpAccepted, setOtpAccepted] = useState(false);
    const verifying = useRef(false);
    const successTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );
    useEffect(() => () => clearTimeout(successTimer.current), []);
    useEffect(() => {
        if (!challenge) return;
        const timer = setInterval(() => {
            setResendIn(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
            setRemaining(
                Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
            );
        }, 1000);
        return () => clearInterval(timer);
    }, [challenge, expiresAt, resendAt]);
    function acceptChallenge(value: OtpChallenge) {
        setChallenge(value);
        setCode("");
        setResendIn(value.resendAfter);
        setResendAt(Date.now() + value.resendAfter * 1000);
        setExpiresAt(Date.now() + value.expiresIn * 1000);
        setRemaining(value.expiresIn);
    }
    const [identifier, setIdentifier] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [show, setShow] = useState(false);
    const [name, setName] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [requestError, setRequestError] = useState("");
    const [busy, setBusy] = useState(false);
    const [captchaVisible, setCaptchaVisible] = useState(false);
    const submitting = useRef(false);
    const [cooldown, setCooldown] = useState(0);
    useEffect(() => {
        if (!cooldown) return;
        const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);
    function changeView(next: typeof view) {
        clearTimeout(successTimer.current);
        verifying.current = false;
        setOtpAccepted(false);
        setCaptchaVisible(false);
        setView(next);
        setChallenge(null);
        setCode("");
        setErrors({});
        setRequestError("");
    }
    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (busy || captchaVisible || cooldown > 0) return;
        const next: Record<string, string> = {};
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phonePattern = /^\+[1-9]\d{7,14}$/;
        if (view === "login") {
            if (
                !emailPattern.test(identifier.trim()) &&
                !phonePattern.test(normalizePhone(identifier))
            )
                next.identifier = "Nhập email hoặc số điện thoại hợp lệ.";
            if (!password || password.length > 128)
                next.password = "Nhập mật khẩu từ 1 đến 128 ký tự.";
        } else {
            if (!name.trim() || name.trim().length > 100)
                next.displayName = "Nhập tên từ 1 đến 100 ký tự.";
            if (!emailPattern.test(email.trim()) || email.trim().length > 254)
                next.email = "Nhập email hợp lệ, tối đa 254 ký tự.";
            if (!phonePattern.test(normalizePhone(phone)))
                next.phone = "Nhập số điện thoại quốc tế, ví dụ +84901234567.";
            if (password.length < 12 || password.length > 128)
                next.password = "Mật khẩu cần từ 12 đến 128 ký tự.";
        }
        setErrors(next);
        setRequestError("");
        if (Object.keys(next).length) {
            (
                e.currentTarget.elements.namedItem(
                    Object.keys(next)[0],
                ) as HTMLElement
            )?.focus();
            return;
        }
        setCaptchaVisible(true);
    }
    async function completeCaptcha(token: string) {
        if (submitting.current) return;
        submitting.current = true;
        setCaptchaVisible(false);
        setBusy(true);
        try {
            const result =
                view === "login"
                    ? await authSession.login(
                          {
                              identifier: identifier.includes("@")
                                  ? identifier.trim().toLowerCase()
                                  : normalizePhone(identifier),
                              password,
                          },
                          token,
                      )
                    : await authSession.register(
                          {
                              displayName: name.trim(),
                              email: email.trim().toLowerCase(),
                              phone: normalizePhone(phone),
                              password,
                          },
                          token,
                      );
            setPassword("");
            acceptChallenge(result);
        } catch (error) {
            if (error instanceof AuthError) {
                setErrors(error.fields);
                if (error.retryAfter) setCooldown(error.retryAfter);
            }
            setRequestError(errorMessage(error));
        } finally {
            submitting.current = false;
            setBusy(false);
        }
    }
    async function verifyCode(event?: FormEvent, nextCode = code) {
        event?.preventDefault();
        if (
            !challenge ||
            busy ||
            cooldown > 0 ||
            remaining === 0 ||
            otpAccepted ||
            verifying.current
        )
            return;
        if (!/^\d{6}$/.test(nextCode)) {
            if (event) setRequestError("Nhập đủ mã xác nhận gồm 6 chữ số.");
            return;
        }
        verifying.current = true;
        setBusy(true);
        setOtpAction("verify");
        setRequestError("");
        try {
            await authSession.verifyOtp(challenge.challengeId, nextCode);
            setOtpAccepted(true);
            const reduce = window.matchMedia(
                "(prefers-reduced-motion: reduce)",
            ).matches;
            successTimer.current = setTimeout(onFinish, reduce ? 280 : 720);
        } catch (error) {
            verifying.current = false;
            if (error instanceof AuthError && error.retryAfter)
                setCooldown(error.retryAfter);
            setRequestError(errorMessage(error));
            setBusy(false);
            setOtpAction(null);
        }
    }
    async function resendCode() {
        if (!challenge || busy || resendIn > 0) return;
        setBusy(true);
        setOtpAction("resend");
        setRequestError("");
        try {
            acceptChallenge(await authSession.resendOtp(challenge.challengeId));
        } catch (error) {
            if (error instanceof AuthError && error.retryAfter) {
                setResendIn(error.retryAfter);
                setResendAt(Date.now() + error.retryAfter * 1000);
            }
            setRequestError(errorMessage(error));
        } finally {
            setBusy(false);
            setOtpAction(null);
        }
    }
    function fieldError(key: string) {
        return errors[key] ? (
            <p className="error" id={`auth-${key}-error`} role="alert">
                {errors[key]}
            </p>
        ) : null;
    }
    return (
        <Dialog
            title={
                challenge
                    ? "Xác nhận email"
                    : view === "register"
                      ? "Đăng ký"
                      : view === "forgot"
                        ? "Quên mật khẩu?"
                        : "Đăng nhập"
            }
            onClose={onClose}
            wide
            className="auth-dialog"
        >
            <div
                className={`auth-layout auth-view-${view}${challenge ? " is-otp" : ""}`}
                ref={authLayout}
            >
                <div className="auth-body">
                    {challenge ? (
                        <header className="otp-hero">
                            <Image
                                className="otp-logo"
                                src="/logo.png"
                                alt="ReOwn"
                                width={164}
                                height={55}
                                priority
                            />
                            <h2>
                                Xác nhận{" "}
                                {view === "register" ? "đăng ký" : "đăng nhập"}
                            </h2>
                            <p>
                                Nhập mã 6 chữ số đã gửi đến{" "}
                                {challenge.emailHint}.
                            </p>
                        </header>
                    ) : view !== "forgot" ? (
                        <div
                            className="auth-tabs"
                            role="group"
                            aria-label="Đăng nhập hoặc đăng ký"
                        >
                            <button
                                disabled={busy}
                                aria-pressed={view === "login"}
                                onClick={() => changeView("login")}
                            >
                                Đăng nhập
                            </button>
                            <button
                                disabled={busy}
                                aria-pressed={view === "register"}
                                onClick={() => changeView("register")}
                            >
                                Đăng ký
                            </button>
                        </div>
                    ) : (
                        <h2>Quên mật khẩu?</h2>
                    )}
                    {!challenge && (
                        <p className="muted">
                            {view === "login"
                                ? "Đăng nhập để theo dõi đơn hàng và tiếp tục mua, bán trên ReOwn."
                                : view === "register"
                                  ? "Tạo tài khoản ReOwn với email và số điện thoại của bạn."
                                  : "Khôi phục mật khẩu chưa khả dụng vì API hiện chưa hỗ trợ chức năng này."}
                        </p>
                    )}
                    {challenge ? (
                        <form
                            className={`stack otp-form${otpAccepted ? " is-accepted" : ""}`}
                            noValidate
                            onSubmit={verifyCode}
                            aria-busy={busy}
                        >
                            <div className="field otp-field">
                                <label htmlFor="auth-otp">Mã xác nhận</label>
                                <div
                                    className={`otp-slots${otpAccepted ? " is-accepted" : requestError ? " is-invalid" : ""}${!otpAccepted && remaining === 0 ? " is-expired" : ""}`}
                                >
                                    {Array.from({ length: 6 }, (_, index) => (
                                        <span
                                            key={index}
                                            className={
                                                index < code.length
                                                    ? "otp-slot is-filled"
                                                    : index === code.length
                                                      ? "otp-slot is-current"
                                                      : "otp-slot"
                                            }
                                            aria-hidden="true"
                                        >
                                            {code[index] ?? ""}
                                        </span>
                                    ))}
                                    <input
                                        id="auth-otp"
                                        name="code"
                                        className="otp-capture"
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        autoCapitalize="off"
                                        autoCorrect="off"
                                        spellCheck={false}
                                        maxLength={6}
                                        value={code}
                                        onChange={(event) => {
                                            const next = event.target.value
                                                .replace(/\D/g, "")
                                                .slice(0, 6);
                                            setCode(next);
                                            if (requestError)
                                                setRequestError("");
                                            if (next.length === 6)
                                                void verifyCode(
                                                    undefined,
                                                    next,
                                                );
                                        }}
                                        disabled={
                                            busy ||
                                            remaining === 0 ||
                                            otpAccepted
                                        }
                                        autoFocus
                                        aria-invalid={!!requestError}
                                        aria-describedby={
                                            requestError
                                                ? "auth-otp-error"
                                                : "auth-otp-expiry"
                                        }
                                    />
                                </div>
                                <p
                                    className={`otp-expiry${otpAccepted ? " is-accepted" : ""}`}
                                    id="auth-otp-expiry"
                                    role={otpAccepted ? "status" : undefined}
                                >
                                    {otpAccepted
                                        ? "Đã xác nhận."
                                        : remaining > 0
                                          ? `Mã còn hiệu lực ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}.`
                                          : "Mã đã hết hạn. Quay lại để yêu cầu mã mới."}
                                </p>
                            </div>
                            {requestError && (
                                <p
                                    className="error"
                                    id="auth-otp-error"
                                    role="alert"
                                >
                                    {requestError}
                                </p>
                            )}
                            <button
                                className="button primary full"
                                type="submit"
                                disabled={
                                    busy ||
                                    cooldown > 0 ||
                                    remaining === 0 ||
                                    otpAccepted
                                }
                            >
                                {otpAccepted
                                    ? "Đã xác nhận"
                                    : otpAction === "verify"
                                      ? "Đang xác nhận…"
                                      : cooldown > 0
                                        ? `Thử lại sau ${cooldown}s`
                                        : "Xác nhận"}
                            </button>
                            <div className="otp-actions">
                                <button
                                    type="button"
                                    className="text-link"
                                    disabled={
                                        busy || resendIn > 0 || remaining === 0
                                    }
                                    onClick={() => {
                                        void resendCode();
                                    }}
                                >
                                    {otpAction === "resend"
                                        ? "Đang gửi…"
                                        : resendIn > 0
                                          ? `Gửi lại sau ${resendIn}s`
                                          : "Gửi lại mã"}
                                </button>
                                <button
                                    type="button"
                                    className="text-link"
                                    disabled={busy}
                                    onClick={() => changeView(view)}
                                >
                                    Quay lại
                                </button>
                            </div>
                            <p className="small muted">
                                Không thấy email? Kiểm tra thư rác. Không chia
                                sẻ mã xác nhận với bất kỳ ai.
                            </p>
                        </form>
                    ) : view === "forgot" ? (
                        <button
                            className="button secondary"
                            onClick={() => changeView("login")}
                        >
                            Quay lại đăng nhập
                        </button>
                    ) : (
                        <form
                            className="stack"
                            noValidate
                            onSubmit={submit}
                            aria-busy={busy}
                        >
                            {view === "register" && (
                                <>
                                    {[
                                        {
                                            key: "displayName",
                                            label: "Họ và tên",
                                            value: name,
                                            set: setName,
                                            auto: "name",
                                            type: "text",
                                        },
                                        {
                                            key: "email",
                                            label: "Email",
                                            value: email,
                                            set: setEmail,
                                            auto: "email",
                                            type: "email",
                                        },
                                        {
                                            key: "phone",
                                            label: "Số điện thoại",
                                            value: phone,
                                            set: setPhone,
                                            auto: "tel",
                                            type: "tel",
                                        },
                                    ].map((field) => (
                                        <div className="field" key={field.key}>
                                            <label
                                                htmlFor={`auth-${field.key}`}
                                            >
                                                {field.label}
                                            </label>
                                            <input
                                                id={`auth-${field.key}`}
                                                name={field.key}
                                                type={field.type}
                                                autoComplete={field.auto}
                                                value={field.value}
                                                disabled={
                                                    busy || captchaVisible
                                                }
                                                onChange={(e) =>
                                                    field.set(e.target.value)
                                                }
                                                aria-invalid={
                                                    !!errors[field.key]
                                                }
                                                aria-describedby={
                                                    errors[field.key]
                                                        ? `auth-${field.key}-error`
                                                        : undefined
                                                }
                                            />
                                            {fieldError(field.key)}
                                        </div>
                                    ))}
                                    <p className="small muted">
                                        Dùng số điện thoại của bạn, ví dụ
                                        0901234567.
                                    </p>
                                </>
                            )}
                            {view === "login" && (
                                <div className="field">
                                    <label htmlFor="auth-id">
                                        Email hoặc số điện thoại
                                    </label>
                                    <input
                                        id="auth-id"
                                        name="identifier"
                                        autoComplete="username"
                                        value={identifier}
                                        disabled={busy || captchaVisible}
                                        onChange={(e) =>
                                            setIdentifier(e.target.value)
                                        }
                                        placeholder="ban@example.com"
                                        aria-invalid={!!errors.identifier}
                                        aria-describedby={
                                            errors.identifier
                                                ? "auth-identifier-error"
                                                : undefined
                                        }
                                    />
                                    {fieldError("identifier")}
                                </div>
                            )}
                            <div className="field">
                                <label htmlFor="auth-password">Mật khẩu</label>
                                <div className="password-control">
                                    <input
                                        id="auth-password"
                                        name="password"
                                        type={show ? "text" : "password"}
                                        autoComplete={
                                            view === "register"
                                                ? "new-password"
                                                : "current-password"
                                        }
                                        value={password}
                                        disabled={busy || captchaVisible}
                                        onChange={(e) =>
                                            setPassword(e.target.value)
                                        }
                                        aria-invalid={!!errors.password}
                                        aria-describedby={
                                            errors.password
                                                ? "auth-password-error"
                                                : undefined
                                        }
                                    />
                                    <button
                                        type="button"
                                        aria-label={
                                            show
                                                ? "Ẩn mật khẩu"
                                                : "Hiện mật khẩu"
                                        }
                                        onClick={() => setShow(!show)}
                                    >
                                        {show ? (
                                            <EyeOff size={19} />
                                        ) : (
                                            <Eye size={19} />
                                        )}
                                    </button>
                                </div>
                                {fieldError("password")}
                                {view === "register" && (
                                    <p className="small muted">
                                        Từ 12 đến 128 ký tự.
                                    </p>
                                )}
                            </div>
                            {view === "login" && (
                                <button
                                    className="auth-link forgot-link"
                                    type="button"
                                    disabled={busy || captchaVisible}
                                    onClick={() => changeView("forgot")}
                                >
                                    Quên mật khẩu?
                                </button>
                            )}
                            {requestError && (
                                <p className="error" role="alert">
                                    {requestError}
                                </p>
                            )}
                            <button
                                className="button primary full"
                                type="submit"
                                disabled={
                                    busy || captchaVisible || cooldown > 0
                                }
                            >
                                {captchaVisible
                                    ? "Hoàn tất xác minh hCaptcha"
                                    : cooldown > 0
                                      ? `Thử lại sau ${cooldown}s`
                                      : busy
                                        ? view === "login"
                                            ? "Đang đăng nhập…"
                                            : "Đang tạo tài khoản…"
                                        : view === "login"
                                          ? "Đăng nhập"
                                          : "Đăng ký"}
                            </button>
                        </form>
                    )}
                    <p className="auth-demo">
                        Mật khẩu được bảo mật và không lưu trên trình duyệt.
                    </p>
                </div>
                <aside className="auth-visual" aria-label="Mua bán cùng ReOwn">
                    <strong className="auth-brand">ReOwn</strong>
                    <h2>
                        Đồ cũ.
                        <br />
                        Khởi đầu mới.
                    </h2>
                    <p>Tìm món đồ bạn cần. Trao tiếp món đồ bạn yêu.</p>
                    <div className="auth-illustration">
                        <Image
                            src="/figma/assets/5ed95.svg"
                            alt=""
                            width={230}
                            height={230}
                            className="auth-circle"
                        />
                        <div className="auth-sample-card">
                            <Image
                                src="/figma/laptop.png"
                                alt="Laptop học tập"
                                width={240}
                                height={160}
                            />
                            <span>Laptop học tập</span>
                            <strong>1.000.000₫</strong>
                        </div>
                        <span className="auth-sticker">
                            <small>Món mới mỗi ngày</small>
                            <b>Thêm giá trị.</b>
                        </span>
                    </div>
                    <p className="small muted">Mua thông minh · Bán dễ dàng</p>
                </aside>
            </div>
            {captchaVisible && (
                <Dialog
                    title="Xác minh bảo mật"
                    className="captcha-dialog"
                    onClose={() => setCaptchaVisible(false)}
                >
                    <Hcaptcha
                        onVerify={completeCaptcha}
                        onError={(message) => {
                            setCaptchaVisible(false);
                            setRequestError(message);
                        }}
                    />
                </Dialog>
            )}
        </Dialog>
    );
}
