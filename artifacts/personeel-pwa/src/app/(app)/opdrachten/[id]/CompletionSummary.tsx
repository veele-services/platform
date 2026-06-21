"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type PointerEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Package,
  PenLine,
  ReceiptText,
} from "lucide-react";
import { completeAssignment, notCompleteAssignment } from "@/actions/assignments";
import type { ExtraWorkItem } from "@/actions/extra-work";
import type { ReportNote } from "@/actions/reports";
import {
  enqueueOfflineWorkOrderAction,
  isOfflineNow,
} from "@/lib/offline/work-order-queue";
import {
  NOT_COMPLETED_REASONS,
  calculateExtraWorkLineTotal,
  calculateMaterialLineTotal,
  formatMoney,
  formatQuantity,
  getTaskCompletionCount,
  parseNumber,
  type AssignmentView,
  type MaterialUsageItem,
} from "./work-order-data";

type CompletionMode = "completed" | "not_completed";

type Props = {
  assignment:    AssignmentView;
  mode:          CompletionMode;
  extraWork:     ExtraWorkItem[];
  materials:     MaterialUsageItem[];
  reportNotes:   ReportNote[];
};

type AccordionProps = {
  icon:        ReactNode;
  title:       string;
  subtitle:    string;
  rightLabel?: string;
  defaultOpen?: boolean;
  children:    ReactNode;
};

function formatNoteDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day:      "2-digit",
    month:    "2-digit",
    year:     "numeric",
    hour:     "2-digit",
    minute:   "2-digit",
  }).format(new Date(value));
}

