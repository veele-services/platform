import { NextResponse } from "next/server";
import { suggestDutchAddresses } from "@workspace/db/address-geocoding";
import { hasPermission } from "@/lib/auth/permissions";

export async function GET(request: Request) {
  const canReadPersonnel = await hasPermission("personnel", "read");
  const canWritePersonnel = await hasPermission("personnel", "write");
  if (!canReadPersonnel && !canWritePersonnel) {
    return NextResponse.json({ suggestions: [] }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const suggestions = await suggestDutchAddresses(query, { limit: 6 });

  return NextResponse.json({ suggestions });
}
