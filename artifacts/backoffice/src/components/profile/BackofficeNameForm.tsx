"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, UserRound } from "lucide-react";
import {
  updateOwnBackofficeProfile,
  type BackofficeProfileActionState,
} from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: BackofficeProfileActionState = {
  success: false,
  message: null,
};

export function BackofficeNameForm({
  initialName,
  onboarding = false,
}: {
  initialName: string;
  onboarding?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateOwnBackofficeProfile, INITIAL_STATE);

  useEffect(() => {
    if (!state.success) return;
    if (onboarding) {
      router.replace("/");
      return;
    }
    router.refresh();
  }, [onboarding, router, state.success]);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="fullName">
          Volledige naam <span className="text-red-600">*</span>
        </Label>
        <div className="relative">
          <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            autoFocus={onboarding}
            required
            minLength={2}
            maxLength={120}
            defaultValue={state.name ?? initialName}
            placeholder="Voor- en achternaam"
            className="h-11 pl-9"
            disabled={pending}
          />
        </div>
        <p className="text-xs leading-5 text-slate-500">
          Deze naam is zichtbaar voor andere backofficegebruikers en in de activiteitslog.
        </p>
      </div>

      {state.message ? (
        <p
          role={state.success ? "status" : "alert"}
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            state.success
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {state.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="min-w-36">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {pending ? "Opslaan..." : onboarding ? "Naam opslaan en doorgaan" : "Naam opslaan"}
      </Button>
    </form>
  );
}
