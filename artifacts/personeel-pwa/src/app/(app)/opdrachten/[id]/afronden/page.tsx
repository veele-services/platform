export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getMyAssignment } from "@/actions/assignments";
import { getExtraWorkForAssignment } from "@/actions/extra-work";
import { getMyReportForAssignment, getReportNotesForAssignment, type MyReport, type ReportNote } from "@/actions/reports";
import { CompletionSummary } from "../CompletionSummary";
import { WorkOrderHeader } from "../WorkOrderHeader";
import { type AssignmentView, type MaterialUsageItem } from "../work-order-data";

type Props = {
  params:       Promise<{ id: string }>;
  searchParams: Promise<{ result?: string }>;
};

function getMode(value: string | undefined): "completed" | "not_completed" {
  return value === "not_completed" ? "not_completed" : "completed";
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

export default async function WorkOrderCompletionPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const mode = getMode(query.result);

  const assignment = await getMyAssignment(id) as AssignmentView | null;

  if (!assignment) notFound();

  const [report, extraWork, reportNotes] = await Promise.all([
    getMyReportForAssignment(id),
    getExtraWorkForAssignment(id),
    getReportNotesForAssignment(id),
  ]);

  const materialItems: MaterialUsageItem[] = [];
  const timelineNotes = reportNotes.length > 0 ? reportNotes : reportAsNote(report);

  return (
    <div className="min-h-screen bg-[#F4F6FA] md:rounded-[32px] md:bg-white">
      <WorkOrderHeader assignment={assignment} activeTab="werkzaamheden" />
      <CompletionSummary
        assignment={assignment}
        mode={mode}
        extraWork={extraWork}
        materials={materialItems}
        reportNotes={timelineNotes}
      />
    </div>
  );
}
