import { managedWebsiteRobotsResponse } from "@/lib/public-responses";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export function GET(request: Request) {
  return managedWebsiteRobotsResponse(request);
}
