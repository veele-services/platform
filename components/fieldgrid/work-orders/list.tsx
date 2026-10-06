"use client";
import { PageHeading } from "../page-heading";
import { ListPagination } from "../list-pagination";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Eye, Pencil, MoreHorizontal, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TenantContext } from "@/lib/auth/context";
import { brandThemeStyle } from "@/lib/branding/palette";
import { workOrderViews, type WorkOrderListData, type WorkOrderOptions, type WorkOrderQuery, type WorkOrderListRow } from "@/lib/work-orders/model";
import { mutateWorkOrder } from "@/app/app/work-order-actions";
import { executionLabels } from "@/lib/dossiers/status";
import { WorkOrderWizard } from "./wizard";
import { billingLabels, orderDate, planningLabels, priorityLabels, reportLabels, sourceLabels } from "./presentation";
import { CompactFilterMenu } from "../compact-filter-menu";
import "./work-orders.css";

export function WorkOrdersList({ data, options, query, tenant, create = false }: { data: WorkOrderListData; options: WorkOrderOptions; query: WorkOrderQuery; tenant: TenantContext; create?: boolean }) {
  const router = useRouter(), path = usePathname(), params = useSearchParams();
  const [wizard, setWizard] = useState(create && data.canManage), [pending, start] = useTransition(), [error, setError] = useState("");
  const back = `${path}${params.size ? `?${params}` : ""}`;
  const href = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(params);
    next.delete("new");
    for (const [key, value] of Object.entries(patch)) { if (value === null || value === "") next.delete(key); else next.set(key, String(value)); }
    if (!("page" in patch)) next.delete("page");
    return `${path}${next.size ? `?${next}` : ""}`;
  };
  const detail = (row: WorkOrderListRow, edit = false) => `/app/werkbonnen/${row.id}?return=${encodeURIComponent(back)}${edit ? "&edit=1" : ""}`;
  const command = (row: WorkOrderListRow, action: "archive" | "cancel" | "delete") => {
    const reason = action === "cancel" ? window.prompt("Waarom wordt deze werkbon geannuleerd?") : undefined;
    if (action === "cancel" && !reason?.trim()) return;
    if (action !== "cancel" && !window.confirm(action === "delete" ? "Dit ongebruikte concept verwijderen?" : "Deze werkbon archiveren? De historie blijft behouden.")) return;
    setError("");
    start(async () => {
      try {
        const result = await mutateWorkOrder({ orderId: row.id, version: row.version, mutationId: crypto.randomUUID(), action, ...(reason ? { reason } : {}) });
        if (!result.ok) { setError(result.error); return; }
        toast.success(action === "cancel" ? "Werkbon geannuleerd" : action === "delete" ? "Concept verwijderd" : "Werkbon gearchiveerd");
        router.refresh();
      } catch { setError("De wijziging is niet bevestigd. Vernieuw de lijst en probeer opnieuw."); }
    });
  };
  const filterLabels: Record<string, string> = { q: "Zoeken", customer: "Klant", object: "Object", employee: "Medewerker", discipline: "Dienst", priority: "Prioriteit", source: "Bron", from: "Vanaf", to: "Tot en met", planning: "Planning", execution: "Uitvoering", report: "Rapport", ...(data.finance ? { billing: "Facturatie" } : {}), exception: "Uitzondering", archived: "Gearchiveerd" };
  const filterValue = (key: string, value: string) => key === "customer" ? options.customers.find(c => c.id === value)?.name ?? value : key === "object" ? options.objects.find(o => o.id === value)?.name ?? value : key === "employee" ? options.personnel.find(p => p.id === value)?.full_name ?? value : key === "priority" ? priorityLabels[value] : key === "source" ? sourceLabels[value] ?? value : key === "planning" ? planningLabels[value] ?? value : key === "execution" ? executionLabels[value] ?? value : key === "billing" ? billingLabels[value] ?? value : key === "report" ? reportLabels[value] ?? value : key === "exception" ? ({ crew: "Onvolledige bezetting", signature: "Handtekening ontbreekt", remaining: "Restwerk", blocked: "Geblokkeerd" })[value as "crew"] : key === "archived" ? "Ja" : value;
  const active = Object.entries(query).filter(([key, value]) => filterLabels[key] && value);
  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const patch: Record<string, string | null> = {};
    new FormData(event.currentTarget).forEach((value, key) => { patch[key] = String(value) || null; });
    router.push(href(patch));
  };
  return <div className="wo-workspace" aria-busy={pending}>
    <PageHeading eyebrow="UITVOERING" title="Werkbonnen" help="Afspraken, bezetting, uitvoering en rapportcontrole." actions={<><select className="secondary-button page-status-select" aria-label="Werkweergave" value={query.view} onChange={event=>router.push(href({view:event.target.value}),{scroll:false})}>{Object.entries(workOrderViews).map(([key,label])=><option key={key} value={key}>{label} ({data.counts[key as keyof typeof workOrderViews]??0})</option>)}</select><CompactFilterMenu activeCount={active.length} contentClassName="wo-filter-panel" contentStyle={brandThemeStyle(tenant.primaryColor, tenant.accentColor)}><form onSubmit={applyFilters}><div className="wo-filter-grid">
        <label className="wo-filter-wide">Zoeken<input name="q" defaultValue={query.q} placeholder="Bonnummer, titel, klant, object of adres…" aria-label="Zoek werkbonnen"/></label>
        <label>Sortering<select name="sort" defaultValue={query.sort}>{[["date", "Datum oplopend"], ["date_desc", "Datum aflopend"], ["number", "Bonnummer"], ["title", "Titel"], ["customer", "Klant"], ["status", "Uitvoering"]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Vanaf<input name="from" type="date" defaultValue={query.from}/></label><label>Tot en met<input name="to" type="date" defaultValue={query.to}/></label>
        <label>Medewerker<select name="employee" defaultValue={query.employee}><option value="">Alle medewerkers</option>{options.personnel.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
        <label>Dienstcategorie<select name="discipline" defaultValue={query.discipline}><option value="">Alle diensten</option>{options.disciplines.map(d => <option key={d}>{d}</option>)}</select></label>
        <label>Prioriteit<select name="priority" defaultValue={query.priority}><option value="">Alle prioriteiten</option>{Object.entries(priorityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Bron<select name="source" defaultValue={query.source}><option value="">Alle bronnen</option>{Object.entries(sourceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Planningsstatus<select aria-label="Planningsstatus" name="planning" defaultValue={query.planning}><option value="">Alle planningsstatussen</option>{Object.entries(planningLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Uitvoeringsstatus<select aria-label="Uitvoeringsstatus" name="execution" defaultValue={query.execution}><option value="">Alle uitvoeringsstatussen</option>{Object.entries(executionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Rapportstatus<select name="report" defaultValue={query.report}><option value="">Alle rapportstatussen</option>{["draft", "waiting_signature", "review", "correction", "approved"].map(key => <option key={key} value={key}>{reportLabels[key]}</option>)}</select></label>
        {data.finance && <label>Facturatiestatus<select aria-label="Facturatiestatus" name="billing" defaultValue={query.billing}><option value="">Alle facturatiestatussen</option>{["not_ready", "ready", "partial", "invoiced"].map(key => <option key={key} value={key}>{billingLabels[key]}</option>)}</select></label>}
        <label>Uitzondering<select name="exception" defaultValue={query.exception}><option value="">Alle werkbonnen</option><option value="crew">Onvolledige bezetting</option><option value="signature">Handtekening ontbreekt</option><option value="remaining">Restwerk</option><option value="blocked">Geblokkeerd</option></select></label>
        <label>Klant<select name="customer" defaultValue={query.customer}><option value="">Alle klanten</option>{options.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Object<select name="object" defaultValue={query.object}><option value="">Alle objecten</option>{options.objects.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        <label>Archief<select name="archived" defaultValue={query.archived}><option value="">Actuele werkbonnen</option><option value="yes">Inclusief archief</option></select></label>
      </div><footer><div className="wo-filter-links"><Link className="text-link" href="/app/werkbonnen">Filters wissen</Link>{data.canManage && <Link className="text-link" href="/app/taken/templates">Templates beheren</Link>}</div><button className="primary-button">Toepassen</button></footer></form></CompactFilterMenu>{data.canManage&&<button className="primary-button" onClick={()=>setWizard(true)}><Plus size={17}/>Nieuwe werkbon</button>}</>}/>
    {active.length > 0 && <div className="wo-filter-chips" aria-label="Actieve filters">{active.map(([key, value]) => <Link key={key} href={href({ [key]: null })} aria-label={`${filterLabels[key]} verwijderen`}>{filterLabels[key]}: {filterValue(key, String(value))}<X size={12}/></Link>)}</div>}
    {error && <p className="wo-error" role="alert">{error}</p>}
    <section className="panel resource-table-panel" aria-label="Werkbonnenlijst"><div className="table-scroll"><table className="resource-table wo-table"><thead><tr>{["Bonnummer / titel", "Klant / object", "Datum / tijdvenster", "Medewerkers", "Uitvoering", "Rapportcontrole", ...(data.finance ? ["Facturatie"] : []), "Acties"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>
      {data.rows.map(row => <tr key={row.id}><td><Link href={detail(row)}><strong>{row.number}</strong></Link><small>{row.title}</small>{row.archived && <small>Gearchiveerd</small>}</td><td>{row.customer}<small>{row.object}</small></td><td>{orderDate(row.start, tenant.timezone)}{row.end && <small>tot {orderDate(row.end, tenant.timezone)}</small>}{row.deadline && <small>Uiterlijk {orderDate(row.deadline, tenant.timezone, false)}</small>}</td><td>{row.crew.map(p => p.name).join(", ") || "Nog geen medewerkers"}{row.assignedPersonnel < row.requiredPersonnel && <small className="wo-status" data-tone="warning">{row.requiredPersonnel - row.assignedPersonnel} medewerker(s) ontbreken</small>}</td><td><span className="wo-status">{executionLabels[row.status] ?? "Nog niet gestart"}</span></td><td><span className="wo-status" data-tone={row.reportState.includes("signature") ? "warning" : undefined}>{reportLabels[row.reportState] ?? "Concept"}</span></td>{data.finance && <td>{billingLabels[row.billingState ?? ""] ?? "Nog niet gereed"}</td>}<td><div className="resource-actions"><Link className="resource-action" href={detail(row)} aria-label={`Bekijk ${row.number}`} title="Bekijk"><Eye size={14}/></Link>{row.canEdit && <Link className="resource-action" href={detail(row, true)} aria-label={`Bewerk ${row.number}`} title="Bewerk"><Pencil size={14}/></Link>}<Popover><PopoverTrigger asChild><button className="resource-action" aria-label={`Meer acties voor ${row.number}`} title="Meer"><MoreHorizontal size={14}/></button></PopoverTrigger><PopoverContent className="resource-more-content" align="end"><Link href={`/app/planning?order=${row.id}`}>Open planbord</Link><Link href={`${detail(row)}&tab=historie`}>Bekijk historie</Link>{row.canEdit && !row.archived && <button disabled={pending} onClick={() => command(row, "archive")}>Archiveren</button>}{row.canEdit && row.status !== "cancelled" && <button disabled={pending} onClick={() => command(row, "cancel")}>Annuleren</button>}{row.canDelete && <button disabled={pending} onClick={() => command(row, "delete")}>Ongebruikt concept verwijderen</button>}</PopoverContent></Popover></div></td></tr>)}
    </tbody></table></div>{!data.rows.length && <div className="wo-empty">Geen werkbonnen voor deze selectie.{active.length > 0 && <> <Link className="text-link" href="/app/werkbonnen">Filters wissen</Link></>}</div>}</section><ListPagination total={data.total} page={data.page} pageSize={data.pageSize} noun="werkbonnen" preferenceKey={`backoffice:${tenant.id}:work-orders`} href={back}/>

    {wizard && <WorkOrderWizard tenant={tenant} options={options} onClose={() => setWizard(false)} onSaved={id => { setWizard(false); router.push(`/app/werkbonnen/${id}`); router.refresh(); }}/>}
  </div>;
}
