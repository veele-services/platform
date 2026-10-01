import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { getObjectActor } from "@/lib/objects/auth";
import { createClient } from "@/lib/supabase/server";
import { TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import { notificationWorkspaceSchema, type NotificationBrand, type NotificationWorkspace } from "./model";

/** Identity/hostname resolution only. Capabilities and source access are checked
 * on every authenticated RPC, including customers without a staff membership. */
export async function getNotificationActor(input: NotificationWorkspace) {
  const workspace = notificationWorkspaceSchema.parse(input);
  if (workspace === "customer") {
    const actor = await getObjectActor();
    const { data: brand } = await actor.admin.from("tenant_branding").select("primary_color,accent_color,logo_path").eq("tenant_id", actor.tenant.id).maybeSingle();
    const tenant: NotificationBrand = { ...actor.tenant, primaryColor: brand?.primary_color ?? "#222C35", accentColor: brand?.accent_color ?? "#41AC42", logoUrl: brand?.logo_path ? `/api/branding/${actor.tenant.id}/email-logo` : null };
    return { workspace, db: actor.db, user: actor.user, sessionId: actor.sessionId, tenant, tenantId: tenant.id };
  }
  const context = await getAuthContext(), db = await createClient();
  const { data, error } = await db.auth.getClaims();
  if (error || !data || data.claims.sub !== context.user.id) throw new Error("Geen toegang.");
  const sessionId = z.uuid().parse(data.claims.session_id);
  if (workspace === "platform") {
    if ((await headers()).get(TENANT_SLUG_HEADER)) throw new Error("Open de platformomgeving.");
    return { workspace, db, user: context.user, sessionId, tenant: null, tenantId: null };
  }
  if (!context.tenant) throw new Error("Open de omgeving van je organisatie.");
  const source = context.tenant;
  const tenant: NotificationBrand = { id: source.id, name: source.name, slug: source.slug, timezone: source.timezone, primaryColor: source.primaryColor, accentColor: source.accentColor, logoUrl: source.logoPath ? `/api/branding/${source.id}/email-logo` : null };
  return { workspace, db, user: context.user, sessionId, tenant, tenantId: tenant.id };
}
