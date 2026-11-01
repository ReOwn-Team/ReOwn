"use client";
import { useEffect, useId, useRef, useState } from "react";
type HcaptchaApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
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
        new Error("Không tải được hCaptcha. Kiểm tra kết nối và thử lại."),
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
  const puzzleId = `hcaptcha-puzzle-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const callbacks = useRef({ onVerify, onError });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    callbacks.current = { onVerify, onError };
  }, [onVerify, onError]);
  useEffect(() => {
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
          size: container.current.clientWidth < 303 ? "compact" : "normal",
          "challenge-container": puzzleId,
          callback: (token: string) => {
            if (!active || used || !token) return;
            used = true;
            callbacks.current.onVerify(token);
          },
          "error-callback": failure,
          "expired-callback": failure,
          "chalexpired-callback": failure,
        });
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
      if (widget !== undefined) {
        try {
          api?.remove(widget);
        } catch {}
      }
    };
  }, [puzzleId]);
  return (
    <div className="captcha-widget">
      {!loaded && (
        <p className="small muted" role="status">
          Đang tải hCaptcha…
        </p>
      )}
      <div ref={container} />
      <div id={puzzleId} className="captcha-puzzle" />
    </div>
  );
}
