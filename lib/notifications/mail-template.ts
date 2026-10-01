import "server-only";
import { z } from "zod";
import type { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ title: z.string().min(1), body: z.string().min(1), cta_label: z.string().optional(), revision: z.number().int().min(1), version_id: z.uuid(), base_version_id: z.uuid().nullable().optional(), variables: z.array(z.string()) });
export async function resolveMailTemplate(db: ReturnType<typeof createAdminClient>, tenantId: string, type: string, context: "customer" | "backoffice" | "staff") {
  const rpc = db.rpc.bind(db) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  const result = await rpc("notification_template_resolve", { target_tenant: tenantId, type_code: type, target_context: context, channel: "email" });
  if (result.error) throw new Error("De effectieve e-mailtemplate is niet beschikbaar. Er is niets verzonden.");
  return schema.parse(result.data);
}

export function renderNotificationMailText(template: string, allowed: string[], values: Record<string, string>): string {
  return template.replace(/\{([a-z][a-z0-9_]*)\}/g, (_whole, key: string) => {
    if (!allowed.includes(key) || !Object.hasOwn(values,key)) throw new Error("De e-mailtemplate bevat een ontbrekende of niet-toegestane variabele.");
    return values[key];
  });
}
