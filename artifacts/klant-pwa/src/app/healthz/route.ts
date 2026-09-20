import { NextResponse } from "next/server";
import { runtimeHealthHeaders } from "../../../../../lib/db/src/runtime-health-identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = runtimeHealthHeaders("customer");

export function GET() {
  return NextResponse.json({ status: "ok" }, { headers });
}
