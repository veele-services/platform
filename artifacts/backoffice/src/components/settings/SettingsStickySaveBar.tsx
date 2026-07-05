"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="sticky bottom-4 z-20 mt-6 rounded-lg border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm text-muted-foreground">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : saved ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {savedLabel}
            </span>
          ) : (
            <span>Niet-opgeslagen wijzigingen worden hier bevestigd.</span>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {children}
          <Button type={onSave ? "button" : "submit"} onClick={onSave} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {pending ? pendingLabel : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
