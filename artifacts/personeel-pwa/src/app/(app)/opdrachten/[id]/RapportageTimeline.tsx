"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { ChevronRight, FileText, ImageIcon, Loader2, Paperclip, Plus, Send, Trash2, Video, X } from "lucide-react";
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

type Props = {
  assignmentId: string;
  initialNotes: ReportNote[];
  canAdd:       boolean;
  canPersist:   boolean;
};

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
          <span className="flex h-full w-full items-center justify-center text-[#00B7B3]">
            {kind === "video" ? <Video size={24} strokeWidth={2.2} /> : <ImageIcon size={24} strokeWidth={2.2} />}
          </span>
        )}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[14px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
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
          <span className="flex h-full w-full items-center justify-center text-[#00B7B3]">
            {kind === "video" ? <Video size={20} strokeWidth={2.2} /> : <FileText size={20} strokeWidth={2.2} />}
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-black" style={{ color: "var(--color-primary)" }}>
          {item.file.name}
        </span>
        <span className="block text-[12px] font-semibold" style={{ color: "var(--color-secondary)" }}>
          {meta}
        </span>
        <span
          className="mt-1 block text-[11px] font-black"
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
            className="rounded-full border px-3 py-1.5 text-[11px] font-black"
            style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
          >
            Opnieuw
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          disabled={isBusy}
          className="flex h-8 w-8 items-center justify-center rounded-full border disabled:opacity-40"
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

  return (
    <article className="rounded-[18px] border bg-white px-4 py-4 shadow-sm" style={{ borderColor: "var(--color-border)", boxShadow: "0 12px 28px rgba(8,29,58,0.06)" }}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[15px] font-semibold" style={{ color: "var(--color-secondary)" }}>
          {date}
        </span>
        <span className="text-[15px] font-semibold" style={{ color: "var(--color-secondary)" }}>
          {time}
        </span>
        <span className="text-[15px] font-black" style={{ color: "var(--color-primary)" }}>
          {note.authorName}:
        </span>
      </div>

      <p className="mt-4 whitespace-pre-wrap text-[16px] font-medium leading-7" style={{ color: "var(--color-primary)" }}>
        {note.body}
      </p>

      {note.attachments.map((attachment) => (
        <AttachmentPreview key={attachment.id} attachment={attachment} />
      ))}
    </article>
  );
}

export function RapportageTimeline({ assignmentId, initialNotes, canAdd, canPersist }: Props) {
  const [notes, setNotes] = useState<ReportNote[]>(initialNotes);
  const [showForm, setShowForm] = useState(false);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sortedNotes = useMemo(
    () => [...notes].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [notes],
  );

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;

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
    setBody("");
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

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setError("Notitie is verplicht");
      return;
    }

    startTransition(async () => {
      if (!canPersist || isOfflineNow()) {
        if (files.length > 0 && isOfflineNow()) {
          setError("Bijlagen kunnen pas online worden geupload. Sla de notitie zonder bijlage op of probeer opnieuw zodra je online bent.");
          return;
        }

        const now = new Date().toISOString();
        setNotes((current) => [
          {
            id:          `local-report-note-${Date.now()}`,
            body:        trimmedBody,
            authorName:  "Veele Services",
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
            payload: { body: trimmedBody },
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
          attachments: uploaded,
        });

        if (!result.success || !result.note) {
          if (uploaded.length > 0) {
            await createClient().storage.from(ASSIGNMENT_MEDIA_BUCKET).remove(uploaded.map((item) => item.storagePath));
          }
          setError(result.error ?? "Notitie opslaan mislukt");
          return;
        }

        setNotes((current) => [result.note!, ...current]);
        resetForm();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Bijlage uploaden of notitie opslaan mislukt");
      }
    });
  }

  return (
    <section className="rounded-[24px] bg-white px-4 py-5 shadow-sm" style={{ boxShadow: "0 16px 36px rgba(8,29,58,0.08)" }}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[22px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
          Rapportage
        </h2>

        {canAdd ? (
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-white shadow-lg active:scale-95"
            style={{ backgroundColor: "var(--color-accent)", boxShadow: "0 12px 24px rgba(0,183,179,0.28)" }}
            aria-label={showForm ? "Notitieformulier sluiten" : "Notitie toevoegen"}
          >
            {showForm ? <X size={25} strokeWidth={2.3} /> : <Plus size={28} strokeWidth={2.35} />}
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form onSubmit={handleSubmit} className="mt-5 space-y-3 rounded-[18px] border bg-[#FAFBFD] p-3" style={{ borderColor: "var(--color-border)" }}>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            className="w-full resize-none rounded-2xl border bg-white px-4 py-3 text-[15px] font-semibold leading-6 outline-none"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
            placeholder="Notitie toevoegen"
          />

          {files.length > 0 ? (
            <div className="space-y-2">
              {files.map((item) => (
                <LocalFileRow key={item.id} item={item} onRemove={removeFile} onRetry={retryFile} />
              ))}
            </div>
          ) : null}

          <p className="text-[12px] font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>
            Maximaal {MAX_REPORT_NOTE_ATTACHMENTS} bijlagen. Foto's tot {formatUploadLimit(MAX_ASSIGNMENT_IMAGE_BYTES)}, video's tot {formatUploadLimit(MAX_ASSIGNMENT_VIDEO_BYTES)}.
          </p>

          <div className="flex gap-2">
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-[14px] font-black" style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}>
              <Paperclip size={17} strokeWidth={2.4} />
              Bijlage
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

            <button
              type="submit"
              disabled={isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-3 text-[14px] font-black text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {isPending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} strokeWidth={2.3} />}
              Opslaan
            </button>
          </div>

          {error ? (
            <p className="rounded-2xl px-3 py-2 text-[13px] font-bold" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              {error}
            </p>
          ) : null}
        </form>
      ) : null}

      <div className="mt-5 space-y-4">
        {sortedNotes.length > 0 ? sortedNotes.map((note) => (
          <ReportNoteCard key={note.id} note={note} />
        )) : (
          <div className="rounded-[18px] border bg-[#FAFBFD] px-4 py-6 text-center" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-[14px] font-semibold" style={{ color: "var(--color-secondary)" }}>
              Nog geen rapportagenotities.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
