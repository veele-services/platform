import type { Metadata } from "next";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { ChecklistManagement } from "@/components/checklists/ChecklistManagement";
import { getChecklistManagementData } from "@/app/actions/checklists";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Quality & Checklists" };

export default async function ChecklistsPage() {
  const [canRead, canWrite, canPublish, canReview] = await Promise.all([
    hasPermission("checklists", "read"), hasPermission("checklists", "write"),
    hasPermission("checklists", "publish"), hasPermission("checklists", "review"),
  ]);
  if (!canRead) return <ForbiddenPage resource="checklists" action="read" />;
  const data = await getChecklistManagementData();
  return <SettingsSectionShell title="Quality & Checklists" description="Versievaste templates, contextuele koppelingen, uitlegbare prioriteit en veilige werkbonreconciliatie."><ChecklistManagement data={data} canWrite={canWrite} canPublish={canPublish} canReview={canReview} /></SettingsSectionShell>;
}
