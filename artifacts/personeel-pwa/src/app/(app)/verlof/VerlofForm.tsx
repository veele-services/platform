"use client";

import { useActionState, useRef } from "react";
import { requestLeave } from "@/actions/leave";

type State = { success?: boolean; error?: string } | undefined;

export function VerlofForm() {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState(
    async (_prev: State, formData: FormData): Promise<State> => {
      const result = await requestLeave(formData);
      if (result.success) {
        formRef.current?.reset();
      }
      return result;
    },
    undefined,
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-primary)" }}>
          Type verlof <span className="text-red-500">*</span>
        </label>
        <select
          name="leaveType"
          required
          className="w-full rounded-xl border px-4 py-3.5 text-base outline-none"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        >
          <option value="">Kies type…</option>
          <option value="vakantie">Vakantie</option>
          <option value="ziekte">Ziekte</option>
          <option value="overig">Overig</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-primary)" }}>
          Startdatum <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          name="startDate"
          required
          className="w-full rounded-xl border px-4 py-3.5 text-base outline-none"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-primary)" }}>
          Einddatum
        </label>
        <input
          type="date"
          name="endDate"
          className="w-full rounded-xl border px-4 py-3.5 text-base outline-none"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-primary)" }}>
          Reden (optioneel)
        </label>
        <textarea
          name="reason"
          rows={3}
          placeholder="Toelichting…"
          className="w-full resize-none rounded-xl border px-4 py-3.5 text-base outline-none"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        />
      </div>

      {state?.error && (
        <p className="rounded-lg px-3 py-2 text-sm font-medium text-red-700" style={{ backgroundColor: "#FEF2F2" }}>
          {state.error}
        </p>
      )}

      {state?.success && (
        <p className="rounded-lg px-3 py-2 text-sm font-medium" style={{ backgroundColor: "#F0FDF4", color: "#16A34A" }}>
          Verlofaanvraag ingediend. Wacht op goedkeuring.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl px-4 py-4 text-base font-semibold text-white transition-opacity disabled:opacity-60"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        {isPending ? "Indienen…" : "Verlof aanvragen"}
      </button>
    </form>
  );
}
