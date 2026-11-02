import { NextRequest, NextResponse } from "next/server";
import { proxyWithSession } from "@/lib/auth/server/session";
import { SessionFailure } from "@/lib/auth/server/store";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type Context = { params: Promise<{ path?: string[] }> };

async function route(request: NextRequest, context: Context) {
    const path = (await context.params).path ?? [];
    const [id, action, imageId] = path;
    const isImage =
        path.length === 3 &&
        uuid.test(id) &&
        (action === "images" || action === "originals") &&
        uuid.test(imageId);
    const allowed =
        request.method === "GET"
            ? path.length === 0 ||
              (path.length === 1 && uuid.test(id)) ||
              isImage
            : request.method === "POST" &&
              path.length === 2 &&
              uuid.test(id) &&
              (action === "decision" || action === "edits");
    if (!allowed)
        return NextResponse.json(
            {},
            { status: 404, headers: { "Cache-Control": "no-store" } },
        );
    const cursor = request.nextUrl.searchParams.get("cursor");
    if (cursor !== null && (path.length !== 0 || !uuid.test(cursor)))
        return NextResponse.json(
            {},
            { status: 400, headers: { "Cache-Control": "no-store" } },
        );
    const url = `${process.env.API_INTERNAL_URL ?? "http://localhost:3000"}/api/v1/admin/product-reviews${path.length ? `/${path.join("/")}` : ""}${cursor ? `?cursor=${cursor}` : ""}`;
    let payload: Buffer | undefined;
    let imageMime = "application/octet-stream";
    const result = await proxyWithSession(request, async (session) => {
        if (request.method === "POST" && payload === undefined) {
            const reader = request.body?.getReader();
            if (!reader) throw new SessionFailure(400);
            const chunks: Uint8Array[] = [];
            let length = 0;
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                length += value.length;
                if (length > 16384) {
                    await reader.cancel();
                    throw new SessionFailure(413);
                }
                chunks.push(value);
            }
            payload = Buffer.concat(chunks);
        }
        const response = await fetch(url, {
            method: request.method,
            headers: {
                Authorization: `Bearer ${session.accessToken}`,
                ...(payload ? { "Content-Type": "application/json" } : {}),
            },
            ...(payload ? { body: new Uint8Array(payload) } : {}),
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(30000),
        });
        if (isImage && response.ok) {
            const mime = response.headers
                .get("content-type")
                ?.split(";")[0]
                .toLowerCase();
            imageMime =
                mime &&
                [
                    "image/webp",
                    "image/jpeg",
                    "image/png",
                    "image/heic",
                    "image/heif",
                ].includes(mime)
                    ? mime
                    : "application/octet-stream";
        }
        return response;
    });
    if (isImage && result.ok) {
        result.headers.set("Content-Type", imageMime);
        result.headers.set("X-Content-Type-Options", "nosniff");
        result.headers.set(
            "Content-Disposition",
            action === "originals" ? "attachment" : "inline",
        );
    }
    return result;
}
export const GET = route;
export const POST = route;
