import { NextRequest, NextResponse } from "next/server";
import { proxyWithSession } from "@/lib/auth/server/session";
import { SessionFailure } from "@/lib/auth/server/store";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type Context = { params: Promise<{ path?: string[] }> };
async function route(request: NextRequest, context: Context) {
  const path = (await context.params).path ?? [];
  const method = request.method;
  const allowed =
    method === "GET"
      ? path.length === 0 ||
        (path.length === 1 && (path[0] === "mine" || uuid.test(path[0]))) ||
        (path.length === 2 && path[0] === "mine" && uuid.test(path[1])) ||
        (path.length === 3 &&
          path[0] === "mine" &&
          uuid.test(path[1]) &&
          path[2] === "inspection") ||
        (path.length === 4 &&
          path[0] === "mine" &&
          uuid.test(path[1]) &&
          path[2] === "images" &&
          uuid.test(path[3]))
      : method === "POST"
        ? path.length === 0
        : method === "PUT"
          ? path.length === 1 && uuid.test(path[0])
          : method === "DELETE"
            ? path.length === 1 && uuid.test(path[0])
            : method === "PATCH" &&
              path.length === 2 &&
              uuid.test(path[0]) &&
              path[1] === "status";
  if (!allowed) return NextResponse.json({}, { status: 404 });
  const url = `${process.env.API_INTERNAL_URL ?? "http://localhost:3000"}/api/v1/products${path.length ? "/" + path.join("/") : ""}`;
  if (method === "GET" && path[0] !== "mine") {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      return new NextResponse(await response.arrayBuffer(), {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return NextResponse.json({}, { status: 503 });
    }
  }
  let payload: Buffer | undefined;
  return proxyWithSession(request, async (session) => {
    if (method !== "GET" && method !== "DELETE" && payload === undefined) {
      const chunks: Uint8Array[] = [];
      let length = 0;
      const reader = request.body?.getReader();
      if (!reader) throw new SessionFailure(400);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > (method === "PATCH" ? 16384 : 32 * 1024 * 1024)) {
          await reader.cancel();
          throw new SessionFailure(413);
        }
        chunks.push(value);
      }
      payload = Buffer.concat(chunks);
    }
    const response = await fetch(url, {
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
    return response;
  });
}
export const GET = route;
export const POST = route;
export const PUT = route;
export const PATCH = route;

export const DELETE = route;
