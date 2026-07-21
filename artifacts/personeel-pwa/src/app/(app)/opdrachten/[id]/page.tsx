export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CheckCircle2, ClipboardList, FileText, MapPin, Package, Phone, Wrench } from "lucide-react";
import { getMyAssignment } from "@/actions/assignments";
import { getMyReportForAssignment, getReportNotesForAssignment, type MyReport, type ReportNote } from "@/actions/reports";
import { getExtraWorkForAssignment } from "@/actions/extra-work";
import { getMaterialUsageForAssignment } from "@/actions/materials";
import { getInventoryUsageForAssignment } from "@/actions/inventory";
import { SeenMarker } from "@/components/SeenMarker";
import { personnelWorkOrderIsSigned } from "@/lib/work-order-lock";
import { RapportageTimeline } from "./RapportageTimeline";
import { WorkOrderHeader } from "./WorkOrderHeader";
import { InventorySummaryCard } from "./InventorySummaryCard";
import {
  CustomerInfoCard,
  CustomerNotes,
  AssignmentQuestionCard,
  ExtraWorkSummaryCard,
  MaterialSummaryCard,
  StatusProgress,
  TaskChecklistCard,
} from "./WorkOrderSections";
import {
  type AssignmentView,
  FAILED_FINAL_STATUSES,
  FINISHED_STATUSES,
  getDisplayedTimeSlot,
  getHeaderStatus,
  getTaskCompletionCount,
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
    authorName:  "Backoffice",
    createdAt:   report.submittedAt,
    attachments: [],
  }];
}

function nextActionCopy(assignment: AssignmentView): { label: string; description: string } {
  if (FAILED_FINAL_STATUSES.has(assignment.status)) {
    return {
      label:       "Afmelding controleren",
      description: assignment.completionReason || "Controleer de reden en voeg rapportage toe als planning daarom vraagt.",
    };
  }
  if (FINISHED_STATUSES.has(assignment.status)) {
    return {
      label:       "Rapportage controleren",
      description: "Werkbon is afgerond. Controleer rapportage, materiaal en eventuele opmerkingen.",
    };
  }
  if (assignment.status === "in_progress") {
    return {
      label:       "Werkbon afronden",
      description: "Werk de checklist, materiaal en rapportage bij voordat je de opdracht afrondt.",
    };
  }
  if (assignment.status === "en_route") {
    return {
      label:       "Werkzaamheden starten",
      description: "Je bent onderweg. Start de werkbon zodra je daadwerkelijk met de werkzaamheden begint.",
    };
  }
  return {
    label:       "Onderweg melden",
    description: "Controleer object, contact, toegangsinformatie en checklist. Meld onderweg zodra je vertrekt.",
  };
}

function PrimaryActionDock({ children }: { children: ReactNode }) {
  return (
    <div className="md:sticky md:top-4 md:z-10">
      {children}
    </div>
  );
}

function WorkbenchStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-white px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
      <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
        {label}
      </p>
      <p className="mt-1 text-[15px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
        {value}
      </p>
    </div>
  );
}

