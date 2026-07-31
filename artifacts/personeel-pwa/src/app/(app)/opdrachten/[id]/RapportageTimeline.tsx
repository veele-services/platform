"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  Send,
  ShieldAlert,
  Trash2,
  Video,
  X,
} from "lucide-react";
import {
  addReportNote,
  prepareReportNoteAttachmentUploads,
  type ReportNote,
  type ReportNoteAttachment,
} from "@/actions/reports";
import {
  enqueueOfflineWorkOrderAction,
  isOfflineNow,
} from "@/lib/offline/work-order-queue";
import { createClient } from "@/lib/supabase/client";
import {
  ASSIGNMENT_MEDIA_BUCKET,
  MAX_ASSIGNMENT_IMAGE_BYTES,
  MAX_ASSIGNMENT_VIDEO_BYTES,
  MAX_REPORT_NOTE_ATTACHMENTS,
  formatUploadLimit,
} from "@/lib/uploads/assignment-media";
import {
  compressImageIfUseful,
  validateAssignmentMediaFile,
} from "@/lib/uploads/client-assignment-media";
import { RadioGroup, RadioGroupItem, Switch } from "@workspace/shared-ui";
import type { StructuredReportNoteV1 } from "@workspace/db";

type Props = {
  assignmentId: string;
  expectedParticipantVersion: number | null;
  initialNotes: ReportNote[];
  canAdd:       boolean;
  canPersist:   boolean;
};

type ReportKind = "work-report" | "particularity" | "incident";
type ExecutionStatus = "as-planned" | "partially-completed" | "not-completed";
type CustomerContactStatus = "yes" | "no" | "not-applicable";

type StructuredReport = {
  kind:               string;
  executionStatus:    string;
  customerContact:    string;
  workPerformed:      string;
  particulars:        string;
  followUp:           string;
};

const REPORT_KINDS: {
  value: ReportKind;
  label: string;
  description: string;
  icon: typeof ClipboardCheck;
}[] = [
  {
    value:       "work-report",
    label:       "Werkverslag",
    description: "Reguliere uitvoering",
    icon:        ClipboardCheck,
  },
  {
    value:       "particularity",
    label:       "Bijzonderheid",
    description: "Afwijking of aandachtspunt",
    icon:        AlertTriangle,
  },
  {
    value:       "incident",
    label:       "Incident",
    description: "Veiligheid of schade",
    icon:        ShieldAlert,
  },
];

const EXECUTION_STATUSES: {
  value: ExecutionStatus;
  label: string;
  shortLabel: string;
  color: string;
  backgroundColor: string;
}[] = [
  {
    value:           "as-planned",
    label:           "Alles volgens planning uitgevoerd",
    shortLabel:      "Volgens planning",
    color:           "#047857",
    backgroundColor: "#ECFDF5",
  },
  {
    value:           "partially-completed",
    label:           "Werkzaamheden deels uitgevoerd",
    shortLabel:      "Deels uitgevoerd",
    color:           "#B45309",
    backgroundColor: "#FFFBEB",
  },
  {
    value:           "not-completed",
    label:           "Werkzaamheden niet uitgevoerd",
    shortLabel:      "Niet uitgevoerd",
    color:           "#B91C1C",
    backgroundColor: "#FEF2F2",
  },
];

const CUSTOMER_CONTACT_OPTIONS: { value: CustomerContactStatus; label: string }[] = [
  { value: "yes", label: "Ja" },
  { value: "no", label: "Nee" },
  { value: "not-applicable", label: "Niet van toepassing" },
];

const STRUCTURED_REPORT_PREFIX = "Werkrapportage · ";

