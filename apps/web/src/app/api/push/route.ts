import { NextRequest, NextResponse } from "next/server";
import { proxyWithSession } from "@/lib/auth/server/session";

export function GET() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    return NextResponse.json(
        {
            publicKey:
                publicKey && /^[A-Za-z0-9_-]{87}$/.test(publicKey)
                    ? publicKey
                    : null,
        },
        { headers: { "Cache-Control": "private, no-store" } },
    );
}

async function forward(request: NextRequest) {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 4096) return NextResponse.json({}, { status: 413 });
    let body: string;
    try {
        const reader = request.body?.getReader();
        if (!reader) return NextResponse.json({}, { status: 400 });
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 4096) {
                await reader.cancel();
                return NextResponse.json({}, { status: 413 });
            }
            chunks.push(value);
        }
        body = Buffer.concat(chunks).toString("utf8");
        JSON.parse(body);
    } catch {
        return NextResponse.json({}, { status: 400 });
    }
    const base = (
        process.env.API_INTERNAL_URL ?? "http://localhost:3000"
    ).replace(/\/+$/, "");
    return proxyWithSession(request, (session) =>
        fetch(`${base}/api/v1/push/subscriptions`, {
            method: request.method,
            headers: {
                Authorization: `Bearer ${session.accessToken}`,
                "Content-Type": "application/json",
            },
            body,
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(8000),
        }),
    );
}
export const POST = forward;
export const DELETE = forward;
