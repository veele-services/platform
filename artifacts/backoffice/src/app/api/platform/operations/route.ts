import { NextResponse } from "next/server";
import { getPlatformOperationsDashboard } from "@/app/actions/platform-operations";

export async function GET(): Promise<NextResponse> {
  const dashboard = await getPlatformOperationsDashboard();
  return NextResponse.json(dashboard, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
