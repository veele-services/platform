import "server-only";
import { getServerEnv } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";
import { ticketRpc } from "@/lib/tickets/rpc";
import { HOST_KIND_HEADER, resolveHostContext, TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import type { CrmState } from "./types";

export function crmHost(request: Request, kind: "platform" | "marketing") {
  const env = getServerEnv(), host = resolveHostContext(request.headers.get("host"), env.APP_URL, env.DEPLOY_TARGET);
  if (host.kind !== kind || request.headers.get(HOST_KIND_HEADER) !== kind || request.headers.has(TENANT_SLUG_HEADER)) throw Object.assign(new Error("Verkeerde host."), { code: "42501" });
  const origin = new URL(env.APP_URL); origin.hostname = host.hostname;
  return { env, origin: origin.origin };
}
export async function crmActor(request: Request) {
  crmHost(request, "platform");
  const db = await createClient(), { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw Object.assign(new Error("Geen actuele sessie."), { code: "42501" });
  // The RPC independently checks the live session and platform registry. Shell
  // membership, support grants and user-editable metadata convey no CRM right.
  return db;
}
export async function crmState(request: Request, operation: "state" | "overview", payload: Record<string, unknown>) {
  const db = await crmActor(request), data = await ticketRpc(db, "crm_query", { operation, payload }) as CrmState;
  const env = getServerEnv(), configured = Boolean(env.SENDGRID_API_KEY && env.SENDGRID_FROM_EMAIL);
  return { ...data, mailConfigured: configured && !!data.notificationContext.recipientEmail, notificationContext: { ...data.notificationContext, recipientName: data.notificationContext.recipientName ?? "", recipientEmail: data.notificationContext.recipientEmail ?? "", providerConfigured: configured } };
}
