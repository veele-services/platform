import { createAdminClient } from "@/lib/supabase/admin";
import { ticketRpc } from "@/lib/tickets/rpc";
import { crmHost, crmActor } from "@/lib/platform-crm/data";
import { crmAvailabilitySchema, crmDate, crmError } from "@/lib/platform-crm/model";
export async function GET(request: Request) {
  try {
    const marketing = request.headers.get("x-fieldgrid-host-kind") === "marketing";
    const db = marketing ? (crmHost(request, "marketing"), createAdminClient()) : await crmActor(request);
    const day = crmDate.parse(new URL(request.url).searchParams.get("date"));
    const data = crmAvailabilitySchema.parse(await ticketRpc(db, "crm_availability", { day }));
    return Response.json(data, { headers: { "cache-control": "no-store" } });
  } catch (error) { const e = crmError(error); return Response.json({ ok: false, error: e.error }, { status: e.status, headers: { "cache-control": "no-store" } }); }
}
