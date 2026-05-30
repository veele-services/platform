"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, FileText } from "lucide-react";
import { submitReport } from "@/app/actions/reports";

interface Props {
  assignmentId: string;
}

export function SubmitReportForm({ assignmentId }: Props) {
  const router     = useRouter();
  const [, startT] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [content, setContent]     = useState("");
  const [hoursWorked, setHoursWorked] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);

    const result = await submitReport(assignmentId, content, hoursWorked || null);
    setLoading(false);

    if (!result.success) {
      setError(result.message);
      if ("fieldErrors" in result && result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      }
      return;
    }

    startT(() => router.refresh());
  }

  return (
    <div className="veele-card">
      <h3
        className="font-heading text-sm font-semibold mb-4 flex items-center gap-2"
        style={{ color: "#081D3A" }}
      >
        <FileText className="h-4 w-4" style={{ color: "#00B7B3" }} />
        Rapport indienen
      </h3>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <p className="text-xs rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B" }}>
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "#374151" }}>
            Rapportinhoud <span style={{ color: "#DC2626" }}>*</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Beschrijf het uitgevoerde werk, bevindingen en eventuele bijzonderheden…"
            rows={5}
            required
            className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none focus:ring-2 transition"
            style={{
              borderColor: fieldErrors.content ? "#DC2626" : "#E2E8F0",
              color: "#081D3A",
            }}
          />
          {fieldErrors.content && (
            <p className="text-xs" style={{ color: "#DC2626" }}>{fieldErrors.content}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "#374151" }}>
            Gewerkte uren
          </label>
          <input
            type="number"
            step="0.25"
            min="0"
            max="24"
            value={hoursWorked}
            onChange={(e) => setHoursWorked(e.target.value)}
            placeholder="bijv. 2.5"
            className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 transition"
            style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
          style={{ backgroundColor: "#00B7B3", color: "#FFFFFF" }}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Rapport indienen
        </button>
      </form>
    </div>
  );
}
