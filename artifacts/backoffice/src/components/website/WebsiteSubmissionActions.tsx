"use client";

import type { WebsiteSubmissionDetail } from "@workspace/db";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  convertWebsiteSubmissionToLeadAction,
  redactWebsiteSubmissionAction,
  retryWebsiteSubmissionNotificationAction,
  transitionWebsiteSubmissionAction,
} from "@/app/actions/website-forms";
import { Button } from "@/components/ui/button";
import { TenantConfirmDialog } from "@/components/tenant-ui";

export function WebsiteSubmissionActions({
  submission,
  canWrite,
  canConvert,
}: {
  submission: WebsiteSubmissionDetail;
  canWrite: boolean;
  canConvert: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redactDialogOpen, setRedactDialogOpen] = useState(false);

  function run(
    operation: () => Promise<
      { success: true; data?: unknown } | { success: false; message: string }
    >,
    successMessage: string,
  ) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await operation();
      if (!result.success) {
        setError(result.message);
        return;
      }
      setMessage(successMessage);
      router.refresh();
    });
  }

  function transition(
    status: "read" | "in_progress" | "archived" | "spam",
    label: string,
  ) {
    run(
      () =>
        transitionWebsiteSubmissionAction({
          submissionId: submission.id,
          status,
        }),
      label,
    );
  }

  function convert() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await convertWebsiteSubmissionToLeadAction({
        submissionId: submission.id,
      });
      if (!result.success || !result.data) {
        setError(
          result.success ? "Leadconversie gaf geen resultaat." : result.message,
        );
        return;
      }
      router.push(`/customers/${result.data.customerId}`);
    });
  }

  function redact() {
    run(
      () => redactWebsiteSubmissionAction({ submissionId: submission.id }),
      "Persoonsgegevens zijn gewist.",
    );
  }

  if (!canWrite) return null;
  const inactive = isPending || submission.isRedacted;
  return (
    <section className="veele-card space-y-3">
      <div>
        <h2 className="font-semibold text-slate-950">Verwerken</h2>
        <p className="mt-1 text-sm text-slate-600">
          Statuswijzigingen en conversie worden tenant-scoped en append-only
          vastgelegd.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {submission.status === "new" ? (
          <Button
            type="button"
            variant="outline"
            disabled={inactive}
            onClick={() => transition("read", "Gemarkeerd als gelezen.")}
          >
            Markeer gelezen
          </Button>
        ) : null}
        {["new", "read"].includes(submission.status) ? (
          <Button
            type="button"
            variant="outline"
            disabled={inactive}
            onClick={() =>
              transition("in_progress", "Gemarkeerd als in behandeling.")
            }
          >
            In behandeling
          </Button>
        ) : null}
        {!["converted", "archived", "spam"].includes(submission.status) ? (
          <Button
            type="button"
            variant="outline"
            disabled={inactive}
            onClick={() => transition("spam", "Gemarkeerd als spam.")}
          >
            Spam
          </Button>
        ) : null}
        {submission.status !== "archived" ? (
          <Button
            type="button"
            variant="outline"
            disabled={inactive}
            onClick={() => transition("archived", "Inzending gearchiveerd.")}
          >
            Archiveren
          </Button>
        ) : null}
        {canConvert &&
        !submission.customerId &&
        !["archived", "spam"].includes(submission.status) ? (
          <Button type="button" disabled={inactive} onClick={convert}>
            Converteer naar lead
          </Button>
        ) : null}
        {["pending", "failed", "sending"].includes(
          submission.notificationStatus,
        ) ? (
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              run(
                () =>
                  retryWebsiteSubmissionNotificationAction({
                    submissionId: submission.id,
                  }),
                "Notificatiepoging afgerond.",
              )
            }
          >
            Notificatie opnieuw proberen
          </Button>
        ) : null}
        {!submission.isRedacted ? (
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={() => setRedactDialogOpen(true)}
          >
            Persoonsgegevens wissen
          </Button>
        ) : null}
      </div>
      {message ? (
        <p role="status" className="text-sm font-medium text-emerald-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
      <TenantConfirmDialog
        open={redactDialogOpen}
        onOpenChange={setRedactDialogOpen}
        title="Persoonsgegevens definitief wissen?"
        description="Contactgegevens en formulierinhoud worden permanent verwijderd. De audit-tijdlijn en eventuele lead blijven behouden."
        confirmLabel="Definitief wissen"
        destructive
        confirmDisabled={isPending}
        onConfirm={redact}
      />
    </section>
  );
}
