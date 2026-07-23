import { NextResponse } from "next/server";
import { buildFieldgridCustomHealthEvidence } from "@/lib/fieldgrid-custom-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result = buildFieldgridCustomHealthEvidence();

  return NextResponse.json(result.body, {
    status: result.ready ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
