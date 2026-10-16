import { NextResponse } from "next/server";
import { buildStaffManifest } from "@/lib/pwa/presentation";
import { getStaffPwaIdentity } from "@/lib/pwa/staff";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return new NextResponse(JSON.stringify(buildStaffManifest(await getStaffPwaIdentity())), {
      headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
    });
  } catch {
    return new NextResponse("Niet gevonden", { status: 404, headers: { "cache-control": "no-store" } });
  }
}
