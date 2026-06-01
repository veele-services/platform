"use client";

import { useState, useRef, useTransition } from "react";
import { Plus, Trash2, Camera, X, Loader2, ChevronDown, ChevronUp, ImageIcon } from "lucide-react";
import {
  addExtraWork,
  deleteExtraWork,
  savePhotoPath,
  deletePhoto,
  type ExtraWorkItem,
  type TaskCodeOption,
} from "@/actions/extra-work";
import { createClient } from "@/lib/supabase/client";

interface PhotoState {
  id:           string;
  storagePath:  string;
  previewUrl:   string; // objectURL for new uploads, signedUrl for existing
}

interface ItemState extends Omit<ExtraWorkItem, "photos"> {
  photos: PhotoState[];
}

interface Props {
  assignmentId: string;
  initialItems: ExtraWorkItem[];
  taskCodes:    TaskCodeOption[];
  canEdit:      boolean;
}

const EMPTY_FORM = {
  taskCodeId:   "",
  taskCodeName: "",
  description:  "",
  hours:        "",
  price:        "",
};

export function MeerwerkSection({ assignmentId, initialItems, taskCodes, canEdit }: Props) {
  const [items, setItems] = useState<ItemState[]>(
    initialItems.map((i) => ({
      ...i,
      photos: i.photos.map((p) => ({
        id:          p.id,
        storagePath: p.storagePath,
        previewUrl:  p.signedUrl ?? "",
      })),
    })),
  );
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [formError, setFormError]   = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [deletingId, setDeletingId]     = useState<string | null>(null);

  // File input refs per item — keyed by item ID
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function handleCodeChange(codeId: string) {
    const code = taskCodes.find((c) => c.id === codeId);
    setForm((f) => ({
      ...f,
      taskCodeId:   codeId,
      taskCodeName: code?.name ?? "",
      price:        f.price || (code?.price ?? ""),
    }));
  }

  function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.description.trim()) {
      setFormError("Omschrijving is verplicht");
      return;
    }

    startTransition(async () => {
      const result = await addExtraWork(assignmentId, {
        taskCodeId:   form.taskCodeId || null,
        taskCodeName: form.taskCodeName || null,
        description:  form.description,
        hours:        form.hours || null,
        price:        form.price || null,
      });

      if (!result.success || !result.id) {
        setFormError(result.error ?? "Toevoegen mislukt");
        return;
      }

      setItems((prev) => [
        ...prev,
        {
          id:           result.id!,
          taskCodeId:   form.taskCodeId || null,
          taskCodeName: form.taskCodeName || null,
          description:  form.description,
          hours:        form.hours || null,
          price:        form.price || null,
          createdBy:    "",
          photos:       [],
        },
      ]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    });
  }

  async function handlePhotoUpload(itemId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0]!;

    setUploadingFor(itemId);
    try {
      const supabase   = createClient();
      const ext        = file.name.split(".").pop() ?? "jpg";
      const path       = `${assignmentId}/${itemId}/${Date.now()}.${ext}`;
      const { error }  = await supabase.storage.from("assignment-photos").upload(path, file);
      if (error) throw error;

      const result = await savePhotoPath(assignmentId, itemId, path);
      if (!result.success || !result.photoId) throw new Error(result.error);

      const localUrl = URL.createObjectURL(file);
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                photos: [
                  ...item.photos,
                  { id: result.photoId!, storagePath: path, previewUrl: localUrl },
                ],
              }
            : item,
        ),
      );
    } catch {
      // silently ignore — user can retry
    } finally {
      setUploadingFor(null);
      if (fileRefs.current[itemId]) fileRefs.current[itemId]!.value = "";
    }
  }

  async function handleDeletePhoto(itemId: string, photo: PhotoState) {
    setDeletingId(photo.id);
    try {
      await deletePhoto(photo.id, photo.storagePath, assignmentId);
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, photos: item.photos.filter((p) => p.id !== photo.id) }
            : item,
        ),
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteItem(itemId: string) {
    setDeletingId(itemId);
    try {
      await deleteExtraWork(itemId, assignmentId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold" style={{ color: "var(--color-primary)" }}>
          Meerwerk
        </h3>
        {canEdit && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            <Plus size={14} />
            Toevoegen
          </button>
        )}
      </div>

      {/* Existing items */}
      {items.length > 0 && (
        <div className="mb-3 space-y-3">
          {items.map((item) => (
            <MeerwerkItemKaart
              key={item.id}
              item={item}
              canEdit={canEdit}
              uploadingFor={uploadingFor}
              deletingId={deletingId}
              fileRefs={fileRefs}
              onUpload={handlePhotoUpload}
              onDeletePhoto={handleDeletePhoto}
              onDeleteItem={handleDeleteItem}
            />
          ))}
        </div>
      )}

      {items.length === 0 && !showForm && (
        <p className="py-3 text-center text-sm" style={{ color: "var(--color-muted-fg)" }}>
          {canEdit ? "Geen meerwerk toegevoegd." : "Geen meerwerk geregistreerd."}
        </p>
      )}

      {/* Add form */}
      {showForm && canEdit && (
        <form
          onSubmit={handleSubmitForm}
          className="space-y-3 rounded-xl border p-3"
          style={{ borderColor: "var(--color-border)" }}
        >
          {/* Taakcode */}
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-primary)" }}>
              Taakcode (optioneel)
            </label>
            <select
              value={form.taskCodeId}
              onChange={(e) => handleCodeChange(e.target.value)}
              className="w-full rounded-xl border px-3 py-3 text-sm outline-none"
              style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
            >
              <option value="">— Geen taakcode —</option>
              {taskCodes.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.code} · {tc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Omschrijving */}
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-primary)" }}>
              Omschrijving <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Beschrijf het meerwerk…"
              className="w-full resize-none rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
            />
          </div>

          {/* Uren + Prijs */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-primary)" }}>
                Uren
              </label>
              <input
                type="number"
                min="0"
                max="99"
                step="0.25"
                value={form.hours}
                onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                placeholder="bijv. 1.5"
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-primary)" }}>
                Prijs (€)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="bijv. 75.00"
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
              />
            </div>
          </div>

          {formError && (
            <p className="rounded-xl px-3 py-2 text-xs font-medium" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              {formError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setFormError(null); }}
              className="flex-1 rounded-xl border py-2.5 text-sm font-medium"
              style={{ borderColor: "var(--color-border)", color: "var(--color-secondary)" }}
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Opslaan
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function MeerwerkItemKaart({
  item,
  canEdit,
  uploadingFor,
  deletingId,
  fileRefs,
  onUpload,
  onDeletePhoto,
  onDeleteItem,
}: {
  item:         ItemState;
  canEdit:      boolean;
  uploadingFor: string | null;
  deletingId:   string | null;
  fileRefs:     React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  onUpload:     (itemId: string, files: FileList | null) => void;
  onDeletePhoto:(itemId: string, photo: PhotoState) => void;
  onDeleteItem: (itemId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isDeleting = deletingId === item.id;
  const isUploading = uploadingFor === item.id;

  return (
    <div
      className="rounded-xl border"
      style={{ borderColor: "var(--color-border)", opacity: isDeleting ? 0.5 : 1 }}
    >
      {/* Header */}
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 shrink-0"
          style={{ color: "var(--color-muted-fg)" }}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <div className="min-w-0 flex-1">
          {item.taskCodeName && (
            <span
              className="mb-0.5 inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
              style={{ backgroundColor: "rgba(0,183,179,0.1)", color: "var(--color-accent)" }}
            >
              {item.taskCodeName}
            </span>
          )}
          <p className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
            {item.description}
          </p>
          {(item.hours || item.price) && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--color-secondary)" }}>
              {item.hours ? `${item.hours} uur` : ""}
              {item.hours && item.price ? " · " : ""}
              {item.price ? `€ ${item.price}` : ""}
            </p>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => onDeleteItem(item.id)}
            disabled={isDeleting}
            className="shrink-0 rounded-lg p-1 transition-colors"
            style={{ color: "#EF4444" }}
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        )}
      </div>

      {/* Photos */}
      {expanded && (
        <div className="border-t px-3 pb-3 pt-2.5" style={{ borderColor: "var(--color-border)" }}>
          {item.photos.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {item.photos.map((photo) => (
                <div key={photo.id} className="relative">
                  {photo.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.previewUrl}
                      alt="Werkbon foto"
                      className="h-20 w-20 rounded-xl object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-20 w-20 items-center justify-center rounded-xl"
                      style={{ backgroundColor: "var(--color-muted)" }}
                    >
                      <ImageIcon size={20} style={{ color: "var(--color-muted-fg)" }} />
                    </div>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => onDeletePhoto(item.id, photo)}
                      disabled={deletingId === photo.id}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow"
                    >
                      {deletingId === photo.id
                        ? <Loader2 size={10} className="animate-spin" />
                        : <X size={10} />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canEdit && item.photos.length < 5 && (
            <>
              <input
                ref={(el) => { fileRefs.current[item.id] = el; }}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => onUpload(item.id, e.target.files)}
              />
              <button
                onClick={() => fileRefs.current[item.id]?.click()}
                disabled={isUploading}
                className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium"
                style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
              >
                {isUploading
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Camera size={13} />}
                {isUploading ? "Uploaden…" : "Foto toevoegen"}
              </button>
            </>
          )}

          {item.photos.length === 0 && !canEdit && (
            <p className="text-xs" style={{ color: "var(--color-muted-fg)" }}>
              Geen foto's
            </p>
          )}
        </div>
      )}
    </div>
  );
}
