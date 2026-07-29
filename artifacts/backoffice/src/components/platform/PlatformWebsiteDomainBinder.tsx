"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Loader2 } from "lucide-react";
import type { PlatformWebsiteInitializationResult } from "@/app/actions/platform-websites";
import { Button } from "@/components/ui/button";

export function PlatformWebsiteDomainBinder({
  tenantId,
  action,
}: {
  tenantId: string;
  action: (formData: FormData) => Promise<PlatformWebsiteInitializationResult>;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (
      _previous: PlatformWebsiteInitializationResult,
      formData: FormData,
    ) => action(formData),
    { success: false, message: "" },
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="tenantId" value={tenantId} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Globe2 aria-hidden="true" />
        )}
        {pending ? "Domein koppelen…" : "Primair tenantdomein koppelen"}
      </Button>
      {state.message && (
        <p
          role={state.success ? "status" : "alert"}
          className={
            state.success ? "text-sm text-emerald-700" : "text-sm text-red-700"
          }
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
