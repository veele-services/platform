import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ticketRpc } from "../tickets/rpc";

export const notificationPolicySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("notification"), tenantId: z.uuid().nullable(), type: z.string().min(1).max(160), context: z.enum(["platform", "backoffice", "staff", "customer"]), recipientUserId: z.uuid().nullable().optional(), sourceId: z.uuid(), sourceKind: z.enum(["mail", "delivery", "ticket", "dossier"]).default("mail") }).strict(),
  z.object({ kind: z.literal("security"), flow: z.enum(["login", "invitation", "object_otp", "permissions_otp", "auth_hook"]), tenantId: z.uuid().nullable().optional() }).strict(),
]);
export type NotificationProviderPolicy = z.input<typeof notificationPolicySchema>;
export type NotificationContext = Extract<NotificationProviderPolicy, { kind: "notification" }>;
export class NotificationSuppressedError extends Error {
  constructor(public readonly reason: string) { super("Verzending is geblokkeerd door het notificatiebeleid."); this.name = "NotificationSuppressedError"; }
}
export class NotificationDeferredError extends Error {
  constructor(public readonly retryAt: string) { super("Verzending wacht op het einde van de ingestelde rustperiode."); this.name = "NotificationDeferredError"; }
}

/** All ordinary provider submissions acquire a durable policy permit. OFF
 * blocks new permits and reports already admitted attempts; it cannot retract
 * a provider request already in flight. Security flows are named explicitly
 * and do not enter the notification ledger. */
export async function withNotificationProviderPermit<T>(input: { policy: NotificationProviderPolicy; channel: "email" | "push"; deliveryKey: string; recipient?: string }, submit: () => Promise<T>): Promise<T> {
  const policy = notificationPolicySchema.parse(input.policy);
  if (policy.kind === "security") return submit();
  const db = createAdminClient();
  const args = { target_tenant: policy.tenantId, type_code: policy.type, target_context: policy.context, channel: input.channel, recipient_user_id: policy.recipientUserId ?? null, source_id: policy.sourceId, delivery_key: input.deliveryKey };
  const response = z.object({ allowed: z.boolean(), id: z.uuid().optional().nullable(), reason: z.string().optional().nullable(), quiet_until: z.iso.datetime({offset:true}).optional().nullable() }).parse(await ticketRpc(db, "notification_provider_gate", { ...args, operation: "begin", input: { source_kind: policy.sourceKind, recipient: input.recipient ?? null } }));
  if (!response.allowed && response.quiet_until) throw new NotificationDeferredError(response.quiet_until);
  if (!response.allowed) throw new NotificationSuppressedError(response.reason ?? "policy_denied");
  if (!response.id) throw new Error("Verzendvergunning ontbreekt; er is niets verzonden.");
  const finish = async (outcome: "accepted" | "failed" | "uncertain" | "cancelled") => {
    const result = await ticketRpc(db, "notification_provider_gate", { ...args, operation: "finish", input: { permit_id: response.id, outcome, source_kind: policy.sourceKind, recipient: input.recipient ?? null } });
    if (!z.object({ ok: z.literal(true) }).safeParse(result).success) throw new Error("Provideruitkomst kon niet worden bevestigd; niet automatisch opnieuw verzenden.");
  };
  let result: T;
  try { result = await submit(); }
  catch (error) {
    const status = typeof error === "object" && error !== null ? Number("httpStatus" in error ? error.httpStatus : "statusCode" in error ? error.statusCode : 0) : 0;
    const outcome = error instanceof NotificationSuppressedError ? "cancelled" : input.channel === "push" && [404, 410].includes(status) ? "cancelled" : status >= 400 && status < 500 && status !== 408 ? "failed" : "uncertain";
    // If recording fails the admitted permit remains unresolved. It must never
    // turn a potentially accepted request into a retryable failure.
    await finish(outcome);
    throw error;
  }
  await finish("accepted");
  return result;
}
