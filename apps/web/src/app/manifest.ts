import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "ReOwn — Đồ cũ, khởi đầu mới",
        short_name: "ReOwn",
        description: "Không gian trao đổi đồ đã qua sử dụng dành cho sinh viên.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
            { src: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/pwa-icon-512.png", sizes: "512x512", type: "image/png" },
        ],
    };
}
