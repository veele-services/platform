"use client";

import { useState, useRef, useTransition } from "react";
import { Plus, Trash2, Camera, X, Loader2, ChevronDown, ChevronUp, ImageIcon, Pencil } from "lucide-react";
import {
  addExtraWork,
  updateExtraWork,
  deleteExtraWork,
  savePhotoPath,
  deletePhoto,
  type ExtraWorkItem,
  type TaskCodeOption,
  type ExtraWorkInput,
} from "@/actions/extra-work";
import { createClient } from "@/lib/supabase/client";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PhotoState {
  id:          string;
  storagePath: string;
  previewUrl:  string; // objectURL for new uploads, signedUrl for existing
}

interface ItemState extends Omit<ExtraWorkItem, "photos"> {
  photos: PhotoState[];
}

const EMPTY_FORM: ExtraWorkInput & { taskCodeId: string; taskCodeName: string; hours: string; price: string } = {
  taskCodeId:   "",
  taskCodeName: "",
  description:  "",
  hours:        "",
  price:        "",
};

// ─── Main component ────────────────────────────────────────────────────────────

interface Props {
  assignmentId: string;
  initialItems: ExtraWorkItem[];
  taskCodes:    TaskCodeOption[];
  canEdit:      boolean;
}

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

  const [showAddForm, setShowAddForm]   = useState(false);
  const [addForm, setAddForm]           = useState({ ...EMPTY_FORM });
  const [addError, setAddError]         = useState<string | null>(null);
  const [isAdding, startAdd]            = useTransition();

  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editForm, setEditForm]         = useState({ ...EMPTY_FORM });
  const [editError, setEditError]       = useState<string | null>(null);
  const [isSavingEdit, startSaveEdit]   = useTransition();

  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [deletingId, setDeletingId]     = useState<string | null>(null);

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ─── Add item ──────────────────────────────────────────────────────────────

  function handleAddCodeChange(codeId: string) {
    const code = taskCodes.find((c) => c.id === codeId);
    setAddForm((f) => ({
      ...f,
      taskCodeId:   codeId,
      taskCodeName: code?.name ?? "",
      price:        f.price || (code?.price ?? ""),
    }));
  }

  function handleSubmitAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    if (!addForm.description.trim()) {
      setAddError("Omschrijving is verplicht");
      return;
    }

    startAdd(async () => {
      const result = await addExtraWork(assignmentId, {
        taskCodeId:   addForm.taskCodeId || null,
        taskCodeName: addForm.taskCodeName || null,
        description:  addForm.description,
        hours:        addForm.hours || null,
        price:        addForm.price || null,
      });

      if (!result.success || !result.id) {
        setAddError(result.error ?? "Toevoegen mislukt");
        return;
      }

      setItems((prev) => [
        ...prev,
        {
          id:           result.id!,
          taskCodeId:   addForm.taskCodeId || null,
          taskCodeName: addForm.taskCodeName || null,
          description:  addForm.description,
          hours:        addForm.hours || null,
          price:        addForm.price || null,
          createdBy:    "",
          photos:       [],
        },
      ]);
      setAddForm({ ...EMPTY_FORM });
      setShowAddForm(false);
    });
  }

  // ─── Edit item ─────────────────────────────────────────────────────────────

  function startEditing(item: ItemState) {
    setEditingId(item.id);
    setEditForm({
      taskCodeId:   item.taskCodeId ?? "",
      taskCodeName: item.taskCodeName ?? "",
      description:  item.description,
      hours:        item.hours ?? "",
      price:        item.price ?? "",
    });
    setEditError(null);
  }

  function handleEditCodeChange(codeId: string) {
    const code = taskCodes.find((c) => c.id === codeId);
    setEditForm((f) => ({
      ...f,
      taskCodeId:   codeId,
      taskCodeName: code?.name ?? "",
      price:        f.price || (code?.price ?? ""),
    }));
  }

  function handleSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);

    if (!editForm.description.trim()) {
      setEditError("Omschrijving is verplicht");
      return;
    }

    if (!editingId) return;
    const currentId = editingId;

    startSaveEdit(async () => {
      const result = await updateExtraWork(currentId, assignmentId, {
        taskCodeId:   editForm.taskCodeId || null,
        taskCodeName: editForm.taskCodeName || null,
        description:  editForm.description,
        hours:        editForm.hours || null,
        price:        editForm.price || null,
      });

      if (!result.success) {
        setEditError(result.error ?? "Opslaan mislukt");
        return;
      }

      setItems((prev) =>
        prev.map((item) =>
          item.id === currentId
            ? {
                ...item,
                taskCodeId:   editForm.taskCodeId || null,
                taskCodeName: editForm.taskCodeName || null,
                description:  editForm.description,
                hours:        editForm.hours || null,
                price:        editForm.price || null,
              }
            : item,
        ),
      );
      setEditingId(null);
    });
  }

  // ─── Delete item ───────────────────────────────────────────────────────────

  async function handleDeleteItem(itemId: string) {
    setDeletingId(itemId);
    try {
      const result = await deleteExtraWork(itemId, assignmentId);
      if (result.success) {
        setItems((prev) => prev.filter((i) => i.id !== itemId));
      }
    } finally {
      setDeletingId(null);
    }
  }

  // ─── Photo upload ──────────────────────────────────────────────────────────

  async function handlePhotoUpload(itemId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0]!;

    setUploadingFor(itemId);
    try {
      const supabase = createClient();
      const ext      = file.name.split(".").pop() ?? "jpg";
      const path     = `${assignmentId}/${itemId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("assignment-photos")
        .upload(path, file);
      if (uploadError) throw uploadError;

      const result = await savePhotoPath(assignmentId, itemId, path);
      if (!result.success || !result.photoId) {
        // Remove the orphaned file from storage if DB save failed
        await supabase.storage.from("assignment-photos").remove([path]);
        throw new Error(result.error ?? "Opslaan mislukt");
      }

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
      // silently ignore upload errors — user sees no change in UI and can retry
    } finally {
      setUploadingFor(null);
      if (fileRefs.current[itemId]) fileRefs.current[itemId]!.value = "";
    }
  }

  async function handleDeletePhoto(itemId: string, photo: PhotoState) {
    setDeletingId(photo.id);
    try {
      // storagePath is intentionally NOT sent to the server — deletePhoto loads it
      // from the DB by photoId to prevent arbitrary storage object deletion.
      const result = await deletePhoto(photo.id, assignmentId);
      if (result.success) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? { ...item, photos: item.photos.filter((p) => p.id !== photo.id) }
              : item,
          ),
        );
      }
    } finally {
      setDeletingId(null);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold" style={{ color: "var(--color-primary)" }}>
          Meerwerk
        </h3>
        {canEdit && !showAddForm && editingId === null && (
          <button
            onClick={() => setShowAddForm(true)}
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
          {items.map((item) =>
            editingId === item.id ? (
              // ── Inline edit form ─────────────────────────────────────────
              <form
                key={item.id}
                onSubmit={handleSubmitEdit}
                className="space-y-3 rounded-xl border p-3"
                style={{ borderColor: "var(--color-accent)" }}
              >
                <p className="text-xs font-semibold" style={{ color: "var(--color-accent)" }}>
                  Meerwerk bewerken
                </p>
                <InlineFormFields
                  form={editForm}
                  setForm={setEditForm}
                  taskCodes={taskCodes}
                  onCodeChange={handleEditCodeChange}
                />
                {editError && (
                  <p className="rounded-xl px-3 py-2 text-xs font-medium"
                    style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
                    {editError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="flex-1 rounded-xl border py-2.5 text-sm font-medium"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-secondary)" }}
                  >
                    Annuleren
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium text-white disabled:opacity-60"
                    style={{ backgroundColor: "var(--color-accent)" }}
                  >
                    {isSavingEdit ? <Loader2 size={14} className="animate-spin" /> : null}
                    Opslaan
                  </button>
                </div>
              </form>
            ) : (
              // ── Item card ─────────────────────────────────────────────────
              <MeerwerkItemKaart
                key={item.id}
                item={item}
                canEdit={canEdit}
                uploadingFor={uploadingFor}
                deletingId={deletingId}
                fileRefs={fileRefs}
                onEdit={() => startEditing(item)}
                onUpload={handlePhotoUpload}
                onDeletePhoto={handleDeletePhoto}
                onDeleteItem={handleDeleteItem}
              />
            ),
          )}
        </div>
      )}

      {items.length === 0 && !showAddForm && (
        <p className="py-3 text-center text-sm" style={{ color: "var(--color-muted-fg)" }}>
          {canEdit ? "Nog geen meerwerk toegevoegd." : "Geen meerwerk geregistreerd."}
        </p>
      )}

      {/* Add form */}
      {showAddForm && canEdit && (
        <form
          onSubmit={handleSubmitAdd}
          className="space-y-3 rounded-xl border p-3"
          style={{ borderColor: "var(--color-border)" }}
        >
          <InlineFormFields
            form={addForm}
            setForm={setAddForm}
            taskCodes={taskCodes}
            onCodeChange={handleAddCodeChange}
          />
          {addError && (
            <p className="rounded-xl px-3 py-2 text-xs font-medium"
              style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              {addError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setAddForm({ ...EMPTY_FORM }); setAddError(null); }}
              className="flex-1 rounded-xl border py-2.5 text-sm font-medium"
              style={{ borderColor: "var(--color-border)", color: "var(--color-secondary)" }}
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={isAdding}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {isAdding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Opslaan
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Shared form fields ────────────────────────────────────────────────────────

type FormState = {
  taskCodeId:   string;
  taskCodeName: string;
  description:  string;
  hours:        string;
  price:        string;
};

function InlineFormFields({
  form,
  setForm,
  taskCodes,
  onCodeChange,
}: {
  form:         FormState;
  setForm:      React.Dispatch<React.SetStateAction<FormState>>;
  taskCodes:    TaskCodeOption[];
  onCodeChange: (id: string) => void;
}) {
  return (
    <>
      {/* Taakcode */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-primary)" }}>
          Taakcode <span style={{ color: "var(--color-muted-fg)" }}>(optioneel)</span>
        </label>
        <select
          value={form.taskCodeId}
          onChange={(e) => onCodeChange(e.target.value)}
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
    </>
  );
}

// ─── Item card ─────────────────────────────────────────────────────────────────

function MeerwerkItemKaart({
  item,
  canEdit,
  uploadingFor,
  deletingId,
  fileRefs,
  onEdit,
  onUpload,
  onDeletePhoto,
  onDeleteItem,
}: {
  item:         ItemState;
  canEdit:      boolean;
  uploadingFor: string | null;
  deletingId:   string | null;
  fileRefs:     React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  onEdit:       () => void;
  onUpload:     (itemId: string, files: FileList | null) => void;
  onDeletePhoto:(itemId: string, photo: PhotoState) => void;
  onDeleteItem: (itemId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isDeleting  = deletingId === item.id;
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
          aria-label={expanded ? "Inklappen" : "Uitklappen"}
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
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={onEdit}
              className="rounded-lg p-1 transition-colors"
              style={{ color: "var(--color-accent)" }}
              aria-label="Bewerken"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => onDeleteItem(item.id)}
              disabled={isDeleting}
              className="rounded-lg p-1 transition-colors"
              style={{ color: "#EF4444" }}
              aria-label="Verwijderen"
            >
              {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
          </div>
        )}
      </div>

      {/* Photos section */}
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
                      aria-label="Foto verwijderen"
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
              Geen foto&apos;s
            </p>
          )}
        </div>
      )}
    </div>
  );
}
