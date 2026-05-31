"use client";

import { useActionState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { submitMyReport } from "@/actions/reports";
import { FileText, AlertTriangle } from "lucide-react";

type State = { success?: boolean; error?: string } | undefined;

interface Props {
  assignmentId:     string;
  assignmentStatus: string;
}

export function RapportForm({ assignmentId, assignmentStatus }: Props) {
  const router  = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const isNotCompleted = assignmentStatus === "not_completed";

  const [state, formAction, isPending] = useActionState(
    async (_prev: State, formData: FormData): Promise<State> => {
      const content     = formData.get("content") as string ?? "";
      const hoursWorked = formData.get("hoursWorked") as string ?? "";
      const submitterNotes = isNotCompleted
        ? (formData.get("reason") as string ?? "")
        : (formData.get("submitterNotes") as string ?? "");

      const result = await submitMyReport(assignmentId, {
        content,
        hoursWorked,
        submitterNotes,
      });
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
        className="rounded-2xl p-5 text-center"
        style={{ backgroundColor: "#F0FDF4" }}
      >
        <FileText size={28} className="mx-auto mb-2" style={{ color: "#16A34A" }} />
        <p className="font-semibold" style={{ color: "#166534" }}>
          Rapport ingediend
        </p>
        <p className="mt-1 text-sm" style={{ color: "#15803D" }}>
          Uw rapport is ontvangen en wordt beoordeeld.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">

      {isNotCompleted && (
        <div
          className="mb-4 flex items-start gap-2 rounded-xl p-3"
          style={{ backgroundColor: "#FEF3C7" }}
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "#92400E" }} />
          <p className="text-sm" style={{ color: "#92400E" }}>
            De opdracht is niet afgerond. Geef aan wat de reden is en wat er wel is uitgevoerd.
          </p>
        </div>
      )}

      <h3 className="mb-4 font-semibold" style={{ color: "var(--color-primary)" }}>
        {isNotCompleted ? "Rapport — niet afgerond" : "Rapport indienen"}
      </h3>

      <form ref={formRef} action={formAction} className="space-y-4">

        {isNotCompleted && (
          <div>
            <label
              htmlFor="rapport-reason"
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--color-primary)" }}
            >
              Reden voor niet-afronden <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <textarea
              id="rapport-reason"
              name="reason"
              rows={3}
              required
              placeholder="Wat was de reden dat de opdracht niet afgerond kon worden?"
              className="w-full resize-none rounded-xl border px-4 py-3.5 text-base outline-none"
              style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
            />
          </div>
        )}

        <div>
          <label
            htmlFor="rapport-content"
            className="block text-sm font-medium mb-1.5"
            style={{ color: "var(--color-primary)" }}
          >
            {isNotCompleted ? "Wat is er wel uitgevoerd?" : "Verslag"}{" "}
            <span style={{ color: "#EF4444" }}>*</span>
          </label>
          <textarea
            id="rapport-content"
            name="content"
            rows={5}
            required
            placeholder={
              isNotCompleted
                ? "Beschrijf wat er wel is gedaan voordat de opdracht gestopt is…"
                : "Beschrijf wat er is uitgevoerd…"
            }
            className="w-full resize-none rounded-xl border px-4 py-3.5 text-base outline-none"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
          />
        </div>

        <div>
          <label
            htmlFor="rapport-hours"
            className="block text-sm font-medium mb-1.5"
            style={{ color: "var(--color-primary)" }}
          >
            Gewerkte uren
          </label>
          <input
            id="rapport-hours"
            name="hoursWorked"
            type="number"
            min="0"
            max="24"
            step="0.25"
            placeholder="bijv. 4.5"
            className="w-full rounded-xl border px-4 py-3.5 text-base outline-none"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
          />
        </div>

        {!isNotCompleted && (
          <div>
            <label
              htmlFor="rapport-notes"
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--color-primary)" }}
            >
              Aanvullende opmerkingen
            </label>
            <textarea
              id="rapport-notes"
              name="submitterNotes"
              rows={3}
              placeholder="Bijzonderheden, veiligheidsincidenten, materiaal gebruikt…"
              className="w-full resize-none rounded-xl border px-4 py-3.5 text-base outline-none"
              style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
            />
          </div>
        )}

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
          className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-base font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          <FileText size={18} />
          {isPending ? "Indienen…" : "Rapport indienen"}
        </button>
      </form>
    </div>
  );
}
