"use client";
import { useEffect, useId, useRef, useState } from "react";
type HcaptchaApi = {
    render: (element: HTMLElement, options: Record<string, unknown>) => string;
    remove: (id: string) => void;
    reset: (id: string) => void;
};
declare global {
    interface Window {
        hcaptcha?: HcaptchaApi;
        __reownHcaptchaReady?: () => void;
    }
}
let loading: Promise<HcaptchaApi> | undefined;
let ready = false;
function loadApi(): Promise<HcaptchaApi> {
    if (ready && window.hcaptcha) return Promise.resolve(window.hcaptcha);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        let settled = false;
        const fail = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            script.remove();
            loading = undefined;
            reject(
                new Error(
                    "Không tải được hCaptcha. Kiểm tra kết nối và thử lại.",
                ),
            );
        };
        const timer = setTimeout(fail, 15000);
        window.__reownHcaptchaReady = () => {
            if (settled) return;
            if (!window.hcaptcha) {
                fail();
                return;
            }
            settled = true;
            clearTimeout(timer);
            ready = true;
            resolve(window.hcaptcha);
        };
        script.src =
            "https://js.hcaptcha.com/1/api.js?onload=__reownHcaptchaReady&render=explicit&recaptchacompat=off&hl=vi";
        script.async = true;
        script.defer = true;
        script.onerror = fail;
        document.head.appendChild(script);
    });
    return loading;
}
export function Hcaptcha({
    onVerify,
    onError,
}: {
    onVerify: (token: string) => void;
    onError: (message: string) => void;
}) {
    const container = useRef<HTMLDivElement>(null);
    const challengeDialog = useRef<HTMLDialogElement>(null);
    const widgetRef = useRef<{ api: HcaptchaApi; id: string } | null>(null);
    const puzzleId = `hcaptcha-puzzle-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const callbacks = useRef({ onVerify, onError });
    const [loaded, setLoaded] = useState(false);
    const [challengeOpen, setChallengeOpen] = useState(false);
    useEffect(() => {
        callbacks.current = { onVerify, onError };
    }, [onVerify, onError]);
    useEffect(() => {
        const dialog = challengeDialog.current;
        let active = true,
            used = false;
        let widget: string | undefined;
        let api: HcaptchaApi | undefined;
        const failure = () => {
            if (active && !used)
                callbacks.current.onError(
                    "Không hoàn tất được hCaptcha. Vui lòng thử lại.",
                );
        };
        const sitekey = process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY;
        if (!sitekey) {
            callbacks.current.onError("hCaptcha chưa được cấu hình.");
            return;
        }
        void loadApi()
            .then((value) => {
                if (!active || !container.current) return;
                api = value;
                widget = api.render(container.current, {
                    sitekey,
                    hl: "vi",
                    theme: "light",
                    size:
                        container.current.clientWidth < 303
                            ? "compact"
                            : "normal",
                    "challenge-container": puzzleId,
                    "open-callback": () => {
                        if (!active) return;
                        const dialog = challengeDialog.current;
                        if (dialog && !dialog.open) dialog.showModal();
                        setChallengeOpen(true);
                    },
                    "close-callback": () => {
                        if (!active) return;
                        if (challengeDialog.current?.open) challengeDialog.current.close();
                        setChallengeOpen(false);
                    },
                    callback: (token: string) => {
                        if (!active || used || !token) return;
                        used = true;
                        callbacks.current.onVerify(token);
                    },
                    "error-callback": failure,
                    "expired-callback": failure,
                    "chalexpired-callback": failure,
                });
                widgetRef.current = { api, id: widget };
                setLoaded(true);
            })
            .catch(() => {
                if (active)
                    callbacks.current.onError(
                        "Không tải được hCaptcha. Kiểm tra kết nối và thử lại.",
                    );
            });
        return () => {
            active = false;
            widgetRef.current = null;
            if (dialog?.open) dialog.close();
            if (widget !== undefined) {
                try {
                    api?.remove(widget);
                } catch {}
            }
        };
    }, [puzzleId]);
    function closeChallenge() {
        const widget = widgetRef.current;
        if (widget) widget.api.reset(widget.id);
        if (challengeDialog.current?.open) challengeDialog.current.close();
        setChallengeOpen(false);
    }
    return (
        <div className="captcha-widget">
            {!loaded && (
                <p className="small muted" role="status">
                    Đang tải hCaptcha…
                </p>
            )}
            <div ref={container} />
            <dialog
                ref={challengeDialog}
                className="captcha-challenge-dialog"
                aria-label="Thử thách hCaptcha"
                onCancel={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    closeChallenge();
                }}
            >
                <button type="button" className="captcha-challenge-close" onClick={closeChallenge}>
                    Đóng thử thách
                </button>
                {challengeOpen && (
                    <p className="captcha-scroll-hint">
                        Nếu nội dung bị khuất, vuốt ngang để xem đầy đủ.
                    </p>
                )}
                <div
                    id={puzzleId}
                    className="captcha-puzzle"
                    role={challengeOpen ? "region" : undefined}
                    aria-label={challengeOpen ? "Thử thách xác minh, cuộn ngang nếu cần" : undefined}
                    tabIndex={challengeOpen ? 0 : undefined}
                />
            </dialog>
        </div>
    );
}
