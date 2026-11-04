"use client";

import { useEffect } from "react";

export function PwaRegistration() {
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;

        // Waiting workers activate when existing app tabs close, without interrupting work.
        void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
            console.error("Service worker registration failed:", error);
        });
    }, []);

    return null;
}
