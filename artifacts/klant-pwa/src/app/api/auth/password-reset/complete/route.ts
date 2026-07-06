import { NextResponse } from "next/server";
import { completePasswordReset } from "@/actions/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    password?: unknown;
    passwordTwo?: unknown;
  } | null;
  const formData = new FormData();
  formData.set("password", typeof body?.password === "string" ? body.password : "");
  formData.set("passwordTwo", typeof body?.passwordTwo === "string" ? body.passwordTwo : "");

  const result = await completePasswordReset(undefined, formData);

  return NextResponse.json(result, {
    status: result.error ? 400 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
