"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { submitMyReport } from "@/actions/reports";
import { FileText, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

type State = { success?: boolean; error?: string } | undefined;

interface Props {
  assignmentId: string;
  assignmentTitle: string;
}

export function UrenRapportForm({ assignmentId, assignmentTitle }: Props) {
  const router      = useRouter();
  const formRef     = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  const [state, formAction, isPending] = useActionState(
    async (_prev: State, formData: FormData): Promise<State> => {
      const content     = (formData.get("content") as string ?? "").trim();
      const hoursWorked = (formData.get("hoursWorked") as string ?? "").trim();
      if (!content) return { error: "Verslag is verplicht" };
      const result = await submitMyReport(assignmentId, { content, hoursWorked, submitterNotes: "" });
      return result.success ? { success: true } : { error: result.error };
    },
    undefined,
  );

  useEffect(() => {
    if (state?.success) {
      router.refresh();
    }
  }, [state?.success, router]);

  if (state?.success) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl p-3"
        style={{ backgroundColor: "#F0FDF4" }}
      >
        <CheckCircle2 size={15} style={{ color: "#16A34A" }} />
        <p className="text-sm font-medium" style={{ color: "#166534" }}>
          Rapport ingediend voor {assignmentTitle}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "var(--color-border)" }}
    >
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors"
        style={{ backgroundColor: "white" }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
            {assignmentTitle}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--color-secondary)" }}>
            Uren en rapport indienen
          </p>
        </div>
        {open
          ? <ChevronUp size={16} style={{ color: "var(--color-secondary)" }} />
          : <ChevronDown size={16} style={{ color: "var(--color-secondary)" }} />
        }
      </button>

      {open && (
        <div
          className="border-t px-4 pb-4 pt-3"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-muted)" }}
        >
          <form ref={formRef} action={formAction} className="space-y-3">
            <div>
              <label
                htmlFor={`hours-${assignmentId}`}
                className="block text-sm font-medium mb-1"
                style={{ color: "var(--color-primary)" }}
              >
                Gewerkte uren
              </label>
              <input
                id={`hours-${assignmentId}`}
                name="hoursWorked"
                type="number"
                min="0"
                max="24"
                step="0.25"
                placeholder="bijv. 4.5"
                className="w-full rounded-xl border bg-white px-4 py-3 text-base outline-none"
                style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
              />
            </div>

            <div>
              <label
                htmlFor={`content-${assignmentId}`}
                className="block text-sm font-medium mb-1"
                style={{ color: "var(--color-primary)" }}
              >
                Verslag <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <textarea
                id={`content-${assignmentId}`}
                name="content"
                rows={3}
                required
                placeholder="Beschrijf kort wat er is uitgevoerd…"
                className="w-full resize-none rounded-xl border bg-white px-4 py-3 text-base outline-none"
                style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
              />
            </div>

            {state?.error && (
              <p
                className="rounded-xl px-3 py-2.5 text-sm font-medium"
                style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
              >
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              <FileText size={15} />
              {isPending ? "Indienen…" : "Rapport indienen"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
