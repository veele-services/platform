export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getMyAssignment } from "@/actions/assignments";
import { getMyReportForAssignment } from "@/actions/reports";
import { getExtraWorkForAssignment } from "@/actions/extra-work";
import { InProgressButton } from "./InProgressButton";
import { CompletionButtons } from "./CompletionButtons";
import { RapportForm } from "./RapportForm";
import { RapportDetail } from "./RapportDetail";
import { SeenMarker } from "@/components/SeenMarker";
import { WorkOrderHeader } from "./WorkOrderHeader";
import {
  CustomerInfoCard,
  CustomerNotes,
  ExtraWorkSummaryCard,
  MaterialSummaryCard,
  StatusProgress,
  TaskChecklistCard,
} from "./WorkOrderSections";
import {
  MOCK_EXTRA_WORK,
  MOCK_MATERIAL_ITEMS,
  getMockAssignment,
  type AssignmentView,
  type WorkOrderTab,
} from "./work-order-data";

type Props = {
  params:       Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

function getActiveTab(value: string | undefined): WorkOrderTab {
  if (value === "werkzaamheden" || value === "rapportage") return value;
  return "home";
}

export default async function WerkbonDetailPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const activeTab = getActiveTab(query.tab);

  const databaseAssignment = await getMyAssignment(id);
  const assignment = (databaseAssignment ?? getMockAssignment(id)) as AssignmentView | null;

  if (!assignment) notFound();

  const [report, extraWork] = databaseAssignment
    ? await Promise.all([
        getMyReportForAssignment(id),
        getExtraWorkForAssignment(id),
      ])
    : [null, MOCK_EXTRA_WORK];

  const isScheduled = assignment.status === "scheduled";
  const canStartWork = !assignment.isMock && ["plannable", "scheduled", "seen"].includes(assignment.status);
  const canCompleteWork = !assignment.isMock && assignment.status === "in_progress";
  const canSubmitReport = !assignment.isMock && (assignment.status === "completed" || assignment.status === "not_completed") && !report;
  const showReport = !!report || assignment.status === "report_submitted" || assignment.status === "report_approved";
  const materialItems = assignment.isMock ? MOCK_MATERIAL_ITEMS : [];

  return (
    <div className="min-h-screen bg-[#F4F6FA] md:rounded-[32px] md:bg-white">
      <WorkOrderHeader assignment={assignment} activeTab={activeTab} />

      {isScheduled && !assignment.isMock ? (
        <SeenMarker assignmentId={assignment.id} currentStatus={assignment.status} />
      ) : null}

      {activeTab === "home" ? (
        <section id="home" className="space-y-6 px-4 pb-28 pt-6">
          <StatusProgress assignment={assignment} />
          <CustomerInfoCard assignment={assignment} />
          <CustomerNotes description={assignment.description} />
        </section>
      ) : null}

      {activeTab === "werkzaamheden" ? (
        <section id="werkzaamheden" className="space-y-4 px-4 pb-28 pt-5">
          <TaskChecklistCard assignment={assignment} />
          <ExtraWorkSummaryCard assignmentId={assignment.id} items={extraWork} />
          <MaterialSummaryCard assignmentId={assignment.id} items={materialItems} />
        </section>
      ) : null}

      {activeTab === "rapportage" ? (
        <section id="rapportage" className="space-y-4 px-4 pb-28 pt-5">
          {canStartWork ? <InProgressButton assignmentId={assignment.id} /> : null}
          {canCompleteWork ? <CompletionButtons assignmentId={assignment.id} /> : null}
          {canSubmitReport ? (
            <RapportForm
              assignmentId={assignment.id}
              assignmentStatus={assignment.status}
              extraWorkItems={extraWork.map((i) => ({
                id:          i.id,
                description: i.description,
                hours:       i.hours,
                price:       i.price,
              }))}
            />
          ) : null}
          {showReport && report ? <RapportDetail report={report} /> : null}
          {!canStartWork && !canCompleteWork && !canSubmitReport && !showReport ? (
            <section className="rounded-[18px] bg-white px-5 py-5 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
              <h2 className="text-[17px] font-black" style={{ color: "var(--color-primary)" }}>
                Rapportage
              </h2>
              <p className="mt-2 text-[14px] leading-6" style={{ color: "var(--color-secondary)" }}>
                Rapportage is beschikbaar zodra de werkbon is afgerond.
              </p>
            </section>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
