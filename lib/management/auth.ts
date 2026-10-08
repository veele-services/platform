import "server-only";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { hasManagementPermission } from "./model";

export async function getManagementActor(capability = "management.users.read") {
  const context = await getAuthContext();
  if (!context.tenant || !hasManagementPermission(context.tenant, capability) || !context.tenant.roles.some(role => role !== "staff")) throw new Error("Geen toegang tot gebruikersbeheer.");
  return { context: { ...context, tenant: context.tenant }, db: await createClient() };
}
export async function requireBackofficePermission(capability: string) {
  const context = await getAuthContext();
  if (!context.tenant || !hasManagementPermission(context.tenant, "backoffice.access") || !hasManagementPermission(context.tenant, capability)) throw new Error("Je rol geeft geen toegang tot deze functie.");
  return context;
}