function WorkbenchRail({
  assignment,
  materialCount,
  inventoryCount,
  reportCount,
}: {
  assignment:     AssignmentView;
  materialCount:  number;
  inventoryCount: number;
  reportCount:    number;
}) {
  const nextAction = nextActionCopy(assignment);
  const statusBadge = getHeaderStatus(assignment.status);
  const completedTasks = getTaskCompletionCount(assignment);
  const taskTotal = assignment.tasks.length;
  const companyName = assignment.objectName || assignment.customerName || assignment.title || "Object nog niet bekend";
  const address = [
    assignment.objectAddress,
    [assignment.objectPostalCode, assignment.objectCity].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ") || "Adres niet bekend";
  const contactName = assignment.contactName || assignment.customerName || "Contactpersoon niet bekend";
  const phone = assignment.phone || "Telefoonnummer niet bekend";

  return (
    <aside className="space-y-4 md:sticky md:top-4">
      <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
              Volgende actie
            </p>
            <h2 className="mt-1 text-[19px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
              {nextAction.label}
            </h2>
          </div>
          <span
            className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black"
            style={{ backgroundColor: statusBadge.background, color: statusBadge.color }}
          >
            {statusBadge.label}
          </span>
        </div>
        <p className="mt-3 text-[13px] font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>
          {nextAction.description}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <WorkbenchStat label="Tijd" value={getDisplayedTimeSlot(assignment)} />
          <WorkbenchStat label="Checklist" value={`${completedTasks}/${taskTotal}`} />
        </div>
      </section>

      <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
        <h2 className="text-[15px] font-black" style={{ color: "var(--color-primary)" }}>
          Object en contact
        </h2>
        <div className="mt-4 space-y-3">
          <div className="flex gap-3">
            <MapPin size={18} className="mt-0.5 shrink-0" style={{ color: "var(--color-accent)" }} />
            <div className="min-w-0">
              <p className="text-[14px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
                {companyName}
              </p>
              <p className="mt-1 text-[13px] font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>
                {address}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Phone size={18} className="mt-0.5 shrink-0" style={{ color: "var(--color-accent)" }} />
            <div className="min-w-0">
              <p className="text-[14px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
                {contactName}
              </p>
              <p className="mt-1 text-[13px] font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>
                {phone}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
        <h2 className="text-[15px] font-black" style={{ color: "var(--color-primary)" }}>
          Werkbon onderdelen
        </h2>
        <div className="mt-4 grid gap-2">
          <Link href={`/opdrachten/${assignment.id}?tab=werkzaamheden`} className="flex items-center justify-between rounded-2xl border px-3 py-2.5" style={{ borderColor: "var(--color-border)" }}>
            <span className="inline-flex min-w-0 items-center gap-2 text-[13px] font-black" style={{ color: "var(--color-primary)" }}>
              <ClipboardList size={16} style={{ color: "var(--color-accent)" }} />
              Checklist
            </span>
            <span className="text-[12px] font-black" style={{ color: "var(--color-secondary)" }}>{completedTasks}/{taskTotal}</span>
          </Link>
          <Link href={`/opdrachten/${assignment.id}/materiaal`} className="flex items-center justify-between rounded-2xl border px-3 py-2.5" style={{ borderColor: "var(--color-border)" }}>
            <span className="inline-flex min-w-0 items-center gap-2 text-[13px] font-black" style={{ color: "var(--color-primary)" }}>
              <Package size={16} style={{ color: "var(--color-accent)" }} />
              Materiaal
            </span>
            <span className="text-[12px] font-black" style={{ color: "var(--color-secondary)" }}>{materialCount}</span>
          </Link>
          <Link href={`/opdrachten/${assignment.id}/inventaris`} className="flex items-center justify-between rounded-2xl border px-3 py-2.5" style={{ borderColor: "var(--color-border)" }}>
            <span className="inline-flex min-w-0 items-center gap-2 text-[13px] font-black" style={{ color: "var(--color-primary)" }}>
              <Wrench size={16} style={{ color: "var(--color-accent)" }} />
              Inventaris
            </span>
            <span className="text-[12px] font-black" style={{ color: "var(--color-secondary)" }}>{inventoryCount}</span>
          </Link>
          <Link href={`/opdrachten/${assignment.id}?tab=rapportage`} className="flex items-center justify-between rounded-2xl border px-3 py-2.5" style={{ borderColor: "var(--color-border)" }}>
            <span className="inline-flex min-w-0 items-center gap-2 text-[13px] font-black" style={{ color: "var(--color-primary)" }}>
              <FileText size={16} style={{ color: "var(--color-accent)" }} />
              Rapportage
            </span>
            <span className="text-[12px] font-black" style={{ color: "var(--color-secondary)" }}>{reportCount}</span>
          </Link>
        </div>
      </section>
    </aside>
  );
}

function WorkbenchSection({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="px-4 pb-28 pt-5 md:px-5">
      <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-[minmax(0,1fr)_22rem] md:items-start">
        {children}
      </div>
    </section>
  );
}

export default async function WerkbonDetailPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const activeTab = getActiveTab(query.tab);

  const assignment = await getMyAssignment(id) as AssignmentView | null;

  if (!assignment) notFound();

  const [report, extraWork, reportNotes, materialItems, inventoryItems] = await Promise.all([
    getMyReportForAssignment(id),
    getExtraWorkForAssignment(id),
    getReportNotesForAssignment(id),
    getMaterialUsageForAssignment(id),
    getInventoryUsageForAssignment(id),
  ]);

  const isScheduled = assignment.status === "scheduled";
  const timelineNotes = reportNotes.length > 0 ? reportNotes : reportAsNote(report);
  const canAddReportNote = !personnelWorkOrderIsSigned(assignment)
    && !["invoice_ready", "invoiced", "paid", "closed"].includes(assignment.status);
  const rail = (
    <WorkbenchRail
      assignment={assignment}
      materialCount={materialItems.length}
      inventoryCount={inventoryItems.length}
      reportCount={timelineNotes.length}
    />
  );

  return (
    <div className="min-h-screen bg-[#F4F6FA] md:rounded-[32px] md:bg-white">
      <WorkOrderHeader assignment={assignment} activeTab={activeTab} />

      {isScheduled ? (
        <SeenMarker
          assignmentId={assignment.id}
          currentStatus={assignment.status}
          expectedParticipantVersion={assignment.participantVersion ?? null}
        />
      ) : null}

      {activeTab === "home" ? (
        <WorkbenchSection id="home">
          <div className="space-y-4">
            <PrimaryActionDock>
              <StatusProgress assignment={assignment} />
            </PrimaryActionDock>
            <CustomerInfoCard assignment={assignment} />
            <CustomerNotes description={assignment.description} />
            <AssignmentQuestionCard assignment={assignment} />
          </div>
          {rail}
        </WorkbenchSection>
      ) : null}

      {activeTab === "werkzaamheden" ? (
        <WorkbenchSection id="werkzaamheden">
          <div className="space-y-4">
            <TaskChecklistCard assignment={assignment} />
            <div className="grid gap-4 xl:grid-cols-2">
              <ExtraWorkSummaryCard assignmentId={assignment.id} items={extraWork} />
              <MaterialSummaryCard assignmentId={assignment.id} items={materialItems} />
            </div>
            <InventorySummaryCard assignmentId={assignment.id} items={inventoryItems} />
          </div>
          <div className="space-y-4">
            <PrimaryActionDock>
              <StatusProgress assignment={assignment} />
            </PrimaryActionDock>
            {rail}
          </div>
        </WorkbenchSection>
      ) : null}

      {activeTab === "rapportage" ? (
        <WorkbenchSection id="rapportage">
          <div className="space-y-4">
            <RapportageTimeline
              assignmentId={assignment.id}
              expectedParticipantVersion={assignment.participantVersion ?? null}
              initialNotes={timelineNotes}
              canAdd={canAddReportNote}
              canPersist={canAddReportNote}
            />
          </div>
          <div className="space-y-4">
            <PrimaryActionDock>
              <StatusProgress assignment={assignment} />
            </PrimaryActionDock>
            <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
              <div className="flex items-center gap-3">
                <CheckCircle2 size={20} style={{ color: "var(--color-accent)" }} />
                <h2 className="text-[15px] font-black" style={{ color: "var(--color-primary)" }}>
                  Rapportagecontrole
                </h2>
              </div>
              <p className="mt-3 text-[13px] font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>
                Controleer opmerkingen, foto&apos;s en klantbevestiging voordat de werkbon naar planning of facturatie gaat.
              </p>
            </section>
            {rail}
          </div>
        </WorkbenchSection>
      ) : null}
    </div>
  );
}
