"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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

type ActionResult = { success: boolean; message?: string };
type LifecycleAction = "suspend" | "reactivate" | "archive";

const CONTENT: Record<
  LifecycleAction,
  {
    trigger: string;
    title: string;
    description: string;
    confirm: string;
    destructive: boolean;
  }
> = {
  suspend: {
    trigger: "Pauzeren",
    title: "Organisatie pauzeren?",
    description:
      "Gebruikers verliezen toegang tot de organisatie. De gegevens blijven bewaard en deze wijziging wordt vastgelegd in de beveiligingslog.",
    confirm: "Ja, organisatie pauzeren",
    destructive: true,
  },
  reactivate: {
    trigger: "Heractiveren",
    title: "Organisatie heractiveren?",
    description:
      "De organisatie wordt opnieuw actief. Controleer vooraf de domeinstatus, het abonnement en de gereedheidssignalen.",
    confirm: "Organisatie heractiveren",
    destructive: false,
  },
  archive: {
    trigger: "Archiveren",
    title: "Organisatie archiveren?",
    description:
      "De organisatie wordt buiten gebruik gesteld. Dit is een ingrijpende lifecyclewijziging en wordt vastgelegd in de beveiligingslog.",
    confirm: "Ja, organisatie archiveren",
    destructive: true,
  },
};

export function PlatformLifecycleAction({
  tenantId,
  lifecycleAction,
  action,
}: {
  tenantId: string;
  lifecycleAction: LifecycleAction;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const content = CONTENT[lifecycleAction];
  const [state, formAction, pending] = useActionState(
    async (_previous: ActionResult, formData: FormData) => action(formData),
    { success: false },
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  return (
    <div className="grid gap-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={content.destructive ? "destructive" : "outline"}
            disabled={pending}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {pending ? "Bezig…" : content.trigger}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <form action={formAction}>
            <input type="hidden" name="tenantId" value={tenantId} />
            <input
              type="hidden"
              name="lifecycleAction"
              value={lifecycleAction}
            />
            <AlertDialogHeader>
              <AlertDialogTitle>{content.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {content.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-6">
              <AlertDialogCancel disabled={pending}>
                Annuleren
              </AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                disabled={pending}
                className={
                  content.destructive
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : undefined
                }
              >
                {content.confirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      {state.message && !state.success && (
        <p role="alert" className="max-w-48 text-xs text-red-700">
          {state.message}
        </p>
      )}
    </div>
  );
}
