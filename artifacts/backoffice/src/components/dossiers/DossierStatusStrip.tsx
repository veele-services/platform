import { Archive, CalendarClock, CheckCircle2, CircleAlert, ClipboardList, UserRound } from "lucide-react";

import type { DossierSummary } from "@/app/actions/dossier360";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<DossierSummary["status"], string> = {
  active: "Actief",
  attention: "Aandacht nodig",
  archived: "Gearchiveerd",
  closed: "Gesloten",
};

function formatDate(value: string | null): string {
  if (!value) return "Niet beoordeeld";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}

export function DossierStatusStrip({ dossier }: { dossier: DossierSummary | null }) {
  if (!dossier) return null;

  const attention = dossier.status === "attention" || dossier.openTaskCount > 0;
  const StatusIcon = attention ? CircleAlert : CheckCircle2;

  return (
    <section
      aria-label="Dossierstatus"
      className="mb-5 rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        <div className="min-w-32">
          <p className="text-xs text-muted-foreground">Dossier</p>
          <p className="font-mono font-semibold text-foreground">{dossier.dossierNumber}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusIcon
            aria-hidden="true"
            className={cn("h-4 w-4", attention ? "text-warning-foreground" : "text-success-foreground")}
          />
          <span>{STATUS_LABEL[dossier.status]}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <UserRound aria-hidden="true" className="h-4 w-4" />
          <span>{dossier.managerAssigned ? "Verantwoordelijke toegewezen" : "Geen verantwoordelijke"}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarClock aria-hidden="true" className="h-4 w-4" />
          <span>Laatst beoordeeld: {formatDate(dossier.lastReviewedAt)}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <ClipboardList aria-hidden="true" className="h-4 w-4" />
          <span>{dossier.openTaskCount} open {dossier.openTaskCount === 1 ? "taak" : "taken"}</span>
        </div>
        {dossier.legalHold && (
          <div className="flex items-center gap-2 font-medium text-destructive">
            <Archive aria-hidden="true" className="h-4 w-4" />
            <span>Legal hold actief</span>
          </div>
        )}
      </div>
    </section>
  );
}
