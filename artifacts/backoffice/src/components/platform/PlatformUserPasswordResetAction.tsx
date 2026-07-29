"use client";

import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

type PasswordResetState = {
  success: boolean;
  message?: string;
};

export function PlatformUserPasswordResetAction({
  platformUserId,
  action,
}: {
  platformUserId: string;
  action: (formData: FormData) => Promise<PasswordResetState>;
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: PasswordResetState, formData: FormData) =>
      action(formData),
    { success: false },
  );

  return (
    <form action={formAction} className="grid justify-items-end gap-1">
      <input type="hidden" name="platformUserId" value={platformUserId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-10 items-center gap-2 rounded border border-cyan-200 bg-cyan-50 px-4 text-sm font-semibold text-cyan-800 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <KeyRound className="size-4" aria-hidden="true" />
        )}
        {pending ? "Versturen…" : "Resetcode mailen"}
      </button>
      {state.success && (
        <p role="status" className="text-xs text-emerald-700">
          Resetcode is verstuurd.
        </p>
      )}
      {!state.success && state.message && (
        <p role="alert" className="max-w-80 text-right text-xs text-red-700">
          {state.message}
        </p>
      )}
    </form>
  );
}
