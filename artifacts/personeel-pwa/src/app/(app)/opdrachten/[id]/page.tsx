export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getMyAssignment } from "@/actions/assignments";
import { getMyReportForAssignment, getReportNotesForAssignment, type MyReport, type ReportNote } from "@/actions/reports";
import { getExtraWorkForAssignment } from "@/actions/extra-work";
import { getMaterialUsageForAssignment } from "@/actions/materials";
import { SeenMarker } from "@/components/SeenMarker";
import { RapportageTimeline } from "./RapportageTimeline";
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

function reportAsNote(report: MyReport | null): ReportNote[] {
  if (!report) return [];

  return [{
    id:          report.id,
    body:        report.content,
    authorName:  "Veele Services",
    createdAt:   report.submittedAt,
    attachments: [],
  }];
}

export default async function WerkbonDetailPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const activeTab = getActiveTab(query.tab);

  const assignment = await getMyAssignment(id) as AssignmentView | null;

  if (!assignment) notFound();

  const [report, extraWork, reportNotes, materialItems] = await Promise.all([
    getMyReportForAssignment(id),
    getExtraWorkForAssignment(id),
    getReportNotesForAssignment(id),
    getMaterialUsageForAssignment(id),
  ]);

  const isScheduled = assignment.status === "scheduled";
  const timelineNotes = reportNotes.length > 0 ? reportNotes : reportAsNote(report);
  const canAddReportNote = !["invoice_ready", "invoiced", "paid", "closed"].includes(assignment.status);

  return (
    <div className="min-h-screen bg-[#F4F6FA] md:rounded-[32px] md:bg-white">
      <WorkOrderHeader assignment={assignment} activeTab={activeTab} />

      {isScheduled ? (
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
          <RapportageTimeline
            assignmentId={assignment.id}
            initialNotes={timelineNotes}
            canAdd={canAddReportNote}
            canPersist={canAddReportNote}
          />
        </section>
      ) : null}
    </div>
  );
}
