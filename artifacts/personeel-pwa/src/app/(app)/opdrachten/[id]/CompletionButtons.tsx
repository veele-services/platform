"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { setAssignmentStatus } from "@/actions/assignments";
import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect } from "react";

type State = { success?: boolean; error?: string; action?: "completed" | "not_completed" } | undefined;

export function CompletionButtons({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();

  const [state, formAction, isPending] = useActionState(
    async (_prev: State, formData: FormData): Promise<State> => {
      const action = formData.get("action") as "completed" | "not_completed";
      const result = await setAssignmentStatus(assignmentId, action);
      return result.success ? { success: true, action } : { error: result.error };
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
        className="rounded-2xl p-4 text-center text-sm font-medium"
        style={{
          backgroundColor: state.action === "completed" ? "#F0FDF4" : "#FEF2F2",
          color: state.action === "completed" ? "#16A34A" : "#DC2626",
        }}
      >
        {state.action === "completed"
          ? "Opdracht gemarkeerd als afgerond"
          : "Opdracht gemarkeerd als niet afgerond"}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p
        className="mb-3 text-sm font-semibold"
        style={{ color: "var(--color-primary)" }}
      >
        Opdracht afronden
      </p>

      {state?.error && (
        <p
          className="mb-3 rounded-xl px-3 py-2.5 text-sm font-medium"
          style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
        >
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <form action={formAction} className="flex-1">
          <input type="hidden" name="action" value="not_completed" />
          <button
            type="submit"
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{
              borderColor: "#FCA5A5",
              color: "#DC2626",
              backgroundColor: "#FEF2F2",
            }}
          >
            <XCircle size={16} />
            Niet afgerond
          </button>
        </form>

        <form action={formAction} className="flex-1">
          <input type="hidden" name="action" value="completed" />
          <button
            type="submit"
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            <CheckCircle2 size={16} />
            Afgerond
          </button>
        </form>
      </div>
    </div>
  );
}
