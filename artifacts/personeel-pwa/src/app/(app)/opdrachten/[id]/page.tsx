export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, Play, X } from "lucide-react";
import { getMyAssignment, type MyAssignmentDetail } from "@/actions/assignments";
import { getMyReportForAssignment } from "@/actions/reports";
import { getExtraWorkForAssignment, getActiveTaskCodes } from "@/actions/extra-work";
import { MobileHeaderActions, VeeleLogo } from "@/components/MobileHeader";
import { InProgressButton } from "./InProgressButton";
import { CompletionButtons } from "./CompletionButtons";
import { RapportForm } from "./RapportForm";
import { RapportDetail } from "./RapportDetail";
import { MeerwerkSection } from "@/components/MeerwerkSection";
import { SeenMarker } from "@/components/SeenMarker";

type Props = { params: Promise<{ id: string }> };

type AssignmentView = Pick<
  MyAssignmentDetail,
  | "id"
  | "code"
  | "title"
  | "description"
  | "scheduledDate"
  | "scheduledStart"
  | "scheduledEnd"
  | "status"
  | "customerName"
  | "objectName"
  | "objectAddress"
  | "objectCity"
  | "objectPostalCode"
  | "tasks"
> & {
  contactName?: string | null;
  phone?: string | null;
  isMock?: boolean;
};

const MOCK_ASSIGNMENTS: Record<string, AssignmentView> = {
  "SCH-2026-0600001": {
    id:               "SCH-2026-0600001",
    code:             "SCH-2026-0600001",
    title:            "Lift onderhoud en controle uitvoeren",
    description:      "Lift onderhoud en controle uitvoeren.\nLet op: oudere installatie, rustig afstemmen met bewoner.",
    scheduledDate:    "2026-06-19",
    scheduledStart:   "08:02",
    scheduledEnd:     "10:00",
    status:           "in_progress",
    customerName:     "Chantal Veele",
    contactName:      "Chantal Veele",
    objectName:       "VvE Residentie Zeezicht",
    objectAddress:    "Strandweg 14",
    objectCity:       "Den Haag",
    objectPostalCode: "2586 JK",
    phone:            "06-34108400",
    tasks:            [],
    isMock:           true,
  },
  "BEV-2026-0600002": {
    id:               "BEV-2026-0600002",
    code:             "BEV-2026-0600002",
    title:            "Avonddienst toegangscontrole",
    description:      "Controleer entree, sluitronde en overdracht.\nLet op: extra aandacht voor personeelsingang aan de achterzijde.",
    scheduledDate:    "2026-06-19",
    scheduledStart:   "14:00",
    scheduledEnd:     "22:00",
    status:           "seen",
    customerName:     "Michael Veele",
    contactName:      "Michael Veele",
    objectName:       "Horeca De Haven",
    objectAddress:    "Westplein 8",
    objectCity:       "Rotterdam",
    objectPostalCode: "3016 BM",
    phone:            "06-24291576",
    tasks:            [],
    isMock:           true,
  },
  "FAC-2026-0600003": {
    id:               "FAC-2026-0600003",
    code:             "FAC-2026-0600003",
    title:            "Facilitaire ondersteuning evenement",
    description:      "Ondersteun bij zaalopbouw en controle algemene ruimtes.\nStem bijzonderheden af met de locatiemanager.",
    scheduledDate:    "2026-06-19",
    scheduledStart:   "18:00",
    scheduledEnd:     "23:30",
    status:           "in_progress",
    customerName:     "Danny de Groot",
    contactName:      "Danny de Groot",
    objectName:       "Eventlocatie Houtrust",
    objectAddress:    "Laan van Poot 353",
    objectCity:       "Den Haag",
    objectPostalCode: "2566 DA",
    phone:            "070-1234567",
    tasks:            [],
    isMock:           true,
  },
  "SCH-2026-0600004": {
    id:               "SCH-2026-0600004",
    code:             "SCH-2026-0600004",
    title:            "Ochtendronde kantoorvloeren",
    description:      "Controleer entree, sanitaire ruimtes en pantry.\nMeld defecten direct via de rapportage.",
    scheduledDate:    "2026-06-19",
    scheduledStart:   "07:30",
    scheduledEnd:     "09:00",
    status:           "completed",
    customerName:     "Jeroen Smit",
    contactName:      "Jeroen Smit",
    objectName:       "Kantoor Weststaete",
    objectAddress:    "Delftseplein 27",
    objectCity:       "Rotterdam",
    objectPostalCode: "3013 AA",
    phone:            "010-5551234",
    tasks:            [],
    isMock:           true,
  },
};

const FINISHED_STATUSES = new Set([
  "completed",
  "report_submitted",
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
]);

