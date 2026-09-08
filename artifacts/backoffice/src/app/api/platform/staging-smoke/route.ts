import { NextResponse } from "next/server";
import { buildPlatformStagingSmokeDashboard } from "@/app/actions/platform-smoke";
import { requirePlatformAdminFromRequest } from "@/lib/auth/platform";
import { classifyStagingSmokeAutomationBearer } from "@/lib/auth/staging-smoke-automation";

async function requireStagingSmokeAccess(request: Request): Promise<void> {
  const automationAuth = classifyStagingSmokeAutomationBearer(request);
  if (automationAuth === "valid") return;
  if (automationAuth === "invalid") {
    throw new Error("Invalid staging smoke automation authorization");
  }
  await requirePlatformAdminFromRequest(request);
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireStagingSmokeAccess(request);
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
