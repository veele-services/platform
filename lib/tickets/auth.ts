import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import { ticketWorkspaceSchema, type TicketWorkspace } from "./model";

/** Resolves host and verified identity only. Every RPC still authorizes its
 * capability, category, record and audience against the current database. */
export async function getTicketActor(input: TicketWorkspace) {
  const workspace = ticketWorkspaceSchema.parse(input);
  const context = await getAuthContext();
  const db = await createClient();
  const { data, error } = await db.auth.getClaims();
  if (error || !data || data.claims.sub !== context.user.id) throw new Error("Geen toegang tot meldingen.");
  const sessionId = z.uuid().parse(data.claims.session_id);
  if (workspace === "platform") {
    if ((await headers()).get(TENANT_SLUG_HEADER)) throw new Error("Geen toegang tot de supportdesk.");
    return { workspace, db, user: context.user, sessionId, tenant: null, tenantId: null };
  }
  if (!context.tenant) throw new Error("Open de omgeving van je eigen organisatie.");
  return { workspace, db, user: context.user, sessionId, tenant: context.tenant, tenantId: context.tenant.id };
}
