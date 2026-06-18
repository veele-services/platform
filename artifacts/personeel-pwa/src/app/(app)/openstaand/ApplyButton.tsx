"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { applyForAssignment } from "@/actions/open-assignments";

interface Props {
  assignmentId:     string;
  title:            string;
  isAlreadyApplied: boolean;
}

export function ApplyButton({ assignmentId, title, isAlreadyApplied }: Props) {
  const [applied, setApplied] = useState(isAlreadyApplied);
  const [error,   setError]   = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (applied) {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium"
        style={{ backgroundColor: "#DCFCE7", color: "#166534" }}
      >
        <CheckCircle2 size={12} />
        Aangemeld
      </div>
    );
  }

  function handleApply() {
    if (!confirm(`Wilt u zich aanmelden voor "${title}"? De planner neemt de definitieve beslissing.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await applyForAssignment(assignmentId);
      if (result.success) {
        setApplied(true);
      } else {
        setError(result.error ?? "Aanmelden mislukt");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleApply}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-50"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        {pending ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
        Aanmelden
      </button>
      {error && (
        <p className="mt-1 text-xs" style={{ color: "var(--color-destructive)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
