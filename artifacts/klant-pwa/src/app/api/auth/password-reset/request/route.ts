import { NextResponse } from "next/server";
import { requestPasswordResetCode } from "@/actions/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const result = await requestPasswordResetCode(email);

  return NextResponse.json(result, {
    status: result.success ? 200 : 400,
    headers: { "Cache-Control": "no-store" },
  });
}
