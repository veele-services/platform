"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { replyToMyTicket } from "@/actions/messages";

export function ReplyForm({ ticketId, disabled }: { ticketId: string; disabled: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    replyToMyTicket.bind(null, ticketId),
    undefined,
  );

  useEffect(() => {
    if (!state?.success) return;
    formRef.current?.reset();
    router.refresh();
  }, [router, state?.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <label className="block rounded-2xl border border-[#D8E8F3] bg-white px-3 py-2.5">
        <span className="block text-xs font-bold uppercase tracking-wide text-slate-400">
          Reactie
        </span>
        <textarea
          name="body"
          rows={4}
          maxLength={4000}
          disabled={disabled}
          className="mt-1 w-full resize-none bg-transparent text-base font-bold text-[var(--color-primary)] outline-none disabled:opacity-50"
          placeholder={
            disabled
              ? "Dit ticket is gesloten. Heropen het ticket om te reageren."
              : "Typ je reactie..."
          }
        />
      </label>

      {state?.error ? (
        <p className="rounded-2xl bg-red-50 px-3 py-2.5 text-sm font-bold text-red-600">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-700">
          <CheckCircle2 size={17} strokeWidth={2.4} />
          Reactie verzonden
        </p>
      ) : null}

      <button
        type="submit"
        disabled={disabled || isPending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-accent)] px-4 py-3.5 text-base font-semibold text-white shadow-lg disabled:opacity-60"
      >
        {isPending ? (
          <Loader2 size={19} className="animate-spin" />
        ) : (
          <Send size={19} strokeWidth={2.4} />
        )}
        Reactie versturen
      </button>
    </form>
  );
}
