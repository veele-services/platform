export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getMyAssignment } from "@/actions/assignments";
import { WorkOrderHeader } from "../WorkOrderHeader";
import { MaterialEditor } from "../MaterialEditor";
import {
  MOCK_MATERIAL_ITEMS,
  getMockAssignment,
  type AssignmentView,
} from "../work-order-data";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function MateriaalPage({ params }: Props) {
  const { id } = await params;

  const databaseAssignment = await getMyAssignment(id);
  const assignment = (databaseAssignment ?? getMockAssignment(id)) as AssignmentView | null;

  if (!assignment) notFound();

  return (
    <div className="min-h-screen bg-[#F4F6FA] md:rounded-[32px] md:bg-white">
      <WorkOrderHeader assignment={assignment} activeTab="werkzaamheden" />
      <MaterialEditor initialItems={assignment.isMock ? MOCK_MATERIAL_ITEMS : []} />
    </div>
  );
}
