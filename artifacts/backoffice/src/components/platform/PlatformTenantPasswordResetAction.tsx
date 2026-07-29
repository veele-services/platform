"use client";

import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

type PasswordResetState = {
  success: boolean;
  message?: string;
};

export function PlatformTenantPasswordResetAction({
  tenantId,
  userId,
  action,
}: {
  tenantId: string;
  userId: string;
  action: (formData: FormData) => Promise<PasswordResetState>;
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: PasswordResetState, formData: FormData) =>
      action(formData),
    { success: false },
  );

  return (
    <form action={formAction} className="grid justify-items-end gap-1">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <KeyRound className="size-3.5" aria-hidden="true" />
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
