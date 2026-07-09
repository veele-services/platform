import { NextResponse } from "next/server";
import { suggestDutchAddresses } from "@workspace/db/address-geocoding";
import { hasPermission } from "@/lib/auth/permissions";

export async function GET(request: Request) {
  const canReadPersonnel = await hasPermission("personnel", "read");
  const canWritePersonnel = await hasPermission("personnel", "write");
  const canReadObjects = await hasPermission("objects", "read");
  const canWriteObjects = await hasPermission("objects", "write");
  if (!canReadPersonnel && !canWritePersonnel && !canReadObjects && !canWriteObjects) {
    return NextResponse.json({ suggestions: [] }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const suggestions = await suggestDutchAddresses(query, { limit: 6 });

  return NextResponse.json({ suggestions });
}
