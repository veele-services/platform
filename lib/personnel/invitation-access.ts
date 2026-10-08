import "server-only";
import { getAuthContext, hasAnyRole, type AuthContext, type TenantContext } from "@/lib/auth/context";
import { hasManagementPermission } from "@/lib/management/model";
import { createAdminClient } from "@/lib/supabase/admin";

export type PersonnelInvitationCapability = "backoffice.functions.invite_personnel" | "backoffice.functions.repeat_personnel_invitation";
type Actor = AuthContext & { tenant: TenantContext };

export async function personnelInvitationActor(capability: PersonnelInvitationCapability, expected?: Actor): Promise<Actor> {
  const context = await getAuthContext();
  if (!context.tenant || !context.tenant.enabledServices.includes("personeel") || !hasAnyRole(context,["tenant_admin","management","hr"]) || !["backoffice.access","backoffice.personnel.write",capability].every(key=>hasManagementPermission(context.tenant!,key))) throw new Error("Je rol geeft geen toegang tot deze personeelsuitnodiging.");
  if (expected && (context.user.id !== expected.user.id || context.tenant.id !== expected.tenant.id)) throw new Error("Je toegang is gewijzigd; er is geen uitnodiging verstuurd.");
  return context as Actor;
}

/** Minimal recipient proof via service-role reads, only after live actor checks.
 * No global Auth metadata, password or management profile is changed. */
export async function confirmPersonnelInvitationAccess(actor: Actor, capability: PersonnelInvitationCapability, person: { id: string; userId: string; email: string }) {
  await personnelInvitationActor(capability,actor);
  const admin = createAdminClient();
  const [record,membership,account] = await Promise.all([
    admin.from("personnel").select("id,user_id,email,status").eq("tenant_id",actor.tenant.id).eq("id",person.id).maybeSingle(),
    admin.from("tenant_memberships").select("status,roles").eq("tenant_id",actor.tenant.id).eq("user_id",person.userId).maybeSingle(),
    admin.auth.admin.getUserById(person.userId),
  ]);
  const user=account.data.user;
  if (record.error || membership.error || account.error || !record.data || record.data.user_id!==person.userId || record.data.email?.toLowerCase()!==person.email.toLowerCase() || !["invited","active"].includes(record.data.status) || membership.data?.status!=="active" || !membership.data.roles.includes("staff") || !user || user.is_anonymous || user.email?.toLowerCase()!==person.email.toLowerCase() || (user.banned_until && new Date(user.banned_until).getTime()>Date.now())) throw new Error("Het personeelsaccount of de toegang is gewijzigd; er is geen uitnodiging verstuurd.");
  // Recipient I/O is another asynchronous boundary; do not reuse its entry proof.
  await personnelInvitationActor(capability,actor);
}
