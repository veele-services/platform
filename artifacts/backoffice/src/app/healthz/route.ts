import { runtimeHealthHeaders } from "@workspace/db/runtime-health-identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = runtimeHealthHeaders("backoffice");

export function GET() {
  return Response.json({ status: "ok" }, { headers });
}
