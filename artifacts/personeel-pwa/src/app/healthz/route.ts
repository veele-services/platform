import { runtimeHealthHeaders } from "../../../../../lib/db/src/runtime-health-identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = runtimeHealthHeaders("personnel");

export function GET() {
  return new Response("OK", { status: 200, headers });
}
