"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw } from "lucide-react";

/** Captures a frame from the camera; never uploads by itself. */
export function CardCamera({
    onCapture,
    disabled = false,
}: {
    onCapture: (blob: Blob) => void;
    disabled?: boolean;
}) {
    const video = useRef<HTMLVideoElement>(null);
    const stream = useRef<MediaStream | null>(null);

    const generation = useRef(0);
    const [live, setLive] = useState(false);
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState("");

    const stop = useCallback(() => {
        generation.current += 1;
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        setLive(false);
    }, []);
    useEffect(
        () => () => {
            generation.current += 1;
            stream.current?.getTracks().forEach((track) => track.stop());
            stream.current = null;
        },
        [],
    );

    async function start() {
        setError("");
        if (!navigator.mediaDevices?.getUserMedia) {
            setError(
                "Trình duyệt không hỗ trợ camera ở đây. Hãy dùng trình duyệt hỗ trợ camera và kết nối an toàn.",
            );
            return;
        }
        setStarting(true);
        const request = ++generation.current;
        try {
            const media = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: "environment" },
                    width: { ideal: 1280 },
                    height: { ideal: 960 },
                },
                audio: false,
            });
            if (request !== generation.current) {
                media.getTracks().forEach((track) => track.stop());
                return;
            }
            stream.current = media;
            setLive(true);
            // The element mounts on the next render.
            requestAnimationFrame(() => {
                if (request !== generation.current || !video.current) return;
                video.current.srcObject = media;
                void video.current.play().catch(() => undefined);
            });
        } catch {
            if (request !== generation.current) return;
            setError(
                "Chưa mở được camera. Hãy kiểm tra quyền truy cập camera và thử lại.",
            );
        } finally {
            if (request === generation.current) setStarting(false);
        }
    }

    function capture() {
        const element = video.current;
        if (!element || !element.videoWidth) return;
        const canvas = document.createElement("canvas");
        canvas.width = element.videoWidth;
        canvas.height = element.videoHeight;
        const context = canvas.getContext("2d");
        if (!context) {
            setError("Không chụp được ảnh. Hãy thử lại.");
            return;
        }
        context.drawImage(element, 0, 0);
        const request = generation.current;
        canvas.toBlob(
            (blob) => {
                if (request !== generation.current) return;
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
        <div className="kyc-card-camera">
            <div className="kyc-viewport kyc-viewport-card" data-live={live}>
                {live ? (
                    <>
                        <video
                            ref={video}
                            playsInline
                            muted
                            aria-label="Xem trước camera sau"
                            className="kyc-video"
                        />
                        <span
                            className="kyc-card-camera-guide"
                            aria-hidden="true"
                        />
                    </>
                ) : (
                    <div className="kyc-placeholder">
                        <Camera size={28} aria-hidden="true" />
                        <span>Mặt trước thẻ, thấy đủ bốn góc</span>
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
                        <Camera size={18} aria-hidden="true" /> Chụp ảnh thẻ
                    </button>
                ) : (
                    <button
                        type="button"
                        className="button primary"
                        onClick={start}
                        disabled={disabled || starting}
                    >
                        <Camera size={18} aria-hidden="true" />
                        {starting ? "Đang mở camera…" : "Bật camera sau"}
                    </button>
                )}

                {live && (
                    <button
                        type="button"
                        className="plain-button"
                        onClick={stop}
                    >
                        <RefreshCw size={16} aria-hidden="true" /> Tắt camera
                    </button>
                )}
            </div>
        </div>
    );
}
