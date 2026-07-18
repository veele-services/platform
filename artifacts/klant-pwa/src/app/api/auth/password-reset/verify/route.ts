import { NextResponse } from "next/server";
import { verifyPasswordResetCode } from "@/actions/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    email?: unknown;
    code?: unknown;
    purpose?: unknown;
  } | null;
  const result = await verifyPasswordResetCode({
    email: typeof body?.email === "string" ? body.email : "",
    code: typeof body?.code === "string" ? body.code : "",
    purpose: body?.purpose === "activation" ? "activation" : "password-reset",
  });

  return NextResponse.json(result, {
    status: result.success ? 200 : 400,
    headers: { "Cache-Control": "no-store" },
  });
}
