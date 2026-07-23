import { NextResponse } from "next/server";
import { getFieldgridFormSubmissionEndpoint } from "@/lib/fieldgrid-forms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const endpoint = getFieldgridFormSubmissionEndpoint(
    process.env.FIELDGRID_WEBSITE_FORM_ID,
  );

  return NextResponse.json(
    endpoint ? { enabled: true, endpoint } : { enabled: false },
    {
      status: endpoint ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
