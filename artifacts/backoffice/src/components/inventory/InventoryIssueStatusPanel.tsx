"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Wrench } from "lucide-react";
import {
  createInventoryMaintenanceEvent,
  updateInventoryIssueStatus,
  type InventoryIssueDetail,
  type InventoryMaintenanceRow,
} from "@/app/actions/inventory-followup";
import { Button } from "@/components/ui/button";
import {
  TenantDetailActionPanel,
  TenantWorkbenchLayout,
  TenantWorkbenchPanel,
} from "@/components/tenant-ui";

const ISSUE_STATUS_OPTIONS = [
  ["new", "Nieuw"],
  ["in_progress", "In behandeling"],
  ["waiting_supplier", "Wacht op leverancier"],
  ["resolved", "Opgelost"],
  ["unresolvable", "Niet op te lossen"],
  ["cancelled", "Geannuleerd"],
] as const;

const MAINTENANCE_TYPES = [
  ["inspection", "Keuring"],
  ["maintenance", "Onderhoud"],
  ["repair", "Reparatie"],
] as const;

const MAINTENANCE_STATUSES = [
  ["scheduled", "Gepland"],
  ["due", "Nodig"],
  ["completed", "Voltooid"],
  ["cancelled", "Geannuleerd"],
] as const;

function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("nl-NL");
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("nl-NL");
}

export function InventoryIssueStatusPanel({
  issue,
  canResolve,
  canManageMaintenance,
}: {
  issue: InventoryIssueDetail;
  canResolve: boolean;
  canManageMaintenance: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      const result = await updateInventoryIssueStatus(issue.id, {
        status: formString(formData, "status"),
        resolutionNotes: formString(formData, "resolutionNotes"),
      });
      setMessage(result.success ? "Storing bijgewerkt." : result.message);
      if (result.success) router.refresh();
    });
  }

  function handleMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      const result = await createInventoryMaintenanceEvent({
        inventoryItemId: issue.inventoryItemId,
        eventType: formString(formData, "eventType"),
        status: formString(formData, "maintenanceStatus"),
        dueDate: formString(formData, "dueDate"),
        performedAt: formString(formData, "performedAt"),
        notes: formString(formData, "notes"),
      });
      setMessage(result.success ? "Onderhoud/keuring opgeslagen." : result.message);
      if (result.success) router.refresh();
    });
  }

  return (
    <TenantWorkbenchLayout
      aside={
        <TenantDetailActionPanel
          title="Ticketacties"
          description="Werk de melding bij, plan herstel of leg onderhoud/keuring vast."
        >
          {message ? <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-foreground">{message}</div> : null}

          {canResolve ? (
            <form onSubmit={handleStatus} className="rounded-lg border border-border bg-card p-4 shadow-card">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-teal-700" />
                <h2 className="text-sm font-semibold text-foreground">Status opvolgen</h2>
              </div>
              <div className="mt-4 flex flex-col gap-4">
                <select name="status" defaultValue={issue.status} className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
                  {ISSUE_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <textarea name="resolutionNotes" defaultValue={issue.resolutionNotes ?? ""} rows={4} placeholder="Afrondingsnotitie of vervolgactie" className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "#CBD5E1" }} />
                <Button type="submit" disabled={pending}>Status opslaan</Button>
              </div>
            </form>
          ) : null}

          {canManageMaintenance ? (
            <form onSubmit={handleMaintenance} className="rounded-lg border border-border bg-card p-4 shadow-card">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-teal-700" />
                <h2 className="text-sm font-semibold text-foreground">Onderhoud / keuring</h2>
              </div>
              <div className="mt-4 flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <select name="eventType" defaultValue="repair" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
                    {MAINTENANCE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <select name="maintenanceStatus" defaultValue="scheduled" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
                    {MAINTENANCE_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input name="dueDate" type="date" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
                  <input name="performedAt" type="datetime-local" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
                </div>
                <textarea name="notes" rows={3} placeholder="Notities, bewijsstukreferentie of leverancier" className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "#CBD5E1" }} />
                <Button type="submit" disabled={pending}>Onderhoud opslaan</Button>
              </div>
            </form>
          ) : null}
        </TenantDetailActionPanel>
      }
    >
      <div className="flex flex-col gap-6">
        <TenantWorkbenchPanel id="review" title="Reviewdossier" description="Meldingcontext, omschrijving en afrondingsnotitie.">
          <div className="px-4 py-4">
            <dl className="grid gap-4 text-sm md:grid-cols-2">
              <Info label="Inventaris" value={`${issue.inventoryCode} - ${issue.inventoryName}`} />
              <Info label="Status" value={issue.status} />
              <Info label="Prioriteit" value={issue.severity} />
              <Info label="Gemeld door" value={issue.reportedByName ?? "-"} />
              <Info label="Object" value={issue.objectName ?? "-"} />
              <Info label="Personeel" value={issue.personnelName ?? "-"} />
              <Info label="Werkbon" value={issue.assignmentCode ?? "-"} />
              <Info label="Gemeld op" value={formatDateTime(issue.createdAt)} />
            </dl>
            <div className="mt-5 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              {issue.description}
            </div>
            {issue.resolutionNotes ? (
              <div className="mt-4 rounded-md bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
                {issue.resolutionNotes}
              </div>
            ) : null}
          </div>
        </TenantWorkbenchPanel>

        <TenantWorkbenchPanel id="onderhoud" title="Onderhoudshistorie" description="Keuringen, reparaties en onderhoud gekoppeld aan dit ticket.">
          {issue.maintenanceEvents.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nog geen onderhoud of keuringen geregistreerd.</p>
          ) : (
            <div className="divide-y divide-border">
              {issue.maintenanceEvents.map((event) => <MaintenanceLine key={event.id} event={event} />)}
            </div>
          )}
        </TenantWorkbenchPanel>
      </div>
    </TenantWorkbenchLayout>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function MaintenanceLine({ event }: { event: InventoryMaintenanceRow }) {
  return (
    <div className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-foreground">{event.eventType} - {event.status}</p>
        <p className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Vervaldatum: {formatDate(event.dueDate)} | Uitgevoerd: {formatDateTime(event.performedAt)} | Door: {event.performedByName ?? "-"}
      </p>
      {event.notes ? <p className="mt-1 text-xs text-foreground">{event.notes}</p> : null}
    </div>
  );
}
