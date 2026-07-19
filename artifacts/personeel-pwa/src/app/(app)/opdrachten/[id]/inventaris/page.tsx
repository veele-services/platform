export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getMyAssignment } from "@/actions/assignments";
import {
  getInventoryUsageForAssignment,
  listInventoryCatalogForAssignment,
} from "@/actions/inventory";
import { WorkOrderHeader } from "../WorkOrderHeader";
import { InventoryEditor } from "../InventoryEditor";
import { type AssignmentView } from "../work-order-data";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function InventarisPage({ params }: Props) {
  const { id } = await params;
  const assignment = await getMyAssignment(id) as AssignmentView | null;

  if (!assignment) notFound();

  const [items, catalog] = await Promise.all([
    getInventoryUsageForAssignment(id),
    listInventoryCatalogForAssignment(id),
  ]);
  const canEdit = ![
    "report_submitted",
    "report_approved",
    "invoice_ready",
    "invoiced",
    "paid",
    "closed",
  ].includes(assignment.status);

  return (
    <div className="min-h-screen bg-[#F4F6FA] md:rounded-[32px] md:bg-white">
      <WorkOrderHeader assignment={assignment} activeTab="werkzaamheden" />
      <InventoryEditor
        assignmentId={assignment.id}
        expectedParticipantVersion={assignment.participantVersion ?? null}
        initialItems={items}
        catalog={catalog}
        canEdit={canEdit}
      />
    </div>
  );
}
