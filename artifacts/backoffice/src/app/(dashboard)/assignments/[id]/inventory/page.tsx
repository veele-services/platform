import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PackageSearch } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getAssignment } from "@/app/actions/assignments";
import {
  canApproveAssignmentInventory,
  canAttachAssignmentInventory,
  listAssignmentInventoryLinks,
  listAttachableInventoryForAssignment,
} from "@/app/actions/assignment-inventory";
import { AssignmentInventoryPanel } from "@/components/inventory/AssignmentInventoryPanel";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const canRead = await hasPermission("inventory", "view");
    if (!canRead) return { title: "Geen toegang" };
    const { id } = await params;
    const assignment = await getAssignment(id);
    return { title: assignment ? `Inventaris - ${assignment.code}` : "Inventaris op werkbon" };
  } catch {
    return { title: "Inventaris op werkbon" };
  }
}

export default async function AssignmentInventoryPage({ params }: Props) {
  const canRead = await hasPermission("inventory", "view");
  if (!canRead) return <ForbiddenPage resource="inventory" action="view" />;

  const { id } = await params;
  const assignment = await getAssignment(id);
  if (!assignment) notFound();

  const [rows, canManage, canApprove] = await Promise.all([
    listAssignmentInventoryLinks(id),
    canAttachAssignmentInventory().catch(() => false),
    canApproveAssignmentInventory().catch(() => false),
  ]);
  const attachableItems = canManage ? await listAttachableInventoryForAssignment(id) : [];

  return (
    <div className="mx-auto w-full max-w-[1800px] p-8">
      <div className="mb-8">
        <Link
          href={`/assignments/${assignment.id}`}
          className="mb-3 inline-flex items-center gap-1 text-sm transition-colors hover:underline"
          style={{ color: "#64748B" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar werkbon
        </Link>

        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="font-heading flex items-center gap-2 text-2xl font-bold" style={{ color: "#081D3A" }}>
              <PackageSearch className="h-6 w-6" style={{ color: "#00B7B3" }} />
              Inventaris op werkbon
            </h1>
            <p className="mt-2 text-sm" style={{ color: "#64748B" }}>
              {assignment.code} - {assignment.title}
            </p>
          </div>
          <Link
            href="/inventory"
            className="inline-flex w-fit items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ backgroundColor: "#F1F5F9", color: "#081D3A" }}
          >
            Inventarisregister
          </Link>
        </div>
      </div>

      <AssignmentInventoryPanel
        assignmentId={assignment.id}
        rows={rows}
        attachableItems={attachableItems}
        canManage={canManage}
        canApprove={canApprove}
      />
    </div>
  );
}
