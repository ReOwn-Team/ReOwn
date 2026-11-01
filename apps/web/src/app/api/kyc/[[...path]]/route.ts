import { NextRequest, NextResponse } from "next/server";
import { proxyWithSession } from "@/lib/auth/server/session";
import { SessionFailure } from "@/lib/auth/server/store";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type Context = { params: Promise<{ path?: string[] }> };

/** Maps an allowed public path to the upstream path, or null if not allowed. */
function upstreamPath(method: string, path: string[]): string | null {
  const [first, second, third, fourth] = path;
  if (first === "me" && path.length === 1)
    return method === "GET" || method === "DELETE" ? "/kyc/me" : null;
  if (first === "submissions" && path.length === 1)
    return method === "POST" ? "/kyc/submissions" : null;
  if (first !== "admin") return null;
  if (path.length === 1) return method === "GET" ? "/admin/kyc" : null;
  if (!uuid.test(second)) return null;
  if (path.length === 2) return method === "GET" ? `/admin/kyc/${second}` : null;
  if (path.length === 3 && third === "decision")
    return method === "POST" ? `/admin/kyc/${second}/decision` : null;
  if (
    path.length === 4 &&
    third === "assets" &&
    (fourth === "card_front" || fourth === "selfie")
  )
    return method === "GET" ? `/admin/kyc/${second}/assets/${fourth}` : null;
  return null;
}

async function route(request: NextRequest, context: Context) {
  const path = (await context.params).path ?? [];
  const method = request.method;
  const target = upstreamPath(method, path);
  if (!target) return NextResponse.json({}, { status: 404 });
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (cursor !== null && (path[0] !== "admin" || !uuid.test(cursor)))
    return NextResponse.json({}, { status: 400 });
  const url = `${process.env.API_INTERNAL_URL ?? "http://localhost:3000"}/api/v1${target}${cursor ? `?cursor=${cursor}` : ""}`;
  const limit =
    method === "POST" && path[0] === "submissions" ? 14 * 1024 * 1024 : 4096;
  let payload: Buffer | undefined;
  return proxyWithSession(request, async (session) => {
    if (method === "POST" && payload === undefined) {
      const chunks: Uint8Array[] = [];
      let length = 0;
      const reader = request.body?.getReader();
      if (!reader) throw new SessionFailure(400);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > limit) {
          await reader.cancel();
          throw new SessionFailure(413);
        }
        chunks.push(value);
      }
      payload = Buffer.concat(chunks);
    }
    return fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        ...(payload
          ? {
              "Content-Type":
                request.headers.get("content-type") ??
                "application/octet-stream",
            }
          : {}),
      },
      ...(payload ? { body: new Uint8Array(payload) } : {}),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(120000),
    });
  });
}
export const GET = route;
export const POST = route;
export const DELETE = route;
