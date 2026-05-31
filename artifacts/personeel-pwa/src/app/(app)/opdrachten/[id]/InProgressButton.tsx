"use client";

import { useActionState } from "react";
import { markInProgress } from "@/actions/assignments";
import { Play } from "lucide-react";

type State = { success?: boolean; error?: string } | undefined;

export function InProgressButton({ assignmentId }: { assignmentId: string }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: State, _formData: FormData): Promise<State> => {
      return markInProgress(assignmentId);
    },
    undefined,
  );

  if (state?.success) {
    return (
      <div
        className="rounded-2xl p-4 text-center text-sm font-medium"
        style={{ backgroundColor: "#F0FDF4", color: "#16A34A" }}
      >
        Opdracht staat nu op "In uitvoering"
      </div>
    );
  }

  return (
    <form action={formAction}>
      {state?.error && (
        <p className="mb-3 rounded-xl px-3 py-2.5 text-sm" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-base font-semibold text-white transition-opacity disabled:opacity-60"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        <Play size={18} />
        {isPending ? "Bezig…" : "In uitvoering zetten"}
      </button>
    </form>
  );
}
