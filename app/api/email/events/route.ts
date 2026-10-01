import { z } from "zod";
import { getServerEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ticketRpc } from "@/lib/tickets/rpc";
import { readMailWebhookBody } from "@/lib/email-centre/request-body";
import { verifySendGridEvent } from "@/lib/email-centre/webhook-security";

const eventSchema = z.object({ sg_event_id: z.string().min(1).max(500), sg_message_id: z.string().min(1).max(1000), email: z.email(), event: z.string(), timestamp: z.number().int().positive(), fieldgrid_transport: z.uuid().optional() });
export async function POST(request: Request) {
  const env = getServerEnv();
  if (!env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY) return Response.json({ error: "Webhook niet ingericht." }, { status: 503 });
  let raw: Buffer;
  try { raw = await readMailWebhookBody(request, 1048576); } catch { return new Response(null, { status: 413 }); }
  if (!verifySendGridEvent(raw, request.headers, env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY)) return new Response(null, { status: 401 });
  let events: unknown[];
  try { events = z.array(z.unknown()).max(1000).parse(JSON.parse(raw.toString("utf8"))); } catch { return new Response(null, { status: 400 }); }
  try {
    const db = createAdminClient();
    for (const value of events) {
      const result = eventSchema.safeParse(value); if (!result.success || !result.data.fieldgrid_transport) continue;
      const e = result.data;
      await ticketRpc(db, "email_provider_event", { input: { transport_id: e.fieldgrid_transport, event_id: e.sg_event_id, provider_id: e.sg_message_id, recipient: e.email, event: e.event, timestamp: e.timestamp } });
    }
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch { return Response.json({ error: "Verwerking nog niet bevestigd." }, { status: 503 }); }
}
