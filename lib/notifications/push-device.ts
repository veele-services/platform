import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNotificationActor } from "./auth";
import { notificationWorkspaceSchema } from "./model";
import { ticketPushEndpointAllowed } from "../tickets/push-validation";
import { ticketRpc } from "../tickets/rpc";

export const notificationPrivateHeaders = { "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const subscription = z.object({ endpoint: z.string().refine(ticketPushEndpointAllowed), keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=?$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}(?:==)?$/) }).strict().optional() }).strict();
export const notificationPushRequest = z.object({ workspace: notificationWorkspaceSchema, action: z.enum(["status", "subscribe", "unsubscribe", "revoke"]), subscription: subscription.optional(), deviceId: z.uuid().optional(), label: z.string().trim().min(1).max(80).regex(/^[^\u0000-\u001f\u007f]+$/).optional() }).strict().superRefine((value, ctx) => {
  if (value.action === "subscribe" && !value.subscription?.keys) ctx.addIssue({ code: "custom", message: "Abonnementsleutels ontbreken" });
  if (value.action === "unsubscribe" && !value.subscription) ctx.addIssue({ code: "custom", message: "Abonnement ontbreekt" });
  if (value.action === "revoke" && !value.deviceId) ctx.addIssue({ code: "custom", message: "Apparaat ontbreekt" });
});
export function notificationRequestOrigin(request: Request) {
  const raw = request.headers.get("origin"), host = request.headers.get("host");
  if (!raw || !host) throw new Error("Ongeldige herkomst");
  const origin = new URL(raw);
  if (origin.origin !== raw || origin.host !== host || origin.username || origin.password || (process.env.DEPLOY_TARGET !== "local" && origin.protocol !== "https:")) throw new Error("Ongeldige herkomst");
  return origin.origin;
}
export async function runNotificationPushRequest(request: Request, input: unknown) {
  const origin = notificationRequestOrigin(request), value = notificationPushRequest.parse(input);
  const actor = await getNotificationActor(value.workspace);
  return ticketRpc(createAdminClient(), "notification_push_device", { target_tenant: actor.tenantId, actor_context: value.workspace, actor_id: actor.user.id, session_id: actor.sessionId, operation: value.action, input: { origin, ...value.subscription, ...(value.deviceId ? { device_id: value.deviceId } : {}), ...(value.label ? { label: value.label } : {}) } });
}
export async function notificationPushPost(request: Request, inputAdapter?: (input: unknown) => unknown) {
  try {
    notificationRequestOrigin(request);
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new Error("Ongeldig verzoek");
    const reader = request.body?.getReader(); if (!reader) throw new Error("Ongeldig verzoek");
    const chunks: Uint8Array[] = []; let total = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > 8192) { await reader.cancel(); throw new Error("Verzoek te groot"); } chunks.push(value); } } finally { reader.releaseLock(); }
    const raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const result = await runNotificationPushRequest(request, inputAdapter ? inputAdapter(raw) : raw);
    return Response.json({ ok: true, ...result as object }, { headers: notificationPrivateHeaders });
  } catch {
    return Response.json({ ok: false, error: "Pushregistratie niet bevestigd. Controleer je toegang en browserinstellingen." }, { status: 400, headers: notificationPrivateHeaders });
  }
}
