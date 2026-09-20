import { runtimeHealthHeaders } from "../../../../../lib/db/src/runtime-health-identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = runtimeHealthHeaders("backoffice");

export function GET() {
  return Response.json({ status: "ok" }, { headers });
}
