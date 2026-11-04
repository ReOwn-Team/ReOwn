"use client";

import { useEffect, useState } from "react";

type PushState = "loading" | "unsupported" | "disabled" | "enabled" | "blocked";

function applicationKey(value: string): Uint8Array<ArrayBuffer> {
    const padded = (value + "=".repeat((4 - (value.length % 4)) % 4))
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function request(method: "POST" | "DELETE", body: unknown) {
    const response = await fetch("/api/push", {
        method,
        headers: {
            "Content-Type": "application/json",
            "X-ReOwn-Client": "web",
        },
        body: JSON.stringify(body),
        credentials: "same-origin",
        cache: "no-store",
    });
    if (!response.ok)
        throw new Error(
            response.status === 409
                ? "Không thể đăng ký thiết bị này. Thiết bị có thể đã thuộc tài khoản khác hoặc đã đạt giới hạn thiết bị."
                : "Không thể cập nhật thông báo. Vui lòng thử lại.",
        );
}

export function PushSettings() {
    const [state, setState] = useState<PushState>("loading");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        let active = true;
        async function check() {
            if (
                !("serviceWorker" in navigator) ||
                !("PushManager" in window) ||
                !("Notification" in window) ||
                !window.isSecureContext
            ) {
                if (active) setState("unsupported");
                return;
            }
            if (Notification.permission === "denied") {
                if (active) setState("blocked");
                return;
            }
            // A browser subscription alone does not prove that this account owns it.
            if (active) setState("disabled");
        }
        void check();
        return () => {
            active = false;
        };
    }, []);

    async function enable() {
        setBusy(true);
        setMessage("");
        let created: PushSubscription | null = null;
        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                setState(permission === "denied" ? "blocked" : "disabled");
                return;
            }
            const config = await fetch("/api/push", { cache: "no-store" });
            const { publicKey } = (await config.json()) as {
                publicKey: string | null;
            };
            if (!config.ok || !publicKey)
                throw new Error("Thông báo chưa được cấu hình trên máy chủ.");
            const registration =
                await navigator.serviceWorker.register("/sw.js");
            await navigator.serviceWorker.ready;
            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: applicationKey(publicKey),
                });
                created = subscription;
            }
            const serialized = subscription.toJSON();
            if (!serialized.keys?.p256dh || !serialized.keys.auth)
                throw new Error(
                    "Không đọc được thông tin đăng ký thông báo trên thiết bị.",
                );
            await request("POST", {
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: serialized.keys.p256dh,
                    auth: serialized.keys.auth,
                },
            });
            setState("enabled");
            setMessage("Đã bật thông báo cho tài khoản này trên thiết bị.");
        } catch (error) {
            if (created) await created.unsubscribe().catch(() => false);
            setMessage(
                error instanceof Error
                    ? error.message
                    : "Không thể bật thông báo. Vui lòng thử lại.",
            );
        } finally {
            setBusy(false);
        }
    }

    async function disable() {
        setBusy(true);
        setMessage("");
        try {
            const registration =
                await navigator.serviceWorker.getRegistration("/");
            const subscription =
                await registration?.pushManager.getSubscription();
            if (subscription) {
                await request("DELETE", { endpoint: subscription.endpoint });
                await subscription.unsubscribe();
            }
            setState("disabled");
            setMessage("Đã tắt thông báo trên thiết bị này.");
        } catch {
            setMessage(
                "Không thể tắt thông báo. Vui lòng kiểm tra kết nối và thử lại.",
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="panel stack" aria-labelledby="push-title">
            <h2 id="push-title">Thông báo đẩy</h2>
            <p>
                Nhận thông báo khi tin đăng của bạn được quản trị viên cập nhật.
                Cài đặt áp dụng cho thiết bị và trình duyệt này. Trên thiết bị
                dùng chung, hãy tắt thông báo trước khi đăng xuất.
            </p>
            {state === "loading" ? (
                <p role="status">Đang kiểm tra hỗ trợ…</p>
            ) : state === "unsupported" ? (
                <p>
                    Thiết bị hoặc trình duyệt chưa hỗ trợ thông báo đẩy. Trên
                    iPhone/iPad, hãy thêm ReOwn vào màn hình chính rồi mở ứng
                    dụng để bật thông báo.
                </p>
            ) : state === "blocked" ? (
                <p>
                    Thông báo đang bị chặn. Hãy cho phép thông báo trong cài đặt
                    trình duyệt hoặc thiết bị.
                </p>
            ) : (
                <div className="action-row">
                    <button
                        className="button primary"
                        type="button"
                        disabled={busy}
                        onClick={() => void enable()}
                    >
                        {busy ? "Đang xử lý…" : "Bật thông báo"}
                    </button>
                    <button
                        className="button secondary"
                        type="button"
                        disabled={busy}
                        onClick={() => void disable()}
                    >
                        Tắt trên thiết bị này
                    </button>
                </div>
            )}
            {message && <p role="status">{message}</p>}
        </section>
    );
}
