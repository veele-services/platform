"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import {
  createMyTicket,
  TICKET_DEPARTMENT_OPTIONS,
  TICKET_PRIORITY_OPTIONS,
} from "@/actions/messages";

export function NewTicketForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    createMyTicket,
    undefined,
  );

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
            Nieuw bericht
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Start een ticket bij de juiste afdeling.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Afdeling">
          <select
            name="department"
            className="mt-1 w-full bg-transparent text-base font-bold text-[#081D3A] outline-none"
            defaultValue="planning"
          >
            {TICKET_DEPARTMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prioriteit">
          <select
            name="priority"
            className="mt-1 w-full bg-transparent text-base font-bold text-[#081D3A] outline-none"
            defaultValue="normal"
          >
            {TICKET_PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-3 space-y-3">
        <Field label="Onderwerp">
          <input
            name="subject"
            maxLength={180}
            className="mt-1 w-full bg-transparent text-base font-bold text-[#081D3A] outline-none"
            placeholder="Bijvoorbeeld: Vraag over dienst maandag"
          />
        </Field>
        <Field label="Bericht">
          <textarea
            name="body"
            rows={4}
            maxLength={4000}
            className="mt-1 w-full resize-none bg-transparent text-base font-bold text-[#081D3A] outline-none"
            placeholder="Beschrijf wat je nodig hebt of wilt doorgeven."
          />
        </Field>
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
        Bericht versturen
      </button>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block rounded-2xl border border-[#D8E8F3] bg-white px-3 py-2.5">
      <span className="block text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}
