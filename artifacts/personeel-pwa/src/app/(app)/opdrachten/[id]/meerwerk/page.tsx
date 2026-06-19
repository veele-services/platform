export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getMyAssignment } from "@/actions/assignments";
import { getActiveTaskCodes, getExtraWorkForAssignment } from "@/actions/extra-work";
import { WorkOrderHeader } from "../WorkOrderHeader";
import { ExtraWorkEditor } from "../ExtraWorkEditor";
import {
  MOCK_EXTRA_WORK,
  MOCK_TASK_CODES,
  getMockAssignment,
  type AssignmentView,
} from "../work-order-data";

type Props = {
  params: Promise<{ id: string }>;
};

const LOCKED_MEERWERK_STATUSES = new Set([
  "report_submitted",
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
]);

export default async function MeerwerkPage({ params }: Props) {
  const { id } = await params;

  const databaseAssignment = await getMyAssignment(id);
  const assignment = (databaseAssignment ?? getMockAssignment(id)) as AssignmentView | null;

  if (!assignment) notFound();

  const [items, taskCodes] = databaseAssignment
    ? await Promise.all([
        getExtraWorkForAssignment(id),
        getActiveTaskCodes(),
      ])
    : [MOCK_EXTRA_WORK, MOCK_TASK_CODES];

  const canEdit = !LOCKED_MEERWERK_STATUSES.has(assignment.status);

  return (
    <div className="min-h-screen bg-[#F4F6FA] md:rounded-[32px] md:bg-white">
      <WorkOrderHeader assignment={assignment} activeTab="werkzaamheden" />
      <ExtraWorkEditor
        assignmentId={assignment.id}
        initialItems={items}
        taskCodes={taskCodes}
        canEdit={canEdit}
        canPersist={!assignment.isMock && canEdit}
      />
    </div>
  );
}
