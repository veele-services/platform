"use client";

import { SelectAdapter } from "@workspace/shared-ui";
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
    <form ref={formRef} action={formAction} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">
          Type verlof <span className="text-red-500">*</span>
        </label>
        <SelectAdapter
          name="leaveType"
          required
          className="w-full rounded-2xl border px-3.5 py-3 text-sm font-bold outline-none"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          <option value="">Kies type...</option>
          <option value="vakantie">Vakantie</option>
          <option value="ziekte">Ziekte</option>
          <option value="overig">Overig</option>
        </SelectAdapter>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">
            Start <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            name="startDate"
            required
            className="w-full rounded-2xl border px-3 py-3 text-sm font-bold outline-none"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-primary)",
            }}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">
            Eind
          </label>
          <input
            type="date"
            name="endDate"
            className="w-full rounded-2xl border px-3 py-3 text-sm font-bold outline-none"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-primary)",
            }}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">
          Reden (optioneel)
        </label>
        <textarea
          name="reason"
          rows={2}
          placeholder="Toelichting..."
          className="w-full resize-none rounded-2xl border px-3.5 py-3 text-sm font-semibold outline-none"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        />
      </div>

      {state?.error && (
        <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          {state.error}
        </p>
      )}

      {state?.success && (
        <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
          Verlofaanvraag ingediend. Wacht op goedkeuring.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl px-4 py-3.5 text-sm font-black text-white transition-opacity disabled:opacity-60"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        {isPending ? "Indienen..." : "Verlof aanvragen"}
      </button>
    </form>
  );
}
