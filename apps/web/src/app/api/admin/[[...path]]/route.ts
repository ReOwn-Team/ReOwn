import { NextRequest, NextResponse } from "next/server";
import { proxyWithSession } from "@/lib/auth/server/session";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type Context = { params: Promise<{ path?: string[] }> };

export async function GET(request: NextRequest, context: Context) {
    const path = (await context.params).path ?? [];
    const isStatistics = path.length === 1 && path[0] === "statistics";
    const isUsersList = path.length === 1 && path[0] === "users";
    const isUserDetail =
        path.length === 2 && path[0] === "users" && uuid.test(path[1]);
    if (!isStatistics && !isUsersList && !isUserDetail)
        return NextResponse.json({}, { status: 404 });

    const query = new URLSearchParams();
    for (const [key, value] of request.nextUrl.searchParams) {
        if (
            !isUsersList ||
            !["cursor", "limit", "search"].includes(key) ||
            query.has(key)
        )
            return NextResponse.json({}, { status: 400 });
        if (key === "cursor" && !uuid.test(value))
            return NextResponse.json({}, { status: 400 });
        if (
            key === "limit" &&
            (!/^[1-9]\d*$/.test(value) || Number(value) > 100)
        )
            return NextResponse.json({}, { status: 400 });
        if (
            key === "search" &&
            (value.trim().length === 0 || value.trim().length > 100)
        )
            return NextResponse.json({}, { status: 400 });
        query.set(key, value);
    }

    const url = new URL(
        `${process.env.API_INTERNAL_URL ?? "http://localhost:3000"}/api/v1/admin/${path.join("/")}`,
    );
    url.search = query.toString();
    return proxyWithSession(request, (session) =>
        fetch(url, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(15000),
        }),
    );
}
