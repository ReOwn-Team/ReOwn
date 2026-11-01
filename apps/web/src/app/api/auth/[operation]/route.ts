import type { NextRequest } from "next/server";
import { handleAuth } from "@/lib/auth/server/session";
type Context = { params: Promise<{ operation: string }> };
export async function GET(request: NextRequest, context: Context) {
  return handleAuth(request, (await context.params).operation);
}
export async function POST(request: NextRequest, context: Context) {
  return handleAuth(request, (await context.params).operation);
}
