import { crmState } from "@/lib/platform-crm/data";
import { crmError, crmQuerySchema } from "@/lib/platform-crm/model";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, operation = params.get("view") === "overview" ? "overview" : "state";
    const query = Object.fromEntries(params); delete query.view;
    const data = await crmState(request, operation, crmQuerySchema.parse(query));
    return Response.json(data, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { const e = crmError(error); return Response.json({ ok: false, error: e.error }, { status: e.status, headers: { "cache-control": "no-store" } }); }
}