function selectedLabel<T extends string>(
  options: { value: T; label: string }[],
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function buildStructuredReportBody(input: {
  kind:                  ReportKind;
  executionStatus:       ExecutionStatus;
  customerContactStatus: CustomerContactStatus;
  workPerformed:         string;
  particulars:           string;
  followUp:              string;
}): string {
  const kind = selectedLabel(REPORT_KINDS, input.kind);
  const executionStatus =
    EXECUTION_STATUSES.find((option) => option.value === input.executionStatus)?.shortLabel ??
    input.executionStatus;
  const customerContact = selectedLabel(CUSTOMER_CONTACT_OPTIONS, input.customerContactStatus);

  return [
    `${STRUCTURED_REPORT_PREFIX}${kind}`,
    `Uitvoering: ${executionStatus}`,
    `Klant geïnformeerd: ${customerContact}`,
    "",
    "Uitgevoerde werkzaamheden",
    input.workPerformed.trim(),
    "",
    "Bijzonderheden",
    input.particulars.trim() || "Geen bijzonderheden gemeld.",
    "",
    "Vervolgactie",
    input.followUp.trim() || "Geen vervolgactie nodig.",
  ].join("\n");
}

function buildStructuredReportData(input: {
  kind:                  ReportKind;
  executionStatus:       ExecutionStatus;
  customerContactStatus: CustomerContactStatus;
  workPerformed:         string;
  particulars:           string;
  followUp:              string;
}): StructuredReportNoteV1 {
  return {
    version: 1,
    kind: input.kind,
    executionStatus: input.executionStatus,
    customerContactStatus: input.customerContactStatus,
    workPerformed: input.workPerformed.trim(),
    particulars: input.particulars.trim(),
    followUp: input.followUp.trim(),
  };
}

function structuredReportForDisplay(input: StructuredReportNoteV1): StructuredReport {
  return {
    kind: selectedLabel(REPORT_KINDS, input.kind),
    executionStatus:
      EXECUTION_STATUSES.find((option) => option.value === input.executionStatus)
        ?.shortLabel ?? input.executionStatus,
    customerContact: selectedLabel(
      CUSTOMER_CONTACT_OPTIONS,
      input.customerContactStatus,
    ),
    workPerformed: input.workPerformed,
    particulars: input.particulars || "Geen bijzonderheden gemeld.",
    followUp: input.followUp || "Geen vervolgactie nodig.",
  };
}

function parseStructuredReportBody(body: string): StructuredReport | null {
  if (!body.startsWith(STRUCTURED_REPORT_PREFIX)) return null;

  const match = body.match(
    /^Werkrapportage · (.+)\nUitvoering: (.+)\nKlant geïnformeerd: (.+)\n\nUitgevoerde werkzaamheden\n([\s\S]*?)\n\nBijzonderheden\n([\s\S]*?)\n\nVervolgactie\n([\s\S]*)$/u,
  );
  if (!match) return null;

  return {
    kind:            match[1]?.trim() ?? "",
    executionStatus: match[2]?.trim() ?? "",
    customerContact: match[3]?.trim() ?? "",
    workPerformed:   match[4]?.trim() ?? "",
    particulars:     match[5]?.trim() ?? "",
    followUp:        match[6]?.trim() ?? "",
  };
}

type LocalFile = {
  id:         string;
  file:       File;
  previewUrl: string | null;
  status:     "ready" | "compressing" | "preparing" | "uploading" | "uploaded" | "failed";
  progress:   number;
  error:      string | null;
  uploaded:   {
    storagePath: string;
    fileName:    string;
    mimeType:    string | null;
    fileSize:    number;
  } | null;
};

function formatNoteDate(iso: string): { date: string; time: string } {
  const date = new Date(iso);

  return {
    date: new Intl.DateTimeFormat("nl-NL", {
      day:   "2-digit",
      month: "2-digit",
      year:  "numeric",
    }).format(date),
    time: new Intl.DateTimeFormat("nl-NL", {
      hour:   "2-digit",
      minute: "2-digit",
    }).format(date),
  };
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("nl-NL", {
    maximumFractionDigits: 1,
  })} MB`;
}

function fileKind(mimeType: string | null): "image" | "video" | "file" {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("video/")) return "video";
  return "file";
}

function extensionLabel(fileName: string, mimeType: string | null): string {
  const extension = fileName.split(".").pop()?.toUpperCase();
  if (extension) return extension;
  if (mimeType?.startsWith("image/")) return "AFB";
  if (mimeType?.startsWith("video/")) return "VIDEO";
  return "BESTAND";
}

function AttachmentPreview({ attachment }: { attachment: ReportNoteAttachment }) {
  const kind = fileKind(attachment.mimeType);
  const size = formatFileSize(attachment.fileSize);
  const meta = [extensionLabel(attachment.fileName, attachment.mimeType), size].filter(Boolean).join(" - ");

  return (
    <a
      href={attachment.signedUrl ?? undefined}
      target={attachment.signedUrl ? "_blank" : undefined}
      rel="noreferrer"
      className="mt-3 grid grid-cols-[72px_1fr_auto] items-center gap-3 rounded-2xl border bg-[#FAFBFD] p-2"
      style={{ borderColor: "var(--color-border)" }}
    >
      <span className="flex h-[58px] w-[72px] overflow-hidden rounded-xl bg-[#EAF8F7]">
        {kind === "image" && attachment.signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={attachment.signedUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[var(--color-accent-accessible)]">
            {kind === "video" ? <Video size={24} strokeWidth={2.2} /> : <ImageIcon size={24} strokeWidth={2.2} />}
          </span>
        )}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
          {attachment.fileName}
        </span>
        <span className="mt-1 block text-[13px] font-semibold" style={{ color: "var(--color-secondary)" }}>
          {meta}
        </span>
      </span>

      <ChevronRight size={23} strokeWidth={2.35} style={{ color: "var(--color-secondary)" }} />
    </a>
  );
}

function LocalFileRow({
  item,
  onRemove,
  onRetry,
}: {
  item:     LocalFile;
  onRemove: (id: string) => void;
  onRetry:  (id: string) => void;
}) {
  const kind = fileKind(item.file.type || null);
  const meta = [extensionLabel(item.file.name, item.file.type || null), formatFileSize(item.file.size)].filter(Boolean).join(" - ");
  const isBusy = item.status === "compressing" || item.status === "preparing" || item.status === "uploading";
  const statusLabel = {
    ready:       "Klaar voor upload",
    compressing: "Comprimeren",
    preparing:  "Upload voorbereiden",
    uploading:  "Uploaden",
    uploaded:   "Geupload",
    failed:     "Mislukt",
  }[item.status];

  return (
    <div className="rounded-2xl border bg-[#FAFBFD] p-2" style={{ borderColor: item.status === "failed" ? "#FECACA" : "var(--color-border)" }}>
      <div className="grid grid-cols-[56px_1fr_auto] items-center gap-3">
      <span className="flex h-12 w-14 overflow-hidden rounded-xl bg-[#EAF8F7]">
        {kind === "image" && item.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[var(--color-accent-accessible)]">
            {kind === "video" ? <Video size={20} strokeWidth={2.2} /> : <FileText size={20} strokeWidth={2.2} />}
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--color-primary)" }}>
          {item.file.name}
        </span>
        <span className="block text-[12px] font-semibold" style={{ color: "var(--color-secondary)" }}>
          {meta}
        </span>
        <span
          className="mt-1 block text-[11px] font-semibold"
          style={{ color: item.status === "failed" ? "#DC2626" : item.status === "uploaded" ? "#059669" : "var(--color-secondary)" }}
        >
          {statusLabel}
        </span>
      </span>
      <div className="flex items-center gap-1.5">
        {item.status === "failed" ? (
          <button
            type="button"
            onClick={() => onRetry(item.id)}
            className="rounded-full border px-3 py-1.5 text-[11px] font-semibold"
            style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
          >
            Opnieuw
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          disabled={isBusy}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full border disabled:opacity-40"
          style={{ borderColor: "#FECACA", color: "#DC2626" }}
          aria-label="Bijlage verwijderen"
        >
          <Trash2 size={15} />
        </button>
      </div>
      </div>
      {item.status !== "ready" ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${item.progress}%`,
              backgroundColor: item.status === "failed" ? "#DC2626" : "var(--color-accent)",
            }}
          />
        </div>
      ) : null}
      {item.error ? (
        <p className="mt-2 rounded-xl px-2 py-1 text-[11px] font-bold" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
          {item.error}
        </p>
      ) : null}
    </div>
  );
}

