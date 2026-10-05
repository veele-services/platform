import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import { getAuthContext } from "./context";
import { getObjectActor } from "@/lib/objects/auth";
import { TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import type { LoginWorkspace } from "./login-destination";

/** Called after OTP verification, never an account/email lookup. Customer
 * identity is independent of tenant staff membership and remains DB-backed. */
export async function getLoginAccess(): Promise<{ workspaces: LoginWorkspace[] }> {
  const context = await getAuthContext();
  const slug = (await headers()).get(TENANT_SLUG_HEADER);
  if (!slug && context.isPlatformAdmin) return { workspaces: ["/platform"] };
  if (!slug && (process.env.DEPLOY_TARGET ?? "local") !== "local") {
    return { workspaces: context.isPlatformAdmin ? ["/platform"] : [] };
  }
  const actor = await getObjectActor();
  if (slug && actor.tenant.slug !== slug) throw new Error("Geen toegang");
  // Even a staff-only login checks the live Auth session through this minimal
  // RPC. It returns only the caller's account names, not private customer data.
  const accounts = await actor.db.rpc("customer_portal_accounts", { target_tenant: actor.tenant.id });
  if (accounts.error) throw new Error("Geen toegang");
  const ownAccounts = z.array(z.object({ id: z.uuid(), name: z.string() }).strict()).parse(accounts.data);
  const workspaces: LoginWorkspace[] = [];
  const membership = context.tenant?.id === actor.tenant.id && (!slug || context.tenant.slug === slug) ? context.tenant : null;
  if (membership?.roles.some(role => role !== "staff")) workspaces.push("/app");
  if (membership?.roles.includes("staff") && membership.enabledServices.includes("personeel")) workspaces.push("/staff");
  if (ownAccounts.length) workspaces.push("/klant");
  return { workspaces };
}