function SummaryAccordion({
  icon,
  title,
  subtitle,
  rightLabel,
  defaultOpen = false,
  children,
}: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-[18px] bg-white shadow-sm" style={{ boxShadow: "0 12px 28px rgba(8,29,58,0.06)" }}>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:scale-[0.995]"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E9FBF8]" style={{ color: "var(--color-accent)" }}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
            {title}
          </span>
          <span className="mt-0.5 block truncate text-[11px] font-semibold leading-tight" style={{ color: "var(--color-secondary)" }}>
            {subtitle}
          </span>
        </span>
        {rightLabel ? (
          <span className="shrink-0 text-right text-[13px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
            {rightLabel}
          </span>
        ) : null}
        <ChevronDown
          size={18}
          strokeWidth={2.4}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--color-secondary)" }}
        />
      </button>
      {open ? (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function TaskRows({ assignment, mode }: { assignment: AssignmentView; mode: CompletionMode }) {
  const tasks = [...assignment.tasks].sort((a, b) => a.sortOrder - b.sortOrder);
  const completedCount = mode === "completed" ? tasks.length : getTaskCompletionCount(assignment);

  if (tasks.length === 0) {
    return <p className="text-[13px]" style={{ color: "var(--color-secondary)" }}>Geen werkzaamheden gekoppeld.</p>;
  }

  return (
    <div className="space-y-2.5">
      {tasks.map((task, index) => {
        const done = index < completedCount;
        return (
          <div key={task.id} className="flex items-start gap-2.5">
            <span
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
              style={{
                backgroundColor: done ? "var(--color-accent)" : "#FFFFFF",
                borderColor:     done ? "var(--color-accent)" : "var(--color-border)",
                color:           done ? "#FFFFFF" : "transparent",
              }}
            >
              <Check size={12} strokeWidth={3} />
            </span>
            <span className="text-[13px] font-semibold leading-5" style={{ color: "var(--color-primary)" }}>
              {task.notes ?? "Werkzaamheid"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ExtraWorkRows({ items }: { items: ExtraWorkItem[] }) {
  if (items.length === 0) {
    return <p className="text-[13px]" style={{ color: "var(--color-secondary)" }}>Geen meerwerk geregistreerd.</p>;
  }

  const total = items.reduce((sum, item) => sum + calculateExtraWorkLineTotal(item), 0);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold" style={{ color: "var(--color-primary)" }}>
              {item.description}
            </p>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-secondary)" }}>
              {item.hours ? `${formatQuantity(parseNumber(item.hours))} uur` : "1 item"}
            </p>
          </div>
          <span className="text-[13px] font-black" style={{ color: "var(--color-primary)" }}>
            {formatMoney(calculateExtraWorkLineTotal(item))}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
        <span className="text-[13px] font-black" style={{ color: "var(--color-primary)" }}>Totaal meerwerk</span>
        <span className="text-[13px] font-black" style={{ color: "var(--color-primary)" }}>{formatMoney(total)}</span>
      </div>
    </div>
  );
}

function MaterialRows({ items }: { items: MaterialUsageItem[] }) {
  if (items.length === 0) {
    return <p className="text-[13px]" style={{ color: "var(--color-secondary)" }}>Geen materiaal geregistreerd.</p>;
  }

  const total = items.reduce((sum, item) => sum + calculateMaterialLineTotal(item), 0);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold" style={{ color: "var(--color-primary)" }}>
              {item.name}
            </p>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-secondary)" }}>
              {formatQuantity(item.quantity)} x {formatMoney(item.unitPrice)}
            </p>
          </div>
          <span className="text-[13px] font-black" style={{ color: "var(--color-primary)" }}>
            {formatMoney(calculateMaterialLineTotal(item))}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
        <span className="text-[13px] font-black" style={{ color: "var(--color-primary)" }}>Totaal materiaal</span>
        <span className="text-[13px] font-black" style={{ color: "var(--color-primary)" }}>{formatMoney(total)}</span>
      </div>
    </div>
  );
}

function ReportNoteRows({ notes }: { notes: ReportNote[] }) {
  if (notes.length === 0) {
    return <p className="text-[13px]" style={{ color: "var(--color-secondary)" }}>Geen rapportagenotities vastgelegd.</p>;
  }

  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <article key={note.id} className="rounded-2xl border bg-white px-3 py-2.5" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-bold" style={{ color: "var(--color-secondary)" }}>
            <span>{formatNoteDate(note.createdAt)}</span>
            <span className="font-black" style={{ color: "var(--color-primary)" }}>{note.authorName}:</span>
          </div>
          <p className="mt-1 whitespace-pre-line text-[13px] font-semibold leading-5" style={{ color: "var(--color-primary)" }}>
            {note.body}
          </p>
          {note.attachments.length > 0 ? (
            <p className="mt-2 text-[12px] font-bold" style={{ color: "var(--color-accent)" }}>
              {note.attachments.length} bijlage{note.attachments.length === 1 ? "" : "n"}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function SignaturePad({
  required,
  onChange,
}: {
  required: boolean;
  onChange: (value: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !required) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#081D3A";
  }, [required]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const rect = canvas!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!required) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!required || !drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function handlePointerUp() {
    if (!required || !drawingRef.current) return;
    drawingRef.current = false;
    const dataUrl = canvasRef.current?.toDataURL("image/png") ?? null;
    setHasSignature(true);
    onChange(dataUrl);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange(null);
  }

  return (
    <section className="rounded-[18px] bg-white px-4 py-4 shadow-sm" style={{ boxShadow: "0 12px 28px rgba(8,29,58,0.06)" }}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-black" style={{ color: "var(--color-primary)" }}>
          Handtekening klant {required ? "" : "(niet nodig)"}
        </h2>
        {required && hasSignature ? (
          <button type="button" className="text-[12px] font-black" style={{ color: "var(--color-accent)" }} onClick={clear}>
            Wissen
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--color-secondary)" }}>
        De klant gaat akkoord met de uitgevoerde werkzaamheden, eventueel meerwerk, gebruikte materialen en rapportage.
      </p>
      <div className={`mt-3 rounded-2xl border bg-white ${required ? "" : "opacity-55"}`} style={{ borderColor: "var(--color-border)" }}>
        {required ? (
          <canvas
            ref={canvasRef}
            className="h-36 w-full touch-none rounded-2xl"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        ) : (
          <div className="flex h-28 items-center justify-center px-4 text-center text-[13px] font-semibold" style={{ color: "var(--color-secondary)" }}>
            Handtekening is voor deze klantafspraak niet verplicht.
          </div>
        )}
      </div>
    </section>
  );
}

function NotCompletedForm({
  reason,
  notes,
  onReasonChange,
  onNotesChange,
}: {
  reason:         string;
  notes:          string;
  onReasonChange: (value: string) => void;
  onNotesChange:  (value: string) => void;
}) {
  return (
    <section className="rounded-[18px] bg-white px-4 py-4 shadow-sm" style={{ boxShadow: "0 12px 28px rgba(8,29,58,0.06)" }}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FEF2F2] text-[#DC2626]">
          <AlertTriangle size={18} strokeWidth={2.4} />
        </span>
        <div>
          <h2 className="text-[14px] font-black" style={{ color: "var(--color-primary)" }}>Bon afmelden / niet afgerond</h2>
          <p className="mt-1 text-[12px] leading-5" style={{ color: "var(--color-secondary)" }}>
            Kies de reden en voeg waar nodig een toelichting toe.
          </p>
        </div>
      </div>

      <label className="mt-4 block text-[12px] font-black uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
        Reden
        <select
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          className="mt-1.5 block w-full rounded-2xl border bg-white px-3 py-3 text-[14px] font-bold outline-none"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        >
          <option value="">Selecteer reden</option>
          {NOT_COMPLETED_REASONS.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>

      <label className="mt-3 block text-[12px] font-black uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
        Opmerking
        <textarea
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          rows={4}
          className="mt-1.5 block w-full resize-none rounded-2xl border bg-white px-3 py-3 text-[14px] font-semibold outline-none"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
          placeholder="Beschrijf kort wat er op locatie is gebeurd."
        />
      </label>
    </section>
  );
}

function CostOverview({ extraTotal, materialTotal }: { extraTotal: number; materialTotal: number }) {
  const total = extraTotal + materialTotal;

  return (
    <section className="rounded-[18px] bg-white px-4 py-4 shadow-sm" style={{ boxShadow: "0 12px 28px rgba(8,29,58,0.06)" }}>
      <h2 className="text-[14px] font-black" style={{ color: "var(--color-primary)" }}>Overzicht extra kosten</h2>
      <div className="mt-3 space-y-2 text-[13px]">
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--color-secondary)" }}>Meerwerk</span>
          <span className="font-black" style={{ color: "var(--color-primary)" }}>{formatMoney(extraTotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--color-secondary)" }}>Materialen</span>
          <span className="font-black" style={{ color: "var(--color-primary)" }}>{formatMoney(materialTotal)}</span>
        </div>
        <div className="flex items-center justify-between border-t pt-3 text-[14px] font-black" style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}>
          <span>Totaal</span>
          <span>{formatMoney(total)}</span>
        </div>
      </div>
    </section>
  );
}

export function CompletionSummary({ assignment, mode, extraWork, materials, reportNotes }: Props) {
  const router = useRouter();
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const taskCount = assignment.tasks.length;
  const completedTaskCount = mode === "completed" ? taskCount : getTaskCompletionCount(assignment);
  const extraTotal = useMemo(() => extraWork.reduce((sum, item) => sum + calculateExtraWorkLineTotal(item), 0), [extraWork]);
  const materialTotal = useMemo(() => materials.reduce((sum, item) => sum + calculateMaterialLineTotal(item), 0), [materials]);
  const canSubmit = assignment.status === "in_progress";

  function handleSubmit() {
    setError(null);
    setNotice(null);

    if (!canSubmit) {
      setError("Deze werkbon moet eerst gestart zijn voordat je hem kunt afronden of afmelden.");
      return;
    }
    if (mode === "completed" && assignment.customerSignatureRequired && !signatureDataUrl) {
      setError("Laat de klant eerst tekenen om de werkbon definitief gereed te melden.");
      return;
    }
    if (mode === "not_completed" && !reason) {
      setError("Kies een reden voor het afmelden van de bon.");
      return;
    }

    if (isOfflineNow()) {
      if (mode === "completed") {
        enqueueOfflineWorkOrderAction({
          type: "complete-assignment",
          assignmentId: assignment.id,
          payload: {
            customerSignatureDataUrl: signatureDataUrl,
          },
        });
      } else {
        enqueueOfflineWorkOrderAction({
          type: "not-complete-assignment",
          assignmentId: assignment.id,
          payload: {
            reason,
            notes,
          },
        });
      }

      setNotice("Bevestiging is offline opgeslagen en wordt automatisch gesynchroniseerd.");
      window.setTimeout(() => {
        router.push(`/opdrachten/${assignment.id}`);
      }, 850);
      return;
    }

    startTransition(async () => {
      const result = mode === "completed"
        ? await completeAssignment(assignment.id, { customerSignatureDataUrl: signatureDataUrl })
        : await notCompleteAssignment(assignment.id, { reason, notes });

      if (!result.success) {
        setError(result.error ?? "Opslaan mislukt");
        return;
      }

      router.push(`/opdrachten/${assignment.id}`);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 px-3.5 pb-32 pt-4">
      <div className="flex items-start justify-between gap-3 px-1">
        <div>
          <h1 className="text-[22px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
            Werkbon {mode === "completed" ? "afronden" : "afmelden"}
          </h1>
          <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--color-secondary)" }}>
            Controleer de samenvatting voordat je bevestigt.
          </p>
        </div>
      </div>

      <SummaryAccordion
        icon={<ClipboardCheck size={18} strokeWidth={2.4} />}
        title="Werkzaamheden"
        subtitle={`${completedTaskCount} afgerond, ${Math.max(taskCount - completedTaskCount, 0)} openstaand`}
        rightLabel={`${taskCount} taken`}
        defaultOpen
      >
        <TaskRows assignment={assignment} mode={mode} />
      </SummaryAccordion>

      <SummaryAccordion
        icon={<ReceiptText size={18} strokeWidth={2.4} />}
        title="Meerwerk"
        subtitle="Totaal extra kosten"
        rightLabel={formatMoney(extraTotal)}
      >
        <ExtraWorkRows items={extraWork} />
      </SummaryAccordion>

      <SummaryAccordion
        icon={<Package size={18} strokeWidth={2.4} />}
        title="Materialen"
        subtitle="Totaal verbruik"
        rightLabel={formatMoney(materialTotal)}
      >
        <MaterialRows items={materials} />
      </SummaryAccordion>

      <SummaryAccordion
        icon={<FileText size={18} strokeWidth={2.4} />}
        title="Rapportage"
        subtitle={reportNotes[0]?.body.split("\n")[0] ?? "Geen notities"}
        rightLabel={reportNotes.length > 0 ? `${reportNotes.length}` : undefined}
      >
        <ReportNoteRows notes={reportNotes} />
      </SummaryAccordion>

      <CostOverview extraTotal={extraTotal} materialTotal={materialTotal} />

      {mode === "completed" ? (
        <SignaturePad required={assignment.customerSignatureRequired} onChange={setSignatureDataUrl} />
      ) : (
        <NotCompletedForm
          reason={reason}
          notes={notes}
          onReasonChange={setReason}
          onNotesChange={setNotes}
        />
      )}

      {error ? (
        <p className="rounded-2xl px-4 py-3 text-[13px] font-bold" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-2xl px-4 py-3 text-[13px] font-bold" style={{ backgroundColor: "#E9FBF8", color: "#0A837F" }}>
          {notice}
        </p>
      ) : null}

      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-[18px] px-5 py-4 text-[15px] font-black text-white shadow-lg transition-opacity disabled:opacity-60"
        style={{ backgroundColor: mode === "completed" ? "var(--color-accent)" : "#DC2626" }}
        disabled={isPending}
        onClick={handleSubmit}
      >
        <PenLine size={18} strokeWidth={2.4} />
        {isPending
          ? "Opslaan..."
          : mode === "completed"
            ? "Definitief gereedmelden"
            : "Bon afmelden"}
      </button>
    </section>
  );
}
