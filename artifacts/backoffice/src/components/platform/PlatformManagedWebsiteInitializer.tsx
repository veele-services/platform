"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Rocket } from "lucide-react";
import type { PlatformWebsiteInitializationResult } from "@/app/actions/platform-websites";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function PlatformManagedWebsiteInitializer({
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
    <div className="grid gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Rocket aria-hidden="true" />
            )}
            {pending ? "Initialiseren…" : "Managed website initialiseren"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <form action={formAction}>
            <input type="hidden" name="tenantId" value={tenantId} />
            <AlertDialogHeader>
              <AlertDialogTitle>
                Managed website initialiseren?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Fieldgrid maakt een primaire conceptsite met het standaard
                conversiesjabloon, basispagina&apos;s en navigatie. Deze actie
                publiceert niets, activeert geen domein en start geen
                deployment.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-6">
              <AlertDialogCancel disabled={pending}>
                Annuleren
              </AlertDialogCancel>
              <AlertDialogAction type="submit" disabled={pending}>
                Conceptsite aanmaken
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
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
    </div>
  );
}
