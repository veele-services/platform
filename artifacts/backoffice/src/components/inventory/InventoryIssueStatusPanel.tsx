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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="veele-card">
        <h2 className="font-heading mb-4 text-sm font-semibold" style={{ color: "#081D3A" }}>Storingsmelding</h2>
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
        <div className="mt-5 rounded-md bg-slate-50 p-4 text-sm leading-6" style={{ color: "#334155" }}>
          {issue.description}
        </div>
        {issue.resolutionNotes ? (
          <div className="mt-4 rounded-md bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
            {issue.resolutionNotes}
          </div>
        ) : null}
      </div>

      <div className="space-y-6">
        {message ? <div className="rounded-md border px-4 py-3 text-sm" style={{ borderColor: "#CBD5E1", color: "#334155" }}>{message}</div> : null}

        {canResolve ? (
          <form onSubmit={handleStatus} className="veele-card flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" style={{ color: "#0F766E" }} />
              <h2 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>Status opvolgen</h2>
            </div>
            <select name="status" defaultValue={issue.status} className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
              {ISSUE_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <textarea name="resolutionNotes" defaultValue={issue.resolutionNotes ?? ""} rows={4} placeholder="Afrondingsnotitie of vervolgactie" className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "#CBD5E1" }} />
            <button type="submit" disabled={pending} className="h-10 rounded-md px-3 text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: "#0F766E" }}>
              Status opslaan
            </button>
          </form>
        ) : null}

        {canManageMaintenance ? (
          <form onSubmit={handleMaintenance} className="veele-card flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4" style={{ color: "#0F766E" }} />
              <h2 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>Onderhoud / keuring</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select name="eventType" defaultValue="repair" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
                {MAINTENANCE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select name="maintenanceStatus" defaultValue="scheduled" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }}>
                {MAINTENANCE_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input name="dueDate" type="date" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
              <input name="performedAt" type="datetime-local" className="h-10 rounded-md border px-3 text-sm" style={{ borderColor: "#CBD5E1" }} />
            </div>
            <textarea name="notes" rows={3} placeholder="Notities, bewijsstukreferentie of leverancier" className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "#CBD5E1" }} />
            <button type="submit" disabled={pending} className="h-10 rounded-md px-3 text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: "#0F766E" }}>
              Onderhoud opslaan
            </button>
          </form>
        ) : null}
      </div>

      <div className="veele-card xl:col-span-2">
        <h2 className="font-heading mb-4 text-sm font-semibold" style={{ color: "#081D3A" }}>Onderhoudshistorie</h2>
        {issue.maintenanceEvents.length === 0 ? (
          <p className="text-sm" style={{ color: "#64748B" }}>Nog geen onderhoud of keuringen geregistreerd.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: "#E2E8F0" }}>
            {issue.maintenanceEvents.map((event) => <MaintenanceLine key={event.id} event={event} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase" style={{ color: "#64748B" }}>{label}</dt>
      <dd className="mt-1 font-medium" style={{ color: "#081D3A" }}>{value}</dd>
    </div>
  );
}

function MaintenanceLine({ event }: { event: InventoryMaintenanceRow }) {
  return (
    <div className="py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold" style={{ color: "#081D3A" }}>{event.eventType} - {event.status}</p>
        <p className="text-xs" style={{ color: "#94A3B8" }}>{formatDateTime(event.createdAt)}</p>
      </div>
      <p className="mt-1 text-xs" style={{ color: "#64748B" }}>
        Vervaldatum: {formatDate(event.dueDate)} | Uitgevoerd: {formatDateTime(event.performedAt)} | Door: {event.performedByName ?? "-"}
      </p>
      {event.notes ? <p className="mt-1 text-xs" style={{ color: "#334155" }}>{event.notes}</p> : null}
    </div>
  );
}
