import "server-only";

import { z } from "zod";
import type { createAdminClient } from "@/lib/supabase/admin";
import { SendGridDeliveryError } from "../providers/sendgrid";

/** The first claimed attempt freezes presentation, recipient and document path.
 * Retries cannot pick up a newer template, sender or freshly generated action URL.
 * Only the service-only SQL RPC can write this subdocument, once. */
export const mailSnapshotSchema = z.object({
  fromEmail: z.email(), fromName: z.string().min(1).max(250), to: z.email(),
  subject: z.string().min(1).max(300).regex(/^[^\r\n]+$/),
  text: z.string().min(1).max(50000), html: z.string().min(1).max(150000),
  targetUrl: z.url().max(4096), templateRevision: z.number().int().min(1),
  templateVersionId: z.uuid().optional(),
  templateBaseVersionId: z.uuid().nullable().optional(),
  attachmentPath: z.string().max(1024).nullable().default(null),
  attachmentFilename: z.string().max(250).nullable().default(null),
});
export type MailSnapshot = z.infer<typeof mailSnapshotSchema>;

export async function freezeMailSnapshot(db: ReturnType<typeof createAdminClient>, tenantId: string, deliveryId: string, draft: MailSnapshot): Promise<MailSnapshot> {
  const value = mailSnapshotSchema.parse(draft);
  const rpc = db.rpc.bind(db) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  const result = await rpc("notification_mail_snapshot", { target_tenant: tenantId, delivery_id: deliveryId, draft: value });
  if (result.error) throw new Error("De vaste berichtversie kon niet worden opgeslagen. De e-mail is niet verstuurd.");
  return mailSnapshotSchema.parse(result.data);
}

/** SendGrid has no idempotency guarantee for custom_args. A timeout or server
 * error therefore cannot safely become a retryable failure. */
export function mailFailureOutcome(error: unknown): "failed" | "uncertain" | "suppressed" {
  // The provider module owns this error; using its stable name also keeps this
  // helper independent of the permit implementation during rolling upgrades.
  if (error instanceof Error && error.name === "NotificationSuppressedError") return "suppressed";
  return error instanceof SendGridDeliveryError && error.httpStatus >= 400 && error.httpStatus < 500 && error.httpStatus !== 408 ? "failed" : "uncertain";
}

export function mailFailureMessage(outcome: ReturnType<typeof mailFailureOutcome>) {
  if (outcome === "suppressed") return "Niet verstuurd: de actuele notificatie-instellingen of toegangscontrole blokkeren dit bericht. De bronregistratie blijft behouden.";
  if (outcome === "failed") return "De e-mailprovider heeft de verzending geweigerd. Controleer de verzendregistratie voordat je opnieuw probeert.";
  return "De ontvangst door de e-mailprovider is onzeker. Controleer de provider; er wordt niet automatisch opnieuw verstuurd.";
}
