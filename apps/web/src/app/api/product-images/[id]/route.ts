import { NextResponse } from "next/server";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[a-f0-9-]{36}$/i.test(id))
    return new NextResponse(null, { status: 404 });
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? "http://localhost:3000"}/api/v1/product-images/${id}`,
      { cache: "no-store", signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok)
      return new NextResponse(null, { status: response.status });
    return new NextResponse(await response.arrayBuffer(), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
