import { z } from "zod";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
import { crmActor, crmHost } from "@/lib/platform-crm/data";
import { crmError } from "@/lib/platform-crm/model";
import { appointmentIcs } from "@/lib/platform-crm/ics";
import type { CrmAppointment, CrmLead } from "@/lib/platform-crm/types";
import { ticketRpc } from "@/lib/tickets/rpc";
type Context = { params: Promise<{ path: string[] }> };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
export async function GET(request: Request, context: Context) {
  try {
    const db = await crmActor(request), { path } = await context.params;
    if (path.length !== 3 || path[0] !== "appointments" || path[2] !== "ics") return reply({ ok: false, error: "Pagina niet gevonden." }, 404);
    const id = z.uuid().parse(path[1]);
    const a = await ticketRpc(db, "crm_query", { operation: "appointment", payload: { id } }) as (CrmAppointment & { lead: CrmLead }) | null;
    if (!a) return reply({ ok: false, error: "Afspraak niet beschikbaar." }, 404);
    return new Response(appointmentIcs(a, a.lead), { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="fieldgrid-afspraak-${id}.ics"`, "cache-control": "private, no-store" } });
  } catch (error) { const e = crmError(error); return reply({ ok: false, error: e.error }, e.status); }
}
async function mutate(request: Request, context: Context) {
  try {
    const { origin } = crmHost(request, "platform");
    if (request.headers.get("origin") !== origin || !request.headers.get("content-type")?.startsWith("application/json")) return reply({ ok: false, error: "Deze opdracht is niet toegestaan." }, 403);
    const db = await crmActor(request), { path } = await context.params;
    const payload = z.record(z.string(), z.unknown()).parse(await readBoundedJson(request, 24000));
    const key = z.uuid().parse(request.headers.get("idempotency-key"));
    let command: string | null = null;
    if (request.method === "POST" && path.length === 1 && ["leads", "tasks", "appointments"].includes(path[0])) command = ({ leads: "lead.create", tasks: "task.create", appointments: "appointment.create" } as Record<string, string>)[path[0]];
    else if (request.method === "PATCH" && path.length === 2 && ["leads", "tasks", "appointments"].includes(path[0])) { command = ({ leads: "lead.update", tasks: "task.update", appointments: "appointment.update" } as Record<string, string>)[path[0]]; payload.id = z.uuid().parse(path[1]); }
    else if (request.method === "POST" && path.length === 3 && path[0] === "leads" && path[2] === "activity") { command = "lead.activity"; payload.id = z.uuid().parse(path[1]); }
    else if (request.method === "PATCH" && path.length === 1 && path[0] === "settings") command = "settings.update";
    else if (request.method === "POST" && path.length === 3 && path[0] === "notifications" && path[2] === "retry") { command = "notification.retry"; payload.id = z.uuid().parse(path[1]); }
    if (!command) return reply({ ok: false, error: "Onbekende CRM-opdracht." }, 404);
    return reply(await ticketRpc(db, "crm_command", { command, payload, request_id: key }));
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return reply({ ok: false, error: "De opdracht is te groot." }, 413);
    const e = crmError(error); return reply({ ok: false, error: e.error }, e.status);
  }
}
export const POST = mutate;
export const PATCH = mutate;
