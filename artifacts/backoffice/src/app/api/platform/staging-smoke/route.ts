import { NextResponse } from "next/server";
import { buildPlatformStagingSmokeDashboard } from "@/app/actions/platform-smoke";
import { requirePlatformAdminFromRequest } from "@/lib/auth/platform";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requirePlatformAdminFromRequest(request);
  } catch {
    return NextResponse.json(
      { error: "Authenticatie vereist" },
      {
        status: 401,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  const dashboard = await buildPlatformStagingSmokeDashboard();
  return NextResponse.json(dashboard, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
