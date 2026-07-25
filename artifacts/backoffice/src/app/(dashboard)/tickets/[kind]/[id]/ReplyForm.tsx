"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { replyToTicket, type TicketKind } from "@/app/actions/tickets";

export function ReplyForm({
  kind,
  ticketId,
  disabled,
}: {
  kind: TicketKind;
  ticketId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    replyToTicket.bind(null, kind, ticketId),
    undefined,
  );

  useEffect(() => {
    if (!state?.success) return;
    formRef.current?.reset();
    router.refresh();
  }, [router, state?.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <label className="block rounded-lg border bg-white px-3 py-2.5" style={{ borderColor: "#E2E8F0" }}>
        <span className="block text-xs font-bold uppercase tracking-wide text-slate-400">
          Reactie
        </span>
        <textarea
          name="body"
          rows={5}
          maxLength={4000}
          disabled={disabled}
          className="mt-1 w-full resize-none bg-transparent text-sm font-semibold leading-6 outline-none disabled:opacity-50"
          style={{ color: "var(--color-foreground)" }}
          placeholder={disabled ? "Dit ticket is gesloten." : "Typ de reactie namens de backoffice..."}
        />
      </label>

      {state?.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm font-bold text-red-600">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-700">
          <CheckCircle2 size={17} strokeWidth={2.4} />
          Reactie verzonden
        </p>
      ) : null}

      <button
        type="submit"
        disabled={disabled || isPending}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-black text-white shadow-sm disabled:opacity-60"
      >
        {isPending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
        Versturen
      </button>
    </form>
  );
}
