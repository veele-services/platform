import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ticketRpc } from "@/lib/tickets/rpc";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
import { crmHost } from "@/lib/platform-crm/data";
import { crmError, crmIntakeSchema, crmReceiptSchema } from "@/lib/platform-crm/model";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
export async function POST(request: Request) {
  try {
    const { env, origin } = crmHost(request, "marketing");
    if (request.headers.get("origin") !== origin || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply({ ok: false, error: "Deze aanvraag is niet toegestaan." }, 403);
    const { idempotencyKey, ...payload } = crmIntakeSchema.parse(await readBoundedJson(request, 20000));
    if (!env.ADMIN_API_SECRET) return reply({ ok: false, error: "Aanvragen zijn tijdelijk niet beschikbaar." }, 503);
    const ip = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
    const rateKey = createHmac("sha256", env.ADMIN_API_SECRET).update(`fieldgrid-crm:${ip}`).digest("hex");
    const receipt = crmReceiptSchema.parse(await ticketRpc(createAdminClient(), "crm_intake", { payload, request_id: idempotencyKey, rate_key: rateKey }));
    // Sending is deliberately left to the existing durable worker. A provider
    // timeout cannot change a committed intake into a failed form submission.
    return reply(receipt);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return reply({ ok: false, error: "De aanvraag is te groot; er is niets afgekapt." }, 413);
    const failure = crmError(error); return reply({ ok: false, error: failure.error }, failure.status);
  }
}
