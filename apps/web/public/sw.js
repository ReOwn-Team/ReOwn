/* Only this public, static fallback is stored; application responses are never cached. */
const OFFLINE_CACHE = "reown-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_URL)),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter(
                            (key) =>
                                key.startsWith("reown-offline-") &&
                                key !== OFFLINE_CACHE,
                        )
                        .map((key) => caches.delete(key)),
                ),
            ),
    );
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (
        event.request.method !== "GET" ||
        event.request.mode !== "navigate" ||
        url.origin !== self.location.origin ||
        url.pathname === "/api" ||
        url.pathname.startsWith("/api/")
    )
        return;

    event.respondWith(
        fetch(event.request).catch(async () => {
            const fallback = await caches.match(OFFLINE_URL, {
                cacheName: OFFLINE_CACHE,
            });
            return fallback || Response.error();
        }),
    );
});

function safeDestination(value) {
    try {
        if (typeof value !== "string") return self.location.origin + "/";
        const url = new URL(value, self.location.origin);
        if (url.origin !== self.location.origin || url.username || url.password)
            throw new Error("Invalid destination");
        return url.href;
    } catch {
        return self.location.origin + "/";
    }
}

self.addEventListener("push", (event) => {
    let payload;
    try {
        payload = event.data ? event.data.json() : null;
    } catch {
        payload = null;
    }
    const url = safeDestination(payload && payload.url);
    event.waitUntil(
        self.registration.showNotification("ReOwn", {
            body: "Tin đăng của bạn có cập nhật. Mở ReOwn để xem.",
            icon: "/pwa-icon-192.png",
            data: { url },
            actions: [
                { action: "open", title: "Mở ReOwn" },
                { action: "dismiss", title: "Đóng" },
            ],
        }),
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    if (event.action === "dismiss") return;
    const destination = safeDestination(
        event.notification.data && event.notification.data.url,
    );
    event.waitUntil(
        self.clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then((clients) => {
                const existing = clients.find(
                    (client) => client.url === destination && "focus" in client,
                );
                return existing
                    ? existing.focus()
                    : self.clients.openWindow(destination);
            }),
    );
});
