"use client";

import { SelectAdapter } from "@workspace/shared-ui";
import { useActionState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { createMyCustomerTicket } from "@/actions/tickets";

const DEPARTMENT_OPTIONS = [
  { value: "planning", label: "Planning" },
  { value: "management", label: "Management" },
  { value: "backoffice", label: "Backoffice" },
  { value: "finance", label: "Financieel" },
  { value: "service", label: "Service" },
  { value: "support", label: "App support" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "low", label: "Laag" },
  { value: "normal", label: "Normaal" },
  { value: "high", label: "Hoog" },
  { value: "urgent", label: "Urgent" },
] as const;

type DepartmentValue = (typeof DEPARTMENT_OPTIONS)[number]["value"];
type PriorityValue = (typeof PRIORITY_OPTIONS)[number]["value"];

function isDepartmentValue(value?: string): value is DepartmentValue {
  return DEPARTMENT_OPTIONS.some((option) => option.value === value);
}

function isPriorityValue(value?: string): value is PriorityValue {
  return PRIORITY_OPTIONS.some((option) => option.value === value);
}

export function NewTicketForm({
  initialDepartment = "service",
  initialPriority = "normal",
  initialSubject = "",
  initialBody = "",
  contextLabel,
}: {
  initialDepartment?: string;
  initialPriority?: string;
  initialSubject?: string;
  initialBody?: string;
  contextLabel?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    createMyCustomerTicket,
    undefined,
  );
  const department = isDepartmentValue(initialDepartment)
    ? initialDepartment
    : "service";
  const priority = isPriorityValue(initialPriority)
    ? initialPriority
    : "normal";

  useEffect(() => {
    if (!state?.success) return;
    formRef.current?.reset();
    router.refresh();
  }, [router, state?.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.11)] md:p-5"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
          <Send size={21} strokeWidth={2.4} />
        </span>
        <div>
          <h2 className="text-lg font-black text-[#081D3A]">
            Nieuw contactverzoek
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Stuur uw vraag direct naar de juiste afdeling.
          </p>
          {contextLabel ? (
            <p className="mt-2 rounded-xl bg-[#F0FDFB] px-3 py-2 text-xs font-black text-[#087C79]">
              Context: {contextLabel}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Afdeling">
          <SelectAdapter
            name="department"
            className="mt-1 w-full bg-transparent text-base font-bold text-[#081D3A] outline-none"
            defaultValue={department}
          >
            {DEPARTMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectAdapter>
        </Field>
        <Field label="Prioriteit">
          <SelectAdapter
            name="priority"
            className="mt-1 w-full bg-transparent text-base font-bold text-[#081D3A] outline-none"
            defaultValue={priority}
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectAdapter>
        </Field>
      </div>

      <div className="mt-3 space-y-3">
        <Field label="Onderwerp">
          <input
            name="subject"
            maxLength={180}
            defaultValue={initialSubject}
            className="mt-1 w-full bg-transparent text-base font-bold text-[#081D3A] outline-none"
            placeholder="Bijvoorbeeld: Vraag over factuur of object"
          />
        </Field>
        <Field label="Bericht">
          <textarea
            name="body"
            rows={4}
            maxLength={4000}
            defaultValue={initialBody}
            className="mt-1 w-full resize-none bg-transparent text-base font-bold text-[#081D3A] outline-none"
            placeholder="Beschrijf uw vraag of melding zo concreet mogelijk."
          />
        </Field>
      </div>

      <div className="mt-3 rounded-2xl border border-[#D8E8F3] bg-[#F8FBFE] px-3 py-2.5">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
          Bijlagen
        </p>
        <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">
          Noem relevante bestandsnamen of documenten in uw bericht. Bestanden
          worden veilig gedeeld via Documenten of op verzoek van support.
        </p>
      </div>

      {state?.error ? (
        <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2.5 text-sm font-bold text-red-600">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-700">
          <CheckCircle2 size={17} strokeWidth={2.4} />
          Ticket aangemaakt
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00B7B3] px-4 py-3.5 text-base font-black text-white shadow-lg disabled:opacity-60"
      >
        {isPending ? <Loader2 size={19} className="animate-spin" /> : null}
        Ticket versturen
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block rounded-2xl border border-[#D8E8F3] bg-white px-3 py-2.5">
      <span className="block text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}