const FAILED_FINAL_STATUSES = new Set(["not_completed", "cancelled", "canceled", "afgemeld"]);

const STEP_LABELS = ["Gezien", "Gestart", "Afgerond"];

function getMockAssignment(id: string): AssignmentView | null {
  return MOCK_ASSIGNMENTS[id] ?? null;
}

function formatTimeSlot(start: string | null, end: string | null): string {
  if (start && end) return `${start.slice(0, 5)} - ${end.slice(0, 5)}`;
  if (start) return `Vanaf ${start.slice(0, 5)}`;
  return "Tijd nog niet bekend";
}

function getHeaderStatus(status: string): { label: string; background: string; color: string } {
  if (FAILED_FINAL_STATUSES.has(status)) {
    return { label: "NIET AFGEROND", background: "#FEE2E2", color: "#DC2626" };
  }
  if (FINISHED_STATUSES.has(status)) {
    return { label: "AFGEROND", background: "#E6F8ED", color: "#249357" };
  }
  if (status === "in_progress") {
    return { label: "GESTART", background: "#FFF4D8", color: "#B7790F" };
  }
  if (status === "seen" || status === "scheduled") {
    return { label: "GEZIEN", background: "#EAF5FF", color: "#2563A9" };
  }
  return { label: "NIEUW", background: "#EAF5FF", color: "#2563A9" };
}

function getActiveStep(status: string): number {
  if (FAILED_FINAL_STATUSES.has(status) || FINISHED_STATUSES.has(status)) return 2;
  if (status === "in_progress") return 1;
  return 0;
}

function StepCircle({
  index,
  activeStep,
  failedFinal,
}: {
  index: number;
  activeStep: number;
  failedFinal: boolean;
}) {
  const isDone = index < activeStep;
  const isActive = index === activeStep;
  const isFailedFinal = failedFinal && index === 2;

  if (isFailedFinal) {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FEE2E2] text-[#DC2626] ring-4 ring-[#FFF1F1]">
        <X size={19} strokeWidth={2.7} />
      </span>
    );
  }

  if (isActive) {
    return (
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full text-white ring-4 ring-[#B9F0EE]"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        {index === 1 ? <Play size={18} fill="currentColor" strokeWidth={2.4} /> : <Check size={20} strokeWidth={2.7} />}
      </span>
    );
  }

  if (isDone) {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#18BDB8] bg-white text-[#18BDB8]">
        <Check size={20} strokeWidth={2.7} />
      </span>
    );
  }

  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#D7DDE8] bg-[#E7EBF2] ring-4 ring-[#F1F3F7]" />
  );
}

