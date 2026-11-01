"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, Upload } from "lucide-react";

/** Live selfie capture with a file fallback. Never uploads by itself. */
export function SelfieCapture({
  onCapture,
  disabled = false,
}: {
  onCapture: (blob: Blob) => void;
  disabled?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setLive(false);
  }, []);
  useEffect(() => stop, [stop]);

  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Trình duyệt không bật được camera ở đây. Hãy chọn ảnh chân dung bên dưới.",
      );
      return;
    }
    setStarting(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      stream.current = media;
      setLive(true);
      // The element mounts on the next render.
      requestAnimationFrame(() => {
        if (!video.current) return;
        video.current.srcObject = media;
        void video.current.play().catch(() => undefined);
      });
    } catch {
      setError(
        "Chưa mở được camera. Hãy cho phép truy cập camera hoặc chọn ảnh chân dung bên dưới.",
      );
    } finally {
      setStarting(false);
    }
  }

  function capture() {
    const element = video.current;
    if (!element || !element.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    canvas.getContext("2d")?.drawImage(element, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Không chụp được ảnh. Hãy thử lại.");
          return;
        }
        stop();
        onCapture(blob);
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div className="kyc-selfie">
      <div className="kyc-viewport kyc-viewport-selfie" data-live={live}>
        {live ? (
          <>
            <video
              ref={video}
              playsInline
              muted
              aria-label="Xem trước camera"
              className="kyc-video"
            />
            <span className="kyc-oval" aria-hidden="true" />
          </>
        ) : (
          <div className="kyc-placeholder">
            <Camera size={28} aria-hidden="true" />
            <span>Camera trước sẽ hiện ở đây</span>
          </div>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="kyc-actions">
        {live ? (
          <button
            type="button"
            className="button primary"
            onClick={capture}
            disabled={disabled}
          >
            <Camera size={18} aria-hidden="true" /> Chụp ảnh
          </button>
        ) : (
          <button
            type="button"
            className="button primary"
            onClick={start}
            disabled={disabled || starting}
          >
            <Camera size={18} aria-hidden="true" />
            {starting ? "Đang mở camera…" : "Bật camera"}
          </button>
        )}
        <button
          type="button"
          className="button secondary"
          onClick={() => picker.current?.click()}
          disabled={disabled}
        >
          <Upload size={18} aria-hidden="true" /> Chọn ảnh có sẵn
        </button>
        {live && (
          <button type="button" className="plain-button" onClick={stop}>
            <RefreshCw size={16} aria-hidden="true" /> Tắt camera
          </button>
        )}
      </div>
      <input
        ref={picker}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="user"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onCapture(file);
        }}
      />
    </div>
  );
}
