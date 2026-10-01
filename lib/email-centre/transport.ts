import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ticketRpc } from "@/lib/tickets/rpc";
import { getServerEnv } from "@/lib/env/server";
import { NotificationSuppressedError, type NotificationProviderPolicy } from "@/lib/notifications/provider-policy";

export function mailIdentity(policy: NotificationProviderPolicy) {
  if (policy.kind === "security") return { tenant_id: policy.tenantId ?? null, type_code: `security.${policy.flow}`, purpose: "security", source_kind: "security", source_id: null, preference_owner: policy.tenantId ?? "platform" };
  return { tenant_id: policy.tenantId, type_code: policy.type, purpose: policy.type === "manual.tenant" && policy.context === "customer" ? "marketing" : policy.type.startsWith("manual.") ? "internal" : "service", source_kind: policy.sourceKind ?? "mail", source_id: policy.sourceId, preference_owner: policy.type === "manual.platform" ? "platform" : policy.tenantId ?? "platform" };
}
export async function withMailTransport<T extends { id: string }>(input: { policy: NotificationProviderPolicy; deliveryKey: string; to: string; subject: string }, submit: (transportId: string) => Promise<T>): Promise<T> {
  const identity = mailIdentity(input.policy);
  if (identity.purpose === "marketing" && getServerEnv().MAIL_MARKETING_ENABLED !== "true") throw new NotificationSuppressedError("marketing_environment_disabled");
  const db = createAdminClient();
  const call = (operation: string, value: Record<string, unknown>) => ticketRpc(db, "email_transport", { operation, input: value });
  const permit = z.object({ allowed: z.boolean(), id: z.uuid(), attempt_id: z.uuid().optional(), reason: z.string().optional() }).parse(await call("begin", { ...identity, delivery_key: input.deliveryKey, recipient: input.to, subject_label: input.policy.kind === "security" ? "Accountbeveiliging" : input.subject }));
  if (!permit.allowed) throw new NotificationSuppressedError(permit.reason ?? "email_blocked");
  if (!permit.attempt_id) throw new Error("Mailpoging ontbreekt; niets verzonden.");
  const finish = async (outcome: string, providerId?: string) => {
    const response = await call("finish", { id: permit.id, attempt_id: permit.attempt_id, outcome, provider_id: providerId });
    if (!z.object({ ok: z.literal(true) }).safeParse(response).success) throw new Error("Mailuitkomst onzeker; niet automatisch opnieuw versturen.");
  };
  let result: T;
  try { result = await submit(permit.id); }
  catch (error) {
    const status = error && typeof error === "object" && "httpStatus" in error ? Number(error.httpStatus) : 0;
    await finish(status >= 400 && status < 500 && status !== 408 ? "failed" : "uncertain");
    throw error;
  }
  await finish("accepted", result.id); return result;
}
