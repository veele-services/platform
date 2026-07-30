"use client";

import { useActionState, useEffect, useId } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { PlatformWebsiteInitializationResult } from "@/app/actions/platform-websites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RegistrationIdentity = {
  tenantId: string;
  siteId: string;
  providerKey: string;
  routeKey: string;
  releaseId: string;
  expectedHost: string;
  healthPath: string;
};

export function PlatformWebsiteDeploymentRegistrar({
  identity,
  action,
}: {
  identity: RegistrationIdentity;
  action: (formData: FormData) => Promise<PlatformWebsiteInitializationResult>;
}) {
  const router = useRouter();
  const changeReferenceId = useId();
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
    <form
      action={formAction}
      className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
    >
      {Object.entries(identity).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="grid gap-1.5">
        <Label htmlFor={changeReferenceId}>Wijzigingsreferentie</Label>
        <Input
          id={changeReferenceId}
          required
          name="changeReference"
          minLength={3}
          maxLength={160}
          pattern="[A-Za-z0-9][A-Za-z0-9._:/# -]*"
          placeholder="FG-WEB-123 / custom-registratie"
          autoComplete="off"
          aria-describedby={`${changeReferenceId}-help`}
        />
        <p id={`${changeReferenceId}-help`} className="text-xs text-slate-500">
          Vrij auditlabel; dit hoeft geen Git-commit of release-SHA te zijn.
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        {pending ? "Registreren…" : "Exacte kandidaat registreren"}
      </Button>
      {state.message && (
        <p
          role={state.success ? "status" : "alert"}
          className={`text-sm sm:col-span-2 ${
            state.success ? "text-emerald-700" : "text-red-700"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
