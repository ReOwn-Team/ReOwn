import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";

// Configure only behind an ingress that overwrites this header. Never trust a
// caller-supplied forwarding header on a directly exposed Next.js server.
export function clientIdentityHeaders(
  request?: NextRequest,
): Record<string, string> {
  const secret = process.env.BFF_SHARED_SECRET;
  const header = process.env.WEB_CLIENT_IP_HEADER;
  if (!secret || secret.length < 32 || !header || !request) return {};
  const ip = request.headers.get(header)?.split(",")[0].trim();
  if (!ip || !isIP(ip)) return {};
  const client = createHmac("sha256", secret)
    .update(`client:${ip}`)
    .digest("hex");
  const time = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(`${client}:${time}`)
    .digest("hex");
  return {
    "X-ReOwn-BFF-Client": client,
    "X-ReOwn-BFF-Time": time,
    "X-ReOwn-BFF-Signature": signature,
  };
}