function ReportNoteCard({ note }: { note: ReportNote }) {
  const { date, time } = formatNoteDate(note.createdAt);
  const report = note.structuredData
    ? structuredReportForDisplay(note.structuredData)
    : parseStructuredReportBody(note.body);
  const statusStyle =
    EXECUTION_STATUSES.find((option) => option.shortLabel === report?.executionStatus) ??
    EXECUTION_STATUSES[0];

  return (
    <article className="rounded-[18px] border bg-white px-4 py-4 shadow-sm" style={{ borderColor: "var(--color-border)", boxShadow: "0 12px 28px rgba(8,29,58,0.06)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[14px] font-semibold" style={{ color: "var(--color-secondary)" }}>
              {date}
            </span>
            <span className="text-[14px] font-semibold" style={{ color: "var(--color-secondary)" }}>
              {time}
            </span>
          </div>
          <span className="mt-1 block text-[14px] font-semibold" style={{ color: "var(--color-primary)" }}>
            {note.authorName}
          </span>
        </div>

        {report ? (
          <span
            className="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{ backgroundColor: "#E9FBF8", color: "#087F7B" }}
          >
            {report.kind}
          </span>
        ) : null}
      </div>

      {report ? (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
              style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}
            >
              <CheckCircle2 size={14} strokeWidth={2.6} />
              {report.executionStatus}
            </span>
            <span
              className="rounded-full px-3 py-1.5 text-[12px] font-bold"
              style={{ backgroundColor: "#F1F5F9", color: "var(--color-secondary)" }}
            >
              Klant geïnformeerd: {report.customerContact.toLowerCase()}
            </span>
          </div>

          <div className="mt-4 space-y-4">
            <ReportSection title="Uitgevoerde werkzaamheden" body={report.workPerformed} />
            <ReportSection title="Bijzonderheden" body={report.particulars} />
            <ReportSection title="Vervolgactie" body={report.followUp} />
          </div>
        </div>
      ) : (
        <p className="mt-4 whitespace-pre-wrap text-[16px] font-medium leading-7" style={{ color: "var(--color-primary)" }}>
          {note.body}
        </p>
      )}

      {note.attachments.map((attachment) => (
        <AttachmentPreview key={attachment.id} attachment={attachment} />
      ))}
    </article>
  );
}

function ReportSection({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-l-[3px] pl-3" style={{ borderColor: "var(--color-accent)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-secondary)" }}>
        {title}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-[15px] font-semibold leading-6" style={{ color: "var(--color-primary)" }}>
        {body}
      </p>
    </div>
  );
}

