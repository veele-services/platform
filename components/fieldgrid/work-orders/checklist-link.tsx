"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { TenantContext } from "@/lib/auth/context";
import type { WorkTemplate } from "@/lib/work-orders/model";
import { attachWorkOrderChecklist } from "@/lib/work-orders/checklist-actions";
import { WorkOrderDialog } from "./dialog";

export function ChecklistLinkDialog({ orderId, version, templates, linked, tenant, onClose, onSaved }: { orderId: string; version: number; templates: WorkTemplate[]; linked: string[]; tenant: TenantContext; onClose: () => void; onSaved: () => void }) {
  const [selected, setSelected] = useState(""), [error, setError] = useState(""), [pending, start] = useTransition(), [mutationId, setMutationId] = useState(() => crypto.randomUUID());
  const available = templates.filter(template => template.kind === "checklist" && template.state === "published" && !linked.includes(template.revisionId));
  return <WorkOrderDialog title="Checklist toevoegen" description="Koppel een gepubliceerde checklist aan deze werkbon." tenant={tenant} onClose={onClose} dirty={!!selected} busy={pending}>
    <form id="link-checklist" className="wo-dialog-body wo-form" onSubmit={event => { event.preventDefault(); start(async () => {
      const result = await attachWorkOrderChecklist({ orderId, version, revisionId: selected, mutationId });
      if (!result.ok) { setError(result.error); return; }
      toast.success("Checklist aan werkbon toegevoegd"); onSaved();
    }); }}>
      <label className="wide">Checklist<select required value={selected} disabled={pending} onChange={event => { setSelected(event.target.value); setError(""); setMutationId(crypto.randomUUID()); }}><option value="">Kies een checklist</option>{available.map(template => <option key={template.revisionId} value={template.revisionId}>{template.name} · versie {template.version}</option>)}</select></label>
      {!available.length && <p className="wide">Er zijn geen ongekoppelde gepubliceerde checklists beschikbaar. Maak of publiceer eerst een checklist bij <Link href="/app/taken/templates?kind=checklist">Templates beheren</Link>.</p>}
      <p className="wide">De vastgelegde checklistversie en bestaande antwoorden blijven behouden. Verplichte vragen moeten vóór oplevering worden ingevuld.</p>
      {error && <p className="wo-error wide" role="alert">{error}</p>}
    </form>
    <footer className="wizard-footer"><button className="secondary-button" disabled={pending} onClick={onClose}>Annuleren</button><button type="submit" form="link-checklist" className="primary-button" disabled={pending || !selected}>{pending ? "Toevoegen…" : "Checklist toevoegen"}</button></footer>
  </WorkOrderDialog>;
}
