import { notFound } from "next/navigation";
import { getManagementActor } from "@/lib/management/auth";
import { managementRpc } from "@/lib/management/rpc";
import { managementSnapshotSchema } from "@/lib/management/model";
import { getPlanningShellData } from "@/lib/planning/data";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import { ManagementUsers } from "@/components/fieldgrid/management/users";

export default async function ManagementUsersPage() {
  const actor = await getManagementActor().catch(() => null);
  if (!actor) notFound();
  const [snapshot, shell] = await Promise.all([managementRpc(actor.db, "management_query", { target_tenant: actor.context.tenant.id }), getPlanningShellData(actor.context.tenant.id)]);
  return <BackofficeShell context={actor.context} data={shell} initialView="gebruikers"><ManagementUsers tenant={actor.context.tenant} currentUserId={actor.context.user.id} initial={managementSnapshotSchema.parse(snapshot)}/></BackofficeShell>;
}