export function RapportageTimeline({
  assignmentId,
  expectedParticipantVersion,
  initialNotes,
  canAdd,
  canPersist,
}: Props) {
  const [notes, setNotes] = useState<ReportNote[]>(initialNotes);
  const [showForm, setShowForm] = useState(false);
  const [reportKind, setReportKind] = useState<ReportKind>("work-report");
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>("as-planned");
  const [workPerformed, setWorkPerformed] = useState("");
  const [particulars, setParticulars] = useState("");
  const [followUpNeeded, setFollowUpNeeded] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [customerContactStatus, setCustomerContactStatus] =
    useState<CustomerContactStatus>("not-applicable");
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sortedNotes = useMemo(
    () => [...notes].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [notes],
  );

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    if (isOfflineNow()) {
      setError("Bijlagen en foto's zijn online-only. Voeg ze toe zodra je verbinding hebt; tekstnotities kun je offline opslaan.");
      return;
    }

    const slotsLeft = Math.max(0, MAX_REPORT_NOTE_ATTACHMENTS - files.length);
    if (slotsLeft <= 0) {
      setError(`Maximaal ${MAX_REPORT_NOTE_ATTACHMENTS} bijlagen per notitie toegestaan`);
      return;
    }

    const accepted: LocalFile[] = [];
    const rejected: string[] = [];

    for (const file of Array.from(fileList)) {
      if (accepted.length >= slotsLeft) {
        rejected.push(`Maximaal ${MAX_REPORT_NOTE_ATTACHMENTS} bijlagen per notitie toegestaan`);
        break;
      }

      const validation = validateAssignmentMediaFile(file);
      if (!validation.valid) {
        rejected.push(`${file.name}: ${validation.error}`);
        continue;
      }

      accepted.push({
        id:         `${file.name}-${file.lastModified}-${crypto.randomUUID?.() ?? Date.now()}`,
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        status:     "ready",
        progress:   0,
        error:      null,
        uploaded:   null,
      });
    }

    if (accepted.length > 0) {
      setFiles((current) => [...current, ...accepted].slice(0, MAX_REPORT_NOTE_ATTACHMENTS));
    }
    setError(rejected[0] ?? null);
  }

  function removeFile(id: string) {
    setFiles((current) => {
      const file = current.find((item) => item.id === id);
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      if (file?.uploaded?.storagePath) {
        void createClient().storage.from(ASSIGNMENT_MEDIA_BUCKET).remove([file.uploaded.storagePath]);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  function retryFile(id: string) {
    setFiles((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, status: "ready", progress: 0, error: null, uploaded: null }
          : item,
      ),
    );
  }

  function updateLocalFile(id: string, patch: Partial<LocalFile>) {
    setFiles((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function resetForm() {
    files.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setFiles([]);
    setReportKind("work-report");
    setExecutionStatus("as-planned");
    setWorkPerformed("");
    setParticulars("");
    setFollowUpNeeded(false);
    setFollowUp("");
    setCustomerContactStatus("not-applicable");
    setError(null);
    setShowForm(false);
  }

  async function uploadFiles(): Promise<{
    storagePath: string;
    fileName: string;
    mimeType: string | null;
    fileSize: number;
  }[]> {
    const supabase = createClient();
    const alreadyUploaded = files
      .map((item) => item.uploaded)
      .filter((item): item is NonNullable<LocalFile["uploaded"]> => !!item);

    const pendingFiles = files.filter((item) => !item.uploaded);
    if (pendingFiles.length === 0) return alreadyUploaded;

    const preparedFiles: { item: LocalFile; file: File }[] = [];

    for (const item of pendingFiles) {
      updateLocalFile(item.id, { status: "compressing", progress: 12, error: null });
      const uploadFile = await compressImageIfUseful(item.file);
      const validation = validateAssignmentMediaFile(uploadFile);
      if (!validation.valid) {
        updateLocalFile(item.id, { status: "failed", progress: 100, error: validation.error });
        throw new Error(validation.error);
      }
      preparedFiles.push({ item, file: uploadFile });
      updateLocalFile(item.id, { status: "preparing", progress: 26 });
    }

    const prepared = await prepareReportNoteAttachmentUploads(
      assignmentId,
      preparedFiles.map(({ item, file }) => ({
        clientId: item.id,
        fileName: file.name,
        mimeType: file.type || null,
        fileSize: file.size,
      })),
    );

    if (!prepared.success || !prepared.uploads) {
      pendingFiles.forEach((item) => {
        updateLocalFile(item.id, {
          status: "failed",
          progress: 100,
          error: prepared.error ?? "Upload voorbereiden mislukt",
        });
      });
      throw new Error(prepared.error ?? "Upload voorbereiden mislukt");
    }

    const preparedById = new Map(prepared.uploads.map((upload) => [upload.clientId, upload]));
    const uploaded: {
      storagePath: string;
      fileName: string;
      mimeType: string | null;
      fileSize: number;
    }[] = [...alreadyUploaded];
    let failed = false;

    for (const { item, file } of preparedFiles) {
      const upload = preparedById.get(item.id);
      if (!upload) {
        updateLocalFile(item.id, { status: "failed", progress: 100, error: "Uploadvoorbereiding ontbreekt" });
        failed = true;
        continue;
      }

      updateLocalFile(item.id, { status: "uploading", progress: 48, error: null });
      const { error: uploadError } = await supabase.storage
        .from(ASSIGNMENT_MEDIA_BUCKET)
        .uploadToSignedUrl(upload.storagePath, upload.token, file, {
          contentType: upload.mimeType,
        });

      if (uploadError) {
        updateLocalFile(item.id, { status: "failed", progress: 100, error: uploadError.message || "Upload mislukt" });
        failed = true;
        continue;
      }

      const record = {
        storagePath: upload.storagePath,
        fileName:    upload.fileName,
        mimeType:    upload.mimeType,
        fileSize:    upload.fileSize,
      };

      uploaded.push(record);
      updateLocalFile(item.id, { status: "uploaded", progress: 100, error: null, uploaded: record });
    }

    if (failed) throw new Error("Niet alle bijlagen zijn geupload. Probeer mislukte bijlagen opnieuw.");

    return uploaded;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!workPerformed.trim()) {
      setError("Beschrijf welke werkzaamheden zijn uitgevoerd");
      return;
    }
    if (
      (reportKind === "incident" || executionStatus !== "as-planned") &&
      !particulars.trim()
    ) {
      setError("Beschrijf de bijzonderheid of reden van de afwijking");
      return;
    }
    if (followUpNeeded && !followUp.trim()) {
      setError("Beschrijf welke vervolgactie nodig is");
      return;
    }

    const structuredData = buildStructuredReportData({
      kind:                  reportKind,
      executionStatus,
      customerContactStatus,
      workPerformed,
      particulars,
      followUp:              followUpNeeded ? followUp : "",
    });
    const trimmedBody = buildStructuredReportBody(structuredData);

    startTransition(async () => {
      if (!canPersist || isOfflineNow()) {
        if (files.length > 0 && isOfflineNow()) {
          setError("Bijlagen kunnen pas online worden geupload. Sla de rapportage zonder bijlage op of probeer opnieuw zodra je online bent.");
          return;
        }

        const now = new Date().toISOString();
        setNotes((current) => [
          {
            id:          `local-report-note-${Date.now()}`,
            body:        trimmedBody,
            structuredData,
            authorName:  "Backoffice",
            createdAt:   now,
            attachments: files.map((item) => ({
              id:          item.id,
              storagePath: "",
              signedUrl:   item.previewUrl,
              fileName:    item.file.name,
              mimeType:    item.file.type || null,
              fileSize:    item.file.size,
              createdAt:   now,
            })),
          },
          ...current,
        ]);
        if (isOfflineNow()) {
          enqueueOfflineWorkOrderAction({
            type: "add-report-note",
            assignmentId,
            expectedParticipantVersion,
            payload: { body: trimmedBody, structuredData },
          });
        }
        resetForm();
        return;
      }

      let uploaded: Awaited<ReturnType<typeof uploadFiles>> = [];
      try {
        uploaded = await uploadFiles();
        const result = await addReportNote(assignmentId, {
          body:        trimmedBody,
          structuredData,
          attachments: uploaded,
        });

        if (!result.success || !result.note) {
          if (uploaded.length > 0) {
            await createClient().storage.from(ASSIGNMENT_MEDIA_BUCKET).remove(uploaded.map((item) => item.storagePath));
          }
          setError(result.error ?? "Rapportage opslaan mislukt");
          return;
        }

        setNotes((current) => [result.note!, ...current]);
        resetForm();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Bijlage uploaden of rapportage opslaan mislukt");
      }
    });
  }

  return (
    <section className="rounded-[24px] bg-white px-4 py-5 shadow-sm" style={{ boxShadow: "0 16px 36px rgba(8,29,58,0.08)" }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
            Rapportage
          </h2>
          <p className="mt-1 text-[13px] font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>
            Leg de uitvoering, bijzonderheden en benodigde opvolging vast.
          </p>
        </div>

        {canAdd ? (
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-2xl px-3 text-[13px] font-semibold text-white shadow-lg active:scale-95"
            style={{ backgroundColor: "var(--color-accent)", boxShadow: "0 12px 24px rgba(0,183,179,0.28)" }}
            aria-label={showForm ? "Rapportageformulier sluiten" : "Nieuwe rapportage openen"}
          >
            {showForm ? <X size={19} strokeWidth={2.3} /> : <Plus size={20} strokeWidth={2.35} />}
            <span>{showForm ? "Sluiten" : "Nieuw rapport"}</span>
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form onSubmit={handleSubmit} className="mt-5 overflow-hidden rounded-[22px] border bg-[#FAFBFD]" style={{ borderColor: "var(--color-border)" }}>
          <div className="border-b bg-white px-4 py-4" style={{ borderColor: "var(--color-border)" }}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: "#E9FBF8", color: "var(--color-accent-accessible)" }}>
                <FileText size={20} strokeWidth={2.4} />
              </span>
              <div>
                <h3 className="text-[17px] font-semibold" style={{ color: "var(--color-primary)" }}>
                  Nieuwe werkrapportage
                </h3>
                <p className="text-[12px] font-semibold" style={{ color: "var(--color-secondary)" }}>
                  Velden met * zijn verplicht
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6 p-4">
            <fieldset>
              <legend className="text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-secondary)" }}>
                1. Type rapportage
              </legend>
              <RadioGroup
                value={reportKind}
                onValueChange={(value) => setReportKind(value as ReportKind)}
                className="mt-3 grid gap-2 sm:grid-cols-3"
                aria-label="Type rapportage"
              >
                {REPORT_KINDS.map((option) => {
                  const Icon = option.icon;
                  const selected = reportKind === option.value;

                  return (
                    <label
                      key={option.value}
                      className="flex min-h-[64px] cursor-pointer items-center gap-3 rounded-2xl border bg-white px-3 py-2.5 text-left transition-colors"
                      style={{
                        borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
                        boxShadow: selected ? "0 0 0 2px rgba(0,183,179,0.12)" : "none",
                      }}
                    >
                      <RadioGroupItem value={option.value} aria-label={option.label} />
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          backgroundColor: selected ? "#E9FBF8" : "#F1F5F9",
                          color: selected ? "var(--color-accent-accessible)" : "var(--color-secondary)",
                        }}
                      >
                        <Icon size={18} strokeWidth={2.4} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold" style={{ color: "var(--color-primary)" }}>
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-semibold leading-4" style={{ color: "var(--color-secondary)" }}>
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </RadioGroup>
            </fieldset>

            <fieldset>
              <legend className="text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-secondary)" }}>
                2. Uitvoeringsstatus
              </legend>
              <RadioGroup
                value={executionStatus}
                onValueChange={(value) =>
                  setExecutionStatus(value as ExecutionStatus)
                }
                className="mt-3 space-y-2"
                aria-label="Uitvoeringsstatus"
              >
                {EXECUTION_STATUSES.map((option) => {
                  const selected = executionStatus === option.value;

                  return (
                    <label
                      key={option.value}
                      className="flex min-h-[48px] w-full cursor-pointer items-center gap-3 rounded-2xl border bg-white px-3 py-2.5 text-left"
                      style={{ borderColor: selected ? option.color : "var(--color-border)" }}
                    >
                      <RadioGroupItem
                        value={option.value}
                        aria-label={option.label}
                        style={{
                          borderColor: selected ? option.color : "#CBD5E1",
                          color: option.color,
                        }}
                      />
                      <span className="text-[14px] font-bold" style={{ color: selected ? option.color : "var(--color-primary)" }}>
                        {option.label}
                      </span>
                    </label>
                  );
                })}
              </RadioGroup>
            </fieldset>

            <div>
              <label htmlFor={`report-work-${assignmentId}`} className="text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-secondary)" }}>
                3. Uitgevoerde werkzaamheden <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <p className="mt-1 text-[12px] font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>
                Beschrijf concreet wat is gedaan en wat het resultaat was.
              </p>
              <textarea
                id={`report-work-${assignmentId}`}
                value={workPerformed}
                onChange={(event) => setWorkPerformed(event.target.value)}
                rows={5}
                required
                className="mt-2 w-full resize-y rounded-2xl border bg-white px-4 py-3 text-[15px] font-semibold leading-6 outline-none focus:ring-2"
                style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
                placeholder="Bijvoorbeeld: entree, gangen en sanitaire ruimtes gereinigd. Eindcontrole uitgevoerd; locatie schoon en gebruiksklaar opgeleverd."
              />
            </div>

            <div>
              <label htmlFor={`report-particulars-${assignmentId}`} className="text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-secondary)" }}>
                4. Bijzonderheden
                {(reportKind === "incident" || executionStatus !== "as-planned") ? (
                  <span style={{ color: "#DC2626" }}> *</span>
                ) : null}
              </label>
              <p className="mt-1 text-[12px] font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>
                Noteer afwijkingen, schade, veiligheidszaken of afspraken op locatie.
              </p>
              <textarea
                id={`report-particulars-${assignmentId}`}
                value={particulars}
                onChange={(event) => setParticulars(event.target.value)}
                rows={3}
                required={reportKind === "incident" || executionStatus !== "as-planned"}
                className="mt-2 w-full resize-y rounded-2xl border bg-white px-4 py-3 text-[15px] font-semibold leading-6 outline-none focus:ring-2"
                style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
                placeholder="Geen bijzonderheden? Laat dit veld leeg."
              />
            </div>

            <div className="rounded-2xl border bg-white p-3" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex min-h-[44px] w-full items-center justify-between gap-4">
                <span>
                  <span className="block text-[14px] font-semibold" style={{ color: "var(--color-primary)" }}>
                    Vervolgactie nodig
                  </span>
                  <span className="mt-0.5 block text-[12px] font-semibold" style={{ color: "var(--color-secondary)" }}>
                    Zet aan wanneer planning of management iets moet oppakken.
                  </span>
                </span>
                <Switch
                  checked={followUpNeeded}
                  onCheckedChange={setFollowUpNeeded}
                  aria-label="Vervolgactie nodig"
                />
              </div>

              {followUpNeeded ? (
                <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
                  <label htmlFor={`report-follow-up-${assignmentId}`} className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-secondary)" }}>
                    Gewenste vervolgactie <span style={{ color: "#DC2626" }}>*</span>
                  </label>
                  <textarea
                    id={`report-follow-up-${assignmentId}`}
                    value={followUp}
                    onChange={(event) => setFollowUp(event.target.value)}
                    rows={3}
                    required
                    className="mt-2 w-full resize-y rounded-2xl border bg-[#FAFBFD] px-4 py-3 text-[15px] font-semibold leading-6 outline-none focus:ring-2"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
                    placeholder="Wie moet wat opvolgen en wanneer?"
                  />
                </div>
              ) : null}
            </div>

            <fieldset>
              <legend className="text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-secondary)" }}>
                Klant geïnformeerd
              </legend>
              <RadioGroup
                value={customerContactStatus}
                onValueChange={(value) =>
                  setCustomerContactStatus(value as CustomerContactStatus)
                }
                className="mt-2 grid grid-cols-3 gap-2"
                aria-label="Klant geïnformeerd"
              >
                {CUSTOMER_CONTACT_OPTIONS.map((option) => {
                  const selected = customerContactStatus === option.value;
                  return (
                    <label
                      key={option.value}
                      className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border px-2 py-2 text-[12px] font-semibold"
                      style={{
                        borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
                        backgroundColor: selected ? "#E9FBF8" : "white",
                        color: selected ? "var(--color-accent-accessible)" : "var(--color-secondary)",
                      }}
                    >
                      <RadioGroupItem value={option.value} aria-label={option.label} />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </RadioGroup>
            </fieldset>

            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-secondary)" }}>
                Foto&apos;s en bewijs
              </p>
              <p className="mt-1 text-[12px] font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>
                Voeg waar nodig foto&apos;s of video&apos;s toe aan deze rapportage.
              </p>

              {files.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {files.map((item) => (
                    <LocalFileRow key={item.id} item={item} onRemove={removeFile} onRetry={retryFile} />
                  ))}
                </div>
              ) : null}

              <label className="mt-3 flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed bg-white px-3 py-3 text-[14px] font-semibold" style={{ borderColor: "var(--color-accent)", color: "var(--color-accent-accessible)" }}>
                <Paperclip size={18} strokeWidth={2.4} />
                Foto of video toevoegen
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    addFiles(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>

              <p className="mt-2 text-[11px] font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>
                Maximaal {MAX_REPORT_NOTE_ATTACHMENTS} bijlagen. Foto&apos;s tot {formatUploadLimit(MAX_ASSIGNMENT_IMAGE_BYTES)}, video&apos;s tot {formatUploadLimit(MAX_ASSIGNMENT_VIDEO_BYTES)}. Uploaden is online-only; de tekst wordt offline gesynchroniseerd.
              </p>
            </div>

            {error ? (
              <p role="alert" className="rounded-2xl px-3 py-2.5 text-[13px] font-bold" style={{ backgroundColor: "#FEF2F2", color: "#B91C1C" }}>
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2 border-t bg-white p-3" style={{ borderColor: "var(--color-border)" }}>
            <button
              type="button"
              onClick={resetForm}
              disabled={isPending}
              className="min-h-[50px] flex-1 rounded-2xl border px-3 text-[14px] font-semibold disabled:opacity-60"
              style={{ borderColor: "var(--color-border)", color: "var(--color-secondary)" }}
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex min-h-[50px] flex-[1.5] items-center justify-center gap-2 rounded-2xl px-3 text-[14px] font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {isPending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} strokeWidth={2.3} />}
              Rapportage opslaan
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-5 space-y-4">
        {sortedNotes.length > 0 ? sortedNotes.map((note) => (
          <ReportNoteCard key={note.id} note={note} />
        )) : (
          <div className="rounded-[18px] border bg-[#FAFBFD] px-4 py-6 text-center" style={{ borderColor: "var(--color-border)" }}>
            <ClipboardCheck size={26} className="mx-auto" style={{ color: "var(--color-muted-fg)" }} />
            <p className="mt-2 text-[14px] font-semibold" style={{ color: "var(--color-primary)" }}>
              Nog geen rapportages
            </p>
            <p className="mt-1 text-[12px] font-semibold" style={{ color: "var(--color-secondary)" }}>
              Leg de uitgevoerde werkzaamheden en bijzonderheden vast.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
