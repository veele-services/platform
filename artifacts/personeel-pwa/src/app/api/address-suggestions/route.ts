import { NextResponse } from "next/server";
import { getMyPersonnel } from "@/actions/personnel";
import { suggestDutchAddresses } from "@workspace/db/address-geocoding";

export async function GET(request: Request) {
  const personnel = await getMyPersonnel();
  if (!personnel) {
    return NextResponse.json({ suggestions: [] }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const suggestions = await suggestDutchAddresses(query, { limit: 6 });

  return NextResponse.json({ suggestions });
}
