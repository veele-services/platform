"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/ui/form-actions";

export function SettingsStickySaveBar({
  canWrite,
  pending,
  saved,
  error,
  submitLabel = "Wijzigingen opslaan",
  pendingLabel = "Opslaan...",
  savedLabel = "Opgeslagen",
  onSave,
  children,
}: {
  canWrite: boolean;
  pending: boolean;
  saved?: boolean;
  error?: React.ReactNode;
  submitLabel?: React.ReactNode;
  pendingLabel?: React.ReactNode;
  savedLabel?: React.ReactNode;
  onSave?: () => void;
  children?: React.ReactNode;
}) {
  if (!canWrite) return null;

  return (
    <FormActions
      status={error ? "error" : pending ? "pending" : saved ? "success" : "idle"}
      message={
        error ??
        (saved
          ? savedLabel
          : pending
            ? pendingLabel
            : "Niet-opgeslagen wijzigingen worden hier bevestigd.")
      }
    >
      {children}
      <Button
        className="w-full sm:w-auto"
        type={onSave ? "button" : "submit"}
        onClick={onSave}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {pending ? pendingLabel : submitLabel}
      </Button>
    </FormActions>
  );
}
