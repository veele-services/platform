import { NextResponse } from "next/server";
import { getPlatformStagingSmokeDashboard } from "@/app/actions/platform-smoke";

export async function GET() {
  const dashboard = await getPlatformStagingSmokeDashboard();
  return NextResponse.json(dashboard);
}
