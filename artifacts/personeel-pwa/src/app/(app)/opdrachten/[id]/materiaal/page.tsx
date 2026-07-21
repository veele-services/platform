export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getMyAssignment } from "@/actions/assignments";
import {
  getMaterialUsageForAssignment,
  listMaterialCatalogForAssignment,
} from "@/actions/materials";
import { WorkOrderHeader } from "../WorkOrderHeader";
import { MaterialEditor } from "../MaterialEditor";
import { type AssignmentView } from "../work-order-data";
import { personnelWorkOrderIsSigned } from "@/lib/work-order-lock";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function MateriaalPage({ params }: Props) {
  const { id } = await params;

  const assignment = await getMyAssignment(id) as AssignmentView | null;

  if (!assignment) notFound();

  const [items, catalog] = await Promise.all([
    getMaterialUsageForAssignment(id),
    listMaterialCatalogForAssignment(id),
  ]);
  const canEdit = !personnelWorkOrderIsSigned(assignment) && ![
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
      <MaterialEditor
        assignmentId={assignment.id}
        expectedParticipantVersion={assignment.participantVersion ?? null}
        initialItems={items}
        catalog={catalog}
        canEdit={canEdit}
      />
    </div>
  );
}
