"use client";

import { useState, useTransition } from "react";
import { MessageSquarePlus, Trash2, AlertCircle, StickyNote } from "lucide-react";
import {
  addCustomerNote,
  deleteCustomerNote,
  type CustomerNoteRow,
} from "@/app/actions/customers";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  customerId:   string;
  initialNotes: CustomerNoteRow[];
}

export function CustomerNotesPanel({ customerId, initialNotes }: Props) {
  const [notes, setNotes]            = useState(initialNotes);
  const [content, setContent]        = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);
  const [deletingId, setDeletingId]  = useState<string | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await addCustomerNote(customerId, content);
      if (result.success && result.data) {
        const optimistic: CustomerNoteRow = {
          id:          result.data.id,
          content:     content.trim(),
          createdAt:   result.data.createdAt,
          authorEmail: "—",
          authorName:  null,
        };
        setNotes((prev) => [optimistic, ...prev]);
        setContent("");
      } else if (!result.success) {
        setError(result.message);
      }
    });
  }

  function handleDelete(noteId: string) {
    if (!confirm("Notitie verwijderen?")) return;
    setDeletingId(noteId);
    startTransition(async () => {
      const result = await deleteCustomerNote(noteId, customerId);
      setDeletingId(null);
      if (result.success) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="veele-card space-y-4">
      {/* Header */}
      <h2
        className="font-heading text-base font-semibold flex items-center gap-2"
        style={{ color: "#081D3A" }}
      >
        <StickyNote className="h-4 w-4" style={{ color: "#00B7B3" }} />
        Notities
        {notes.length > 0 && (
          <span
            className="inline-flex items-center justify-center rounded-full text-xs font-semibold px-1.5 py-0.5 min-w-[20px]"
            style={{ backgroundColor: "#F1F5F9", color: "#64748B" }}
          >
            {notes.length}
          </span>
        )}
      </h2>

      {/* Add form */}
      <form onSubmit={handleAdd} className="space-y-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Notitie toevoegen…"
          rows={3}
          maxLength={4000}
          disabled={isPending}
          className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-offset-0"
          style={{
            borderColor:     "#E2E8F0",
            color:           "#081D3A",
            backgroundColor: "#FAFCFF",
          }}
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isPending || !content.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: "#00B7B3" }}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            {isPending ? "Opslaan…" : "Toevoegen"}
          </button>
          {error && (
            <p className="flex items-center gap-1 text-xs" style={{ color: "#DC2626" }}>
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </p>
          )}
        </div>
      </form>

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="text-sm" style={{ color: "#94A3B8" }}>
          Geen notities. Voeg er een toe via het formulier hierboven.
        </p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-lg p-3 space-y-1.5"
              style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="flex-1 text-sm whitespace-pre-wrap" style={{ color: "#334155" }}>
                  {note.content}
                </p>
                <button
                  onClick={() => handleDelete(note.id)}
                  disabled={isPending && deletingId === note.id}
                  title="Verwijderen"
                  className="flex-shrink-0 rounded p-1 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" style={{ color: "#DC2626" }} />
                </button>
              </div>
              <p className="text-xs" style={{ color: "#94A3B8" }}>
                {note.authorName ?? note.authorEmail} · {formatDate(note.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