function StatusProgress({ assignment }: { assignment: AssignmentView }) {
  const activeStep = getActiveStep(assignment.status);
  const failedFinal = FAILED_FINAL_STATUSES.has(assignment.status);

  return (
    <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
          Status werkbon
        </h2>
        <span className="text-[15px] font-black" style={{ color: "var(--color-primary)" }}>
          {formatTimeSlot(assignment.scheduledStart, assignment.scheduledEnd)}
        </span>
      </div>

      <div className="mt-6 flex items-start">
        {STEP_LABELS.map((label, index) => {
          const lineIsDone = index < activeStep;
          const lineIsFailed = failedFinal && index === 1;

          return (
            <div key={label} className="contents">
              <div className="flex w-16 shrink-0 flex-col items-center">
                <StepCircle index={index} activeStep={activeStep} failedFinal={failedFinal} />
                <span
                  className="mt-2 text-[12px] font-bold"
                  style={{ color: index === activeStep && !failedFinal ? "var(--color-accent)" : "var(--color-secondary)" }}
                >
                  {label}
                </span>
              </div>
              {index < STEP_LABELS.length - 1 ? (
                <div
                  className="mt-5 h-0.5 flex-1"
                  style={{ backgroundColor: lineIsFailed ? "#FCA5A5" : lineIsDone ? "var(--color-accent)" : "#D7DDE8" }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[42%_1fr] gap-4">
      <dt className="text-[14px] font-semibold leading-tight" style={{ color: "var(--color-secondary)" }}>
        {label}
      </dt>
      <dd className="text-[14px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
        {value}
      </dd>
    </div>
  );
}

function CustomerNotes({ description }: { description: string | null }) {
  const lines = description?.split("\n").filter(Boolean) ?? [];

  return (
    <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
      <h2 className="text-[15px] font-black" style={{ color: "var(--color-primary)" }}>
        Klantopmerkingen
      </h2>
      <div className="mt-4 space-y-1">
        {lines.length > 0 ? (
          lines.map((line) => (
            <p key={line} className="text-[14px] font-semibold leading-6" style={{ color: "var(--color-primary)" }}>
              {line}
            </p>
          ))
        ) : (
          <p className="text-[14px] leading-6" style={{ color: "var(--color-secondary)" }}>
            Geen klantopmerkingen beschikbaar.
          </p>
        )}
      </div>
    </section>
  );
}

export default async function WerkbonDetailPage({ params }: Props) {
  const { id } = await params;

  const databaseAssignment = await getMyAssignment(id);
  const assignment = (databaseAssignment ?? getMockAssignment(id)) as AssignmentView | null;

  if (!assignment) notFound();

  const [report, extraWork, taskCodes] = databaseAssignment
    ? await Promise.all([
        getMyReportForAssignment(id),
        getExtraWorkForAssignment(id),
        getActiveTaskCodes(),
      ])
    : [null, [], []];

  const isScheduled = assignment.status === "scheduled";
  const canStartWork = !assignment.isMock && ["plannable", "scheduled", "seen"].includes(assignment.status);
  const canCompleteWork = !assignment.isMock && assignment.status === "in_progress";
  const canSubmitReport = !assignment.isMock && (assignment.status === "completed" || assignment.status === "not_completed") && !report;
  const showReport = !!report || assignment.status === "report_submitted" || assignment.status === "report_approved";
  const canEditMeerwerk = !assignment.isMock && !["report_submitted", "report_approved", "invoice_ready", "invoiced", "paid", "closed"].includes(assignment.status);
  const statusBadge = getHeaderStatus(assignment.status);
  const companyName = assignment.objectName || assignment.customerName || assignment.title || "Niet bekend";
  const contactName = assignment.contactName || assignment.customerName || "Niet bekend";
  const postalCity = [assignment.objectPostalCode, assignment.objectCity].filter(Boolean).join(" ") || "Niet bekend";
  const phone = assignment.phone || "Niet bekend";
  const address = assignment.objectAddress || "Niet bekend";

  return (
    <div className="min-h-screen bg-[#F4F6FA] md:rounded-[32px] md:bg-white">
      <section
        className="overflow-hidden text-white md:rounded-t-[32px]"
        style={{ background: "linear-gradient(180deg, #06224A 0%, #061F44 100%)" }}
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-[calc(0.9rem+var(--safe-top))]">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/opdrachten"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white active:scale-95"
              aria-label="Terug naar planning"
            >
              <ChevronLeft size={29} strokeWidth={2.35} />
            </Link>
            <VeeleLogo />
          </div>

          <MobileHeaderActions />
        </div>

        <div className="flex items-center justify-between gap-3 px-5 pb-7 pt-4">
          <h1 className="min-w-0 truncate font-mono text-[25px] font-black leading-none tracking-tight">
            {assignment.code || "Werkbon"}
          </h1>
          <span
            className="shrink-0 rounded-full px-4 py-2 text-[13px] font-black"
            style={{ backgroundColor: statusBadge.background, color: statusBadge.color }}
          >
            {statusBadge.label}
          </span>
        </div>

        <nav className="grid grid-cols-3 px-4 text-center text-[14px] font-bold">
          <a href="#home" className="relative py-3" style={{ color: "var(--color-accent)" }}>
            Home
            <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full" style={{ backgroundColor: "var(--color-accent)" }} />
          </a>
          <a href="#werkzaamheden" className="py-3" style={{ color: "rgba(255,255,255,0.78)" }}>
            Werkzaamheden
          </a>
          <a href="#rapportage" className="py-3" style={{ color: "rgba(255,255,255,0.78)" }}>
            Rapportage
          </a>
        </nav>
      </section>

      {isScheduled && !assignment.isMock ? (
        <SeenMarker assignmentId={assignment.id} currentStatus={assignment.status} />
      ) : null}

      <section id="home" className="space-y-6 px-4 pb-8 pt-6">
        <StatusProgress assignment={assignment} />

        <section className="rounded-[18px] bg-white px-5 py-5 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
          <dl className="space-y-6">
            <InfoRow label="Bedrijfsnaam" value={companyName} />
            <InfoRow label="Contactpersoon" value={contactName} />
            <InfoRow label="Adres" value={address} />
            <InfoRow label="Postcode / Plaats" value={postalCity} />
            <InfoRow label="Telefoonnummer" value={phone} />
          </dl>
        </section>

        <CustomerNotes description={assignment.description} />

        {!assignment.isMock ? (
          <div className="space-y-4">
            {canStartWork ? <InProgressButton assignmentId={assignment.id} /> : null}
            {canCompleteWork ? <CompletionButtons assignmentId={assignment.id} /> : null}
            <MeerwerkSection
              assignmentId={assignment.id}
              initialItems={extraWork}
              taskCodes={taskCodes}
              canEdit={canEditMeerwerk}
            />
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
          </div>
        ) : null}
      </section>
    </div>
  );
}
