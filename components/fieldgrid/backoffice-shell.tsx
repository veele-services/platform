"use client";

import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, BriefcaseBusiness, Building2, CalendarDays, ChevronRight, ClipboardCheck,
  Clock3, CreditCard, FileCheck2, FileText, LayoutDashboard, LogOut, Megaphone,
  Menu, PackageCheck, Search, Send, Settings, ShieldCheck,
  UsersRound, Wrench,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import type { AuthContext } from "@/lib/auth/context";
import type { WorkspaceData } from "@/lib/data/workspace";
import type { ActionResult } from "@/lib/actions/result";
import { FieldgridBrand } from "@/components/fieldgrid/brand";
import { switchTenant } from "@/app/app/actions";
import {
  createAnnouncement, createCustomer, createOpenShift, createQuote, createRequest,
  createTask, createWorkOrder, dispatchWorkOrder, invitePersonnel, reviewWorkOrder,
  updateTenantBranding, withdrawAnnouncement, createBookingLink, createCustomerContact,
  uploadTenantLogo,
  confirmShiftInterest, createPersonnelFunction, assignPersonnelFunction, addQualification,
  addAvailability, uploadPersonnelDocument, rescheduleWorkOrder,
  createObject, recordQuoteDecision,
  completeReminder,
  createExtraWorkRule, allowExtraWork,
} from "@/app/app/operations-actions";
import { createInvoice, createPaymentBundle, registerManualPayment, sendInvoice } from "@/app/app/finance-actions";

type View = "overzicht" | "aanvragen" | "planning" | "werkbonnen" | "taken" | "klanten" | "personeel" | "controle" | "facturen" | "nieuws" | "instellingen";

const nav: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overzicht", label: "Overzicht", icon: LayoutDashboard },
  { id: "aanvragen", label: "Aanvragen & offertes", icon: FileText },
  { id: "planning", label: "Planbord", icon: CalendarDays },
  { id: "werkbonnen", label: "Werkbonnen", icon: BriefcaseBusiness },
  { id: "taken", label: "Taken & tarieven", icon: Wrench },
  { id: "klanten", label: "Klanten & objecten", icon: Building2 },
  { id: "personeel", label: "Personeel", icon: UsersRound },
  { id: "controle", label: "Rapportcontrole", icon: ClipboardCheck },
  { id: "facturen", label: "Facturen", icon: CreditCard },
  { id: "nieuws", label: "Nieuws", icon: Megaphone },
  { id: "instellingen", label: "Instellingen", icon: Settings },
];

const statusLabel: Record<string, string> = {
  planned: "Gepland", released: "Vrijgegeven", seen: "Gezien", travelling: "Onderweg",
  in_progress: "Bezig", completed: "Afgerond", returned: "Teruggestuurd", under_review: "Te controleren",
  correction_required: "Correctie nodig", approved: "Goedgekeurd", invoice_ready: "Factureerbaar",
  invoiced: "Gefactureerd", cancelled: "Geannuleerd", new: "Nieuw", quote_draft: "Conceptofferte",
  awaiting_acceptance: "Wacht op akkoord", accepted: "Geaccepteerd", rejected: "Afgewezen",
  final: "Definitief", sent: "Verzonden", partially_paid: "Deels betaald", paid: "Betaald",
  overdue: "Vervallen", draft: "Concept", active: "Actief", invited: "Uitgenodigd",
};

const money = (cents: number | null | undefined) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);
const dateTime = (value: string | null | undefined, timezone = "Europe/Amsterdam") => value ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short", timeZone: timezone }).format(new Date(value)) : "—";
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
function groupBy<T>(items: T[], key: (item: T) => string) { return items.reduce<Map<string, T[]>>((map, item) => { const value = key(item); map.set(value, [...(map.get(value) ?? []), item]); return map; }, new Map()); }
const addressLine = (address: unknown) => {
  const value = (address ?? {}) as Record<string, unknown>;
  return [value.street, value.postal_code, value.city].filter(Boolean).join(", ") || "Geen adres";
};

function ActionForm({ action, children, className, success = "Opgeslagen", onSuccess }: { action: (data: FormData) => Promise<ActionResult<Record<string, unknown>>> | Promise<ActionResult>; children: ReactNode; className?: string; success?: string; onSuccess?: (result: ActionResult<Record<string, unknown>> | ActionResult) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await action(data);
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(success);
      form.reset();
      onSuccess?.(result);
      router.refresh();
    });
  };
  return <form className={className} onSubmit={submit}>{children}<button className="primary-button" disabled={pending}>{pending ? "Bezig…" : success}</button></form>;
}

function PageIntro({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <header className="page-intro"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</header>;
}

function Empty({ children }: { children: ReactNode }) { return <div className="workspace-empty"><PackageCheck size={28}/><p>{children}</p></div>; }

export function BackofficeShell({ context, data }: { context: AuthContext & { tenant: NonNullable<AuthContext["tenant"]> }; data: WorkspaceData }) {
  const [view, setView] = useState<View>("overzicht");
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const tenant = context.tenant;
  const customerById = useMemo(() => new Map(data.customers.map((item) => [item.id, item])), [data.customers]);
  const objectById = useMemo(() => new Map(data.objects.map((item) => [item.id, item])), [data.objects]);
  const personnelById = useMemo(() => new Map(data.personnel.map((item) => [item.id, item])), [data.personnel]);
  const current = nav.find((item) => item.id === view)!;
  const q = search.trim().toLowerCase();
  const visibleOrders = q ? data.workOrders.filter((order) => [order.work_order_number, order.discipline, customerById.get(order.customer_id)?.name, objectById.get(order.object_id)?.name].some((value) => value?.toLowerCase().includes(q))) : data.workOrders;
  const attention = data.workOrders.filter((order) => ["returned", "correction_required", "under_review"].includes(order.status));
  const invoiceReadyGroups = Array.from(groupBy(data.workOrders.filter((item) => item.status === "invoice_ready"), (item) => item.customer_id).entries());
  const openInvoiceGroups = Array.from(groupBy(data.invoices.filter((item) => item.status !== "draft" && item.paid_cents < item.total_cents), (item) => item.customer_id).entries());

  const content = (() => {
    if (view === "overzicht") return <>
      <PageIntro eyebrow="WERKRUIMTE" title={`Goedendag, ${tenant.name}`} description="Live overzicht van aanvragen, uitvoering, controle en betalingen." />
      <div className="metric-grid">
        <Metric icon={<FileText/>} label="Open aanvragen" value={data.requests.filter((item) => !["closed", "rejected"].includes(item.status)).length} tone="mint" />
        <Metric icon={<CalendarDays/>} label="Actieve werkbonnen" value={data.workOrders.filter((item) => !["invoiced", "cancelled"].includes(item.status)).length} tone="blue" />
        <Metric icon={<ClipboardCheck/>} label="Aandacht nodig" value={attention.length} tone="amber" />
        <Metric icon={<CreditCard/>} label="Openstaand" value={money(data.invoices.reduce((sum, item) => sum + (item.total_cents - item.paid_cents), 0))} tone="navy" />
      </div>
      <div className="dashboard-grid">
        <section className="panel"><div className="section-heading"><div><span className="eyebrow">VANDAAG</span><h2>Planning</h2></div><button className="text-link" onClick={() => setView("planning")}>Open planbord <ChevronRight size={15}/></button></div><Planboard data={data} timezone={tenant.timezone}/></section>
        <section className="panel"><div className="section-heading"><div><span className="eyebrow">SIGNALEN</span><h2>Aandacht</h2></div></div>{attention.length ? <div className="attention-list">{attention.slice(0, 7).map((order) => <button key={order.id} onClick={() => setView("controle")}><span className="attention-icon orange"><Bell size={16}/></span><span><strong>{order.work_order_number}</strong><small>{statusLabel[order.status]} · {customerById.get(order.customer_id)?.name}</small></span><ChevronRight size={15}/></button>)}</div> : <Empty>Er zijn geen open signalen.</Empty>}</section>
      </div>
    </>;

    if (view === "aanvragen") return <>
      <PageIntro eyebrow="COMMERCIEEL" title="Aanvragen & offertes" description="Van eerste klantvraag tot aantoonbaar digitaal akkoord." />
      <div className="workspace-split">
        <section className="panel"><div className="section-heading"><h2>Nieuwe aanvraag</h2></div><ActionForm action={createRequest} className="workspace-form" success="Aanvraag aanmaken">
          <label>Klant<select name="customerId" required defaultValue=""><option value="" disabled>Kies klant</option>{data.customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Object<select name="objectId" required defaultValue=""><option value="" disabled>Kies object</option>{data.objects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Discipline<input name="discipline" required placeholder="bijv. Onderhoud" /></label><label>Prioriteit<select name="priority" defaultValue="normal"><option value="low">Laag</option><option value="normal">Normaal</option><option value="high">Hoog</option><option value="urgent">Spoed</option></select></label>
          <label className="wide">Omschrijving<textarea name="description" required rows={4}/></label>
        </ActionForm></section>
        <section className="panel"><div className="section-heading"><h2>Offerte opstellen</h2></div><ActionForm action={createQuote} className="workspace-form" success="Offertelink maken" onSuccess={(result) => { if (result.ok && "previewUrl" in result && result.previewUrl) navigator.clipboard.writeText(String(result.previewUrl)); }}>
          <label className="wide">Aanvraag<select name="requestId" required defaultValue=""><option value="" disabled>Kies aanvraag</option>{data.requests.filter((item) => !["closed", "rejected"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.request_number} · {item.description}</option>)}</select></label>
          <label>Bedrag excl. btw<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Geldig (dagen)<input name="validDays" type="number" min="1" max="90" defaultValue="14" required /></label>
        </ActionForm><p className="form-note">De veilige acceptatielink wordt na aanmaken naar het klembord gekopieerd.</p><hr className="form-divider"/><div className="section-heading"><h2>Boekingslink maken</h2></div><ActionForm action={createBookingLink} className="workspace-form" success="Boekingslink maken" onSuccess={(result) => { if (result.ok && "previewUrl" in result && result.previewUrl) navigator.clipboard.writeText(String(result.previewUrl)); }}><label className="wide">Aanvraag<select name="requestId" required defaultValue=""><option value="" disabled>Kies aanvraag</option>{data.requests.filter((item) => !["closed", "rejected"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.request_number}</option>)}</select></label><label>Start tijdvak<input name="start" type="datetime-local" required/></label><label>Einde tijdvak<input name="end" type="datetime-local" required/></label><label>Capaciteit<input name="capacity" type="number" min="1" max="20" defaultValue="1"/></label></ActionForm></section>
      </div>
      {data.quotes.some((item) => item.status === "awaiting_acceptance") && <section className="panel"><div className="section-heading"><h2>Telefonisch of per e-mail akkoord registreren</h2></div><ActionForm action={recordQuoteDecision} className="workspace-form" success="Besluit registreren"><label>Offerte<select name="quoteId" required defaultValue=""><option value="" disabled>Kies verzonden offerte</option>{data.quotes.filter((item) => item.status === "awaiting_acceptance").map((item) => <option key={item.id} value={item.id}>{item.quote_number}</option>)}</select></label><label>Besluit<select name="decision" defaultValue="accepted"><option value="accepted">Akkoord</option><option value="rejected">Afgewezen</option></select></label><label>Naam klant<input name="name" required/></label><label>Bewijs/notitie<input name="evidence" required placeholder="Bijv. e-mail ontvangen op…"/></label></ActionForm></section>}
      <DataTable headers={["Nummer", "Klant", "Omschrijving", "Prioriteit", "Status"]}>{data.requests.map((item) => <tr key={item.id}><td><strong>{item.request_number}</strong><small>{dateTime(item.created_at, tenant.timezone)}</small></td><td>{item.customer_id ? customerById.get(item.customer_id)?.name : "—"}</td><td>{item.description}</td><td>{item.priority}</td><td><Pill status={item.status}/></td></tr>)}</DataTable>
    </>;

    if (view === "planning") return <>
      <PageIntro eyebrow="OPERATIE" title="Planbord" description="Planning in echte minuten, per medewerker en met de avatarrail vast in beeld." />
      <section className="panel large-plan"><Planboard data={data} timezone={tenant.timezone} editable/></section>
      <TravelEstimator data={data}/>
      <section className="panel"><div className="section-heading"><h2>Werkbon plannen</h2></div><ActionForm action={createWorkOrder} className="workspace-form" success="Werkbon plannen">
        <label>Klant<select name="customerId" required defaultValue=""><option value="" disabled>Kies klant</option>{data.customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Object<select name="objectId" required defaultValue=""><option value="" disabled>Kies object</option>{data.objects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Medewerker<select name="personnelId" required defaultValue=""><option value="" disabled>Kies medewerker</option>{data.personnel.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
        <label>Discipline<input name="discipline" required /></label><label>Start<input name="start" type="datetime-local" required/></label>
        <label className="wide">Taken<select name="taskIds" required defaultValue=""><option value="" disabled>Kies één taak</option>{data.tasks.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label className="check wide"><input name="signatureRequired" type="checkbox"/> Handtekening van opdrachtgever vereist</label>
      </ActionForm></section>
      <section className="panel"><div className="section-heading"><h2>Bestaande planning exact aanpassen</h2></div><ActionForm action={rescheduleWorkOrder} className="workspace-form" success="Planning verplaatsen"><label>Werkbon<select name="workOrderKey" required defaultValue=""><option value="" disabled>Kies geplande werkbon</option>{data.workOrders.filter((item) => item.status === "planned").map((item) => <option key={item.id} value={`${item.id}:${item.version}`}>{item.work_order_number}</option>)}</select></label><label>Medewerker<select name="personnelId" required defaultValue=""><option value="" disabled>Kies medewerker</option>{data.personnel.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label><label className="wide">Exacte start<input name="start" type="datetime-local" required/></label></ActionForm><p className="form-note">Je kunt een geplande bon ook naar een medewerkerregel slepen; Fieldgrid rondt dan af op de exacte minuut en blokkeert overlap of afwezigheid.</p></section>
    </>;

    if (view === "werkbonnen") return <>
      <PageIntro eyebrow="UITVOERING" title="Werkbonnen" description="Vrijgeven, volgen en afronden op één versievaste statusstroom." />
      <div className="kanban">{["planned", "released", "in_progress", "under_review", "invoice_ready"].map((stage, index) => <section className="kanban-col" key={stage}><div className="kanban-top"><i className={`stage-${index}`}/><strong>{statusLabel[stage]}</strong><b>{visibleOrders.filter((item) => item.status === stage || (stage === "in_progress" && ["seen", "travelling", "completed"].includes(item.status))).length}</b></div>{visibleOrders.filter((item) => item.status === stage || (stage === "in_progress" && ["seen", "travelling", "completed"].includes(item.status))).map((order) => <article className="kanban-card" key={order.id}><div className="card-id"><span>{order.work_order_number}</span><Pill status={order.status}/></div><h3>{objectById.get(order.object_id)?.name}</h3><p>{customerById.get(order.customer_id)?.name} · {order.discipline}</p><div className="card-meta"><Clock3 size={13}/>{dateTime(order.projected_start_at, tenant.timezone)}</div>{order.status === "planned" && <ActionForm action={dispatchWorkOrder} className="kanban-action" success="Vrijgeven"><input type="hidden" name="workOrderId" value={order.id}/><input type="hidden" name="personnelId" value={data.assignments.find((item) => item.work_order_id === order.id)?.personnel_id ?? ""}/><input type="hidden" name="version" value={order.version}/></ActionForm>}</article>)}</section>)}</div>
    </>;

    if (view === "taken") return <>
      <PageIntro eyebrow="CATALOGUS" title="Taken & tarieven" description="Versievaste taakdefinities vormen de basis van planning en factuurregels." />
      <section className="panel"><div className="section-heading"><h2>Taak toevoegen</h2></div><ActionForm action={createTask} className="workspace-form" success="Taak toevoegen"><label>Code<input name="code" required placeholder="ONDR-01" /></label><label>Naam<input name="name" required /></label><label>Discipline<input name="discipline" required /></label><label>Duur (minuten)<input name="duration" type="number" min="1" defaultValue="60" required /></label><label>Prijs excl. btw<input name="price" type="number" step="0.01" min="0" required /></label><label>Btw %<input name="vat" type="number" min="0" max="100" defaultValue="21" required /></label></ActionForm></section>
      <div className="workspace-split"><section className="panel"><div className="section-heading"><h2>Taak als meerwerk toestaan</h2></div><ActionForm action={createExtraWorkRule} className="workspace-form" success="Meerwerkoptie opslaan"><label className="wide">Actuele taakversie<select name="taskRevisionId" required defaultValue=""><option value="" disabled>Kies taak</option>{data.taskRevisions.filter((item) => !item.valid_until).map((revision) => <option key={revision.id} value={revision.id}>{data.tasks.find((task) => task.id === revision.task_id)?.code} · {data.tasks.find((task) => task.id === revision.task_id)?.name}</option>)}</select></label><label className="check wide"><input name="requiresPhoto" type="checkbox"/> Foto vereist als bewijs</label></ActionForm></section><section className="panel"><div className="section-heading"><h2>Meerwerkoptie op werkbon</h2></div><ActionForm action={allowExtraWork} className="workspace-form" success="Meerwerk koppelen"><label>Werkbon<select name="workOrderId" required defaultValue=""><option value="" disabled>Kies werkbon</option>{data.workOrders.filter((item) => !["invoice_ready", "invoiced", "cancelled"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.work_order_number}</option>)}</select></label><label>Optie<select name="ruleId" required defaultValue=""><option value="" disabled>Kies meerwerk</option>{data.extraWorkRules.map((rule) => { const revision = data.taskRevisions.find((item) => item.id === rule.task_revision_id); const task = data.tasks.find((item) => item.id === revision?.task_id); return <option key={rule.id} value={rule.id}>{task?.code} · {task?.name}</option>; })}</select></label></ActionForm></section></div>
      <DataTable headers={["Code", "Taak", "Discipline", "Duur", "Tarief", "Status"]}>{data.tasks.map((task) => { const revision = data.taskRevisions.find((item) => item.task_id === task.id && !item.valid_until); return <tr key={task.id}><td><span className="code">{task.code}</span></td><td><strong>{task.name}</strong></td><td>{task.discipline}</td><td>{revision?.duration_minutes ?? 0} min</td><td>{money(revision?.price_cents)}</td><td><Pill status={task.active ? "active" : "inactive"}/></td></tr>; })}</DataTable>
    </>;

    if (view === "klanten") return <>
      <PageIntro eyebrow="RELATIES" title="Klanten & objecten" description="Klantgegevens en uitvoeringslocaties, strikt binnen deze tenant." />
      <div className="workspace-split"><section className="panel"><div className="section-heading"><h2>Klant met eerste object</h2></div><ActionForm action={createCustomer} className="workspace-form" success="Klant toevoegen"><label>Naam<input name="name" required /></label><label>Factuurmail<input name="email" type="email" /></label><label>Telefoon<input name="phone" /></label><label>Objectnaam<input name="objectName" required /></label><label>Straat en huisnummer<input name="street" required /></label><label>Postcode<input name="postalCode" required /></label><label>Plaats<input name="city" required /></label></ActionForm></section><section className="panel"><div className="section-heading"><h2>Contactpersoon toevoegen</h2></div><ActionForm action={createCustomerContact} className="workspace-form" success="Contact toevoegen"><label className="wide">Klant<select name="customerId" required defaultValue=""><option value="" disabled>Kies klant</option>{data.customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Naam<input name="fullName" required/></label><label>Rol<input name="role"/></label><label>E-mail<input name="email" type="email"/></label><label>Telefoon<input name="phone"/></label><label className="check wide"><input name="primary" type="checkbox"/> Primair contact</label></ActionForm><hr className="form-divider"/><div className="section-heading"><h2>Extra object toevoegen</h2></div><ActionForm action={createObject} className="workspace-form" success="Object toevoegen"><label>Klant<select name="customerId" required defaultValue=""><option value="" disabled>Kies klant</option>{data.customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Objectnaam<input name="name" required/></label><label>Straat en huisnummer<input name="street" required/></label><label>Postcode<input name="postalCode" required/></label><label>Plaats<input name="city" required/></label><label>Bezoekinstructies<input name="instructions"/></label></ActionForm></section></div>
      <div className="customer-grid">{data.customers.map((customer) => <article className="panel customer-card" key={customer.id}><div className="customer-head"><span className="avatar avatar-mint">{initials(customer.name)}</span><span><h3>{customer.name}</h3><small>{customer.customer_number}</small></span><Pill status={customer.status}/></div><div className="object-list">{data.objects.filter((item) => item.customer_id === customer.id).map((object) => <div key={object.id}><Building2 size={15}/><strong>{object.name}</strong><small>{addressLine(object.address)}</small></div>)}</div><div className="customer-foot"><small>{customer.billing_email ?? "Geen factuurmail"}</small><strong>{data.workOrders.filter((item) => item.customer_id === customer.id).length} bonnen</strong></div></article>)}</div>
    </>;

    if (view === "personeel") return <>
      <PageIntro eyebrow="TEAM" title="Personeel" description="Uitnodigingen, inzetbaarheid, documenten en kwalificaties." />
      <div className="workspace-split"><section className="panel"><div className="section-heading"><h2>Medewerker uitnodigen</h2></div><ActionForm action={invitePersonnel} className="workspace-form" success="Uitnodiging versturen"><label>Volledige naam<input name="name" required /></label><label>E-mail<input name="email" type="email" required /></label><label>Personeelsnummer<input name="employeeNumber" required /></label></ActionForm></section>
      <section className="panel"><div className="section-heading"><h2>Open dienst publiceren</h2></div><ActionForm action={createOpenShift} className="workspace-form" success="Dienst publiceren"><label className="wide">Werkbon<select name="workOrderId" required defaultValue=""><option value="" disabled>Kies werkbon</option>{data.workOrders.map((item) => <option key={item.id} value={item.id}>{item.work_order_number}</option>)}</select></label><label>Functie<select name="functionId" required defaultValue=""><option value="" disabled>Kies functie</option>{data.functions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Start<input name="start" type="datetime-local" required /></label><label>Einde<input name="end" type="datetime-local" required /></label></ActionForm></section></div>
      <div className="workspace-split"><section className="panel"><div className="section-heading"><h2>Beroepsfuncties</h2></div><ActionForm action={createPersonnelFunction} className="workspace-form" success="Functie toevoegen"><label>Functienaam<input name="name" required placeholder="Servicemedewerker"/></label><label>Discipline<input name="discipline" required/></label><label className="wide">Vereiste certificaatcodes<input name="certificateCodes" placeholder="VCA, BHV (optioneel)"/></label></ActionForm><hr className="form-divider"/><ActionForm action={assignPersonnelFunction} className="workspace-form" success="Functie koppelen"><label>Medewerker<select name="personnelId" required defaultValue=""><option value="" disabled>Kies medewerker</option>{data.personnel.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label><label>Functie<select name="functionId" required defaultValue=""><option value="" disabled>Kies functie</option>{data.functions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></ActionForm></section>
      <section className="panel"><div className="section-heading"><h2>Kwalificatie registreren</h2></div><ActionForm action={addQualification} className="workspace-form" success="Kwalificatie opslaan"><label>Medewerker<select name="personnelId" required defaultValue=""><option value="" disabled>Kies medewerker</option>{data.personnel.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label><label>Code<input name="code" required placeholder="VCA"/></label><label className="wide">Naam<input name="name" required/></label><label>Uitgegeven<input name="issuedAt" type="date"/></label><label>Geldig tot<input name="validUntil" type="date"/></label></ActionForm></section></div>
      <div className="workspace-split"><section className="panel"><div className="section-heading"><h2>Privédocument uploaden</h2></div><ActionForm action={uploadPersonnelDocument} className="workspace-form" success="Document uploaden"><label>Medewerker<select name="personnelId" required defaultValue=""><option value="" disabled>Kies medewerker</option>{data.personnel.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label><label>Type<input name="documentType" required placeholder="Contract"/></label><label className="wide">Titel<input name="title" required/></label><label className="wide">Bestand<input name="document" type="file" accept="application/pdf,image/jpeg,image/png" required/></label><label className="check wide"><input name="visibleToEmployee" type="checkbox"/> Zichtbaar voor deze medewerker</label></ActionForm></section>
      <section className="panel"><div className="section-heading"><h2>Beschikbaarheid of afwezigheid</h2></div><ActionForm action={addAvailability} className="workspace-form" success="Periode opslaan"><label>Medewerker<select name="personnelId" required defaultValue=""><option value="" disabled>Kies medewerker</option>{data.personnel.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label><label>Soort<select name="kind" defaultValue="unavailable"><option value="available">Beschikbaar</option><option value="unavailable">Niet beschikbaar</option><option value="leave">Verlof</option><option value="sick">Ziek</option></select></label><label>Start<input name="start" type="datetime-local" required/></label><label>Einde<input name="end" type="datetime-local" required/></label><label className="wide">Toelichting<input name="note"/></label></ActionForm></section></div>
      {data.shiftInterests.some((item) => item.status === "interested") && <section className="panel"><div className="section-heading"><h2>Interesse in open diensten</h2></div><div className="interest-list">{data.shiftInterests.filter((item) => item.status === "interested").map((interest) => <ActionForm action={confirmShiftInterest} key={interest.id} success="Toewijzen"><input type="hidden" name="shiftId" value={interest.open_shift_id}/><input type="hidden" name="personnelId" value={interest.personnel_id}/><span><strong>{personnelById.get(interest.personnel_id)?.full_name}</strong><small>{data.openShifts.find((item) => item.id === interest.open_shift_id)?.starts_at ? dateTime(data.openShifts.find((item) => item.id === interest.open_shift_id)!.starts_at, tenant.timezone) : ""}</small></span></ActionForm>)}</div></section>}
      {data.reminders.some((item) => item.status === "open") && <section className="panel"><div className="section-heading"><h2>HR-reminders</h2></div><div className="interest-list">{data.reminders.filter((item) => item.status === "open").map((reminder) => <ActionForm action={completeReminder} key={reminder.id} success="Afhandelen"><input type="hidden" name="reminderId" value={reminder.id}/><span><strong>{reminder.title}</strong><small>{personnelById.get(reminder.personnel_id ?? "")?.full_name ?? "Algemeen"} · uiterlijk {dateTime(reminder.due_at, tenant.timezone)}</small></span></ActionForm>)}</div></section>}
      <div className="people-grid">{data.personnel.map((person) => <article className="panel person-card" key={person.id}><div className="person-top"><span className="avatar avatar-blue">{initials(person.full_name)}</span><Pill status={person.status}/></div><h3>{person.full_name}</h3><p>{person.employee_number} · {person.email ?? "geen e-mail"}</p><div className="person-facts"><span><CalendarDays size={15}/>{data.assignments.filter((item) => item.personnel_id === person.id).length} geplande opdrachten</span><span><ShieldCheck size={15}/>{data.qualifications.filter((item) => item.personnel_id === person.id).map((item) => item.code).join(" · ") || "geen kwalificaties"}</span><span><BriefcaseBusiness size={15}/>{data.personnelFunctions.filter((item) => item.personnel_id === person.id).map((item) => data.functions.find((fn) => fn.id === item.function_id)?.name).filter(Boolean).join(" · ") || "geen functie"}</span>{data.personnelDocuments.filter((item) => item.personnel_id === person.id).map((document) => <a key={document.id} href={`/api/files/personnel-document/${document.id}`} target="_blank" rel="noreferrer"><FileCheck2 size={15}/>{document.title}</a>)}</div></article>)}</div>
    </>;

    if (view === "controle") return <>
      <PageIntro eyebrow="KWALITEIT" title="Rapportcontrole" description="Controleer verslag, checklist, incidenten en handtekening voordat je factureert." />
      <div className="review-grid">{data.workOrders.filter((item) => ["completed", "under_review", "correction_required", "approved", "invoice_ready"].includes(item.status)).map((order) => <article className="panel review-card" key={order.id}><div className="review-head"><Pill status={order.status}/><small>{order.work_order_number}</small></div><h3>{objectById.get(order.object_id)?.name}</h3><p>{customerById.get(order.customer_id)?.name} · {data.reports.filter((item) => item.work_order_id === order.id).length} rapportregels · {data.workOrderTasks.filter((item) => item.work_order_id === order.id && item.is_extra_work && item.extra_work_status === "awaiting_review").length} meerwerkregels · {data.signatures.some((item) => item.work_order_id === order.id) ? "ondertekend" : "geen handtekening"}</p><blockquote>{data.reports.find((item) => item.work_order_id === order.id)?.body ?? "Geen rapportnotitie"}</blockquote>{data.attachments.filter((item) => item.work_order_id === order.id).length > 0 && <div className="review-attachments">{data.attachments.filter((item) => item.work_order_id === order.id).map((item) => <a key={item.id} href={`/api/files/attachment/${item.id}`} target="_blank" rel="noreferrer">{item.file_name}</a>)}</div>}{["completed", "under_review"].includes(order.status) && <div className="review-actions"><ActionForm action={reviewWorkOrder} success="Goedkeuren"><input type="hidden" name="workOrderId" value={order.id}/><input type="hidden" name="decision" value="approved"/></ActionForm><ActionForm action={reviewWorkOrder} success="Terugsturen"><input type="hidden" name="workOrderId" value={order.id}/><input type="hidden" name="decision" value="returned"/><input name="reason" required placeholder="Reden voor correctie"/></ActionForm></div>}</article>)}</div>
    </>;

    if (view === "facturen") return <>
      <PageIntro eyebrow="FINANCE" title="Facturen & betalingen" description="Definitieve PDF’s, veilige betaallinks, Mollie-status en handmatige boekingen." />
      <div className="finance-grid"><Metric icon={<CreditCard/>} label="Gefactureerd" value={money(data.invoices.reduce((sum, item) => sum + item.total_cents, 0))} tone="blue"/><Metric icon={<Clock3/>} label="Openstaand" value={money(data.invoices.reduce((sum, item) => sum + item.total_cents - item.paid_cents, 0))} tone="amber"/><Metric icon={<ShieldCheck/>} label="Ontvangen" value={money(data.invoices.reduce((sum, item) => sum + item.paid_cents, 0))} tone="mint"/></div>
      <section className="panel"><div className="section-heading"><h2>Factureerbare werkbonnen</h2></div><div className="invoice-ready-grid">{invoiceReadyGroups.map(([customerId, orders]) => <ActionForm key={customerId} action={createInvoice} className="invoice-ready" success={orders.length > 1 ? "Verzamelfactuur maken" : "Factuur maken"}><input type="hidden" name="workOrderIds" value={orders.map((item) => item.id).join(",")}/><span><strong>{customerById.get(customerId)?.name}</strong><small>{orders.map((item) => item.work_order_number).join(" · ")}</small></span></ActionForm>)}</div></section>
      {openInvoiceGroups.some(([, invoices]) => invoices.length > 1) && <section className="panel"><div className="section-heading"><h2>Gecombineerde betaallink</h2></div><div className="invoice-ready-grid">{openInvoiceGroups.filter(([, invoices]) => invoices.length > 1).map(([customerId, invoices]) => <ActionForm key={customerId} action={createPaymentBundle} className="invoice-ready" success="Link kopiëren" onSuccess={(result) => { if (result.ok && "paymentUrl" in result) navigator.clipboard.writeText(String(result.paymentUrl)); }}><input type="hidden" name="invoiceIds" value={invoices.map((item) => item.id).join(",")}/><span><strong>{customerById.get(customerId)?.name}</strong><small>{invoices.map((item) => item.invoice_number).join(" · ")}</small></span></ActionForm>)}</div></section>}
      <DataTable headers={["Factuur", "Klant", "Datum", "Totaal", "Betaald", "Status", "Actie"]}>{data.invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.invoice_number ?? "Concept"}</strong></td><td>{customerById.get(invoice.customer_id)?.name}</td><td>{invoice.issued_on ?? "—"}</td><td>{money(invoice.total_cents)}</td><td>{money(invoice.paid_cents)}</td><td><Pill status={invoice.status}/></td><td><div className="table-actions">{invoice.status !== "draft" && <ActionForm action={sendInvoice} success="Link gekopieerd" onSuccess={(result) => { if (result.ok && "paymentUrl" in result) navigator.clipboard.writeText(String(result.paymentUrl)); }}><input type="hidden" name="invoiceId" value={invoice.id}/><Send size={14}/></ActionForm>}{invoice.paid_cents < invoice.total_cents && <details><summary>Boek betaling</summary><ActionForm action={registerManualPayment} className="popover-form" success="Betaling boeken"><input type="hidden" name="invoiceId" value={invoice.id}/><input name="amount" type="number" step=".01" max={(invoice.total_cents - invoice.paid_cents) / 100} required placeholder="Bedrag"/><input name="reference" required placeholder="Referentie"/><input name="date" type="date" required/></ActionForm></details>}</div></td></tr>)}</DataTable>
    </>;

    if (view === "nieuws") return <>
      <PageIntro eyebrow="COMMUNICATIE" title="Nieuws" description="Publiceer tenantnieuws en stuur optioneel een pushmelding." />
      <section className="panel"><div className="section-heading"><h2>Bericht publiceren</h2></div><ActionForm action={createAnnouncement} className="workspace-form" success="Publiceren"><label className="wide">Titel<input name="title" required /></label><label className="wide">Bericht<textarea name="body" required rows={5}/></label><label className="check wide"><input type="checkbox" name="sendPush"/> Pushmelding versturen</label></ActionForm></section>
      <div className="news-grid">{data.announcements.map((item) => <article className="panel news-card" key={item.id}><span className="eyebrow">{item.published_at ? dateTime(item.published_at, tenant.timezone) : "CONCEPT"}</span><h3>{item.title}</h3><p>{item.body}</p><small>{data.announcementReads.filter((read) => read.announcement_id === item.id).length} gelezen</small>{!item.withdrawn_at && <ActionForm action={withdrawAnnouncement} success="Intrekken"><input type="hidden" name="announcementId" value={item.id}/></ActionForm>}</article>)}</div>
    </>;

    return <>
      <PageIntro eyebrow="BEHEER" title="Instellingen" description="Tenantbranding, logo en afzendergegevens voor alle operationele schermen." />
      <section className="panel settings-panel"><div className="brand-preview" style={{ background: tenant.primaryColor }}><FieldgridBrand tenantName={tenant.name} logoUrl={data.brandingLogoUrl}/></div><div className="settings-forms"><ActionForm action={uploadTenantLogo} className="workspace-form logo-upload-form" success="Logo uploaden"><label className="wide">Tenantlogo<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required/><small>PNG, JPG of WebP · maximaal 2 MB</small></label></ActionForm><ActionForm action={updateTenantBranding} className="workspace-form" success="Instellingen opslaan"><label>Primaire kleur<input name="primaryColor" type="color" defaultValue={data.branding?.primary_color ?? tenant.primaryColor}/></label><label>Accentkleur<input name="accentColor" type="color" defaultValue={data.branding?.accent_color ?? tenant.accentColor}/></label><label>Afzendernaam<input name="senderName" defaultValue={data.branding?.sender_name ?? tenant.name} required/></label><label>Afzendermail<input name="senderEmail" type="email" defaultValue={data.branding?.sender_email ?? ""}/></label></ActionForm></div></section>
    </>;
  })();

  return <div className="workspace-shell" style={{ "--tenant-primary": tenant.primaryColor, "--tenant-accent": tenant.accentColor } as React.CSSProperties}>
    <aside className={`workspace-sidebar ${mobileNav ? "open" : ""}`}><div className="workspace-brand"><FieldgridBrand tenantName={tenant.name} logoUrl={data.brandingLogoUrl}/></div><nav>{nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setMobileNav(false); }}><item.icon size={18}/><span>{item.label}</span>{item.id === "controle" && attention.length > 0 && <em>{attention.length}</em>}</button>)}</nav><footer><span className="live-dot"/> Beveiligde tenantomgeving<small>{tenant.roles.join(" · ")}</small></footer></aside>
    <div className="workspace-main"><header className="workspace-topbar"><div><button className="mobile-menu" onClick={() => setMobileNav((value) => !value)} aria-label="Menu"><Menu size={20}/></button><span className="breadcrumb">Fieldgrid <ChevronRight size={13}/> <strong>{current.label}</strong></span></div><div className="global-search"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Zoek werkbon…"/></div><div><Bell size={18}/><span className="top-avatar">{initials(context.user.email ?? "FG")}</span><form action="/auth/signout" method="post"><button className="icon-button" aria-label="Uitloggen"><LogOut size={17}/></button></form></div></header>{context.memberships.length > 1 && <form action={switchTenant} className="tenant-switch"><select name="tenantId" defaultValue={tenant.id} onChange={(event) => event.currentTarget.form?.requestSubmit()}>{context.memberships.map((item) => <option key={item.tenantId} value={item.tenantId}>{item.tenantName}</option>)}</select></form>}<main className={`backoffice-content view-${view}`}>{content}</main></div><Toaster richColors position="top-right"/>
  </div>;
}

function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string | number; tone: string }) { return <article className="metric"><span className={`metric-icon ${tone}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong><small>Actuele tenantdata</small></div></article>; }
function Pill({ status }: { status: string }) { const tone = ["paid", "accepted", "approved", "invoice_ready", "active"].includes(status) ? "green" : ["returned", "correction_required", "overdue", "urgent"].includes(status) ? "orange" : ["released", "seen", "travelling", "in_progress", "sent"].includes(status) ? "blue" : "neutral"; return <span className={`pill pill-${tone}`}>{statusLabel[status] ?? status.replaceAll("_", " ")}</span>; }
function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) { return <section className="panel table-panel"><div className="table-scroll"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div></section>; }

function TravelEstimator({ data }: { data: WorkspaceData }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setPending(true); setResult(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/routes/estimate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
      const payload = await response.json() as { known?: boolean; minutes?: number; reason?: string; error?: string };
      setResult(payload.known ? `${payload.minutes} minuten` : payload.reason ?? payload.error ?? "Reistijd onbekend");
      if (response.ok) toast.success("Reistijd bijgewerkt"); else toast.warning(payload.reason ?? "Reistijd onbekend");
    } catch { setResult("Reistijd onbekend"); toast.error("Routeprovider niet bereikbaar"); }
    finally { setPending(false); }
  };
  return <section className="panel travel-panel"><div className="section-heading"><div><span className="eyebrow">ROUTE-ETA</span><h2>Reistijd berekenen</h2></div>{result && <strong>{result}</strong>}</div><form className="workspace-form" onSubmit={submit}><label>Toewijzing<select name="assignmentId" required defaultValue=""><option value="" disabled>Kies werkbon en medewerker</option>{data.assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{data.workOrders.find((item) => item.id === assignment.work_order_id)?.work_order_number} · {data.personnel.find((item) => item.id === assignment.personnel_id)?.full_name}</option>)}</select></label><label>Richting<select name="direction" defaultValue="before"><option value="before">Naar opdracht</option><option value="after">Na opdracht</option></select></label><label>Vertrekadres<input name="origin" required placeholder="Straat 1, 1234 AB Plaats"/></label><label>Bestemming<input name="destination" required placeholder="Straat 2, 5678 CD Plaats"/></label><label>Vervoer<select name="mode" defaultValue="driving"><option value="driving">Auto</option><option value="bicycling">Fiets</option><option value="walking">Lopen</option><option value="transit">OV</option></select></label><button className="primary-button" disabled={pending}>{pending ? "Berekenen…" : "Bereken reistijd"}</button></form></section>;
}

function Planboard({ data, timezone, editable = false }: { data: WorkspaceData; timezone: string; editable?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const now = new Date(); const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const chronological = [...data.assignments].sort((a, b) => new Date(a.projected_start_at).getTime() - new Date(b.projected_start_at).getTime());
  const reference = chronological.find((item) => new Date(item.projected_start_at) >= todayStart) ?? chronological.at(-1);
  const dayStart = reference ? new Date(reference.projected_start_at) : new Date(); dayStart.setHours(7, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setHours(19, 0, 0, 0);
  const spanMinutes = 12 * 60;
  const orderById = new Map(data.workOrders.map((item) => [item.id, item]));
  const customerById = new Map(data.customers.map((item) => [item.id, item]));
  const drop = (event: React.DragEvent<HTMLDivElement>, personnelId: string) => {
    if (!editable || pending) return;
    event.preventDefault();
    try {
      const payload = JSON.parse(event.dataTransfer.getData("application/x-fieldgrid-work-order")) as { id?: string; version?: number };
      if (!payload.id || !Number.isInteger(payload.version)) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const minute = Math.max(0, Math.min(spanMinutes - 1, Math.round(((event.clientX - bounds.left) / bounds.width) * spanMinutes)));
      const start = new Date(dayStart.getTime() + minute * 60_000);
      const form = new FormData(); form.set("workOrderId", payload.id); form.set("personnelId", personnelId); form.set("start", start.toISOString()); form.set("version", String(payload.version));
      startTransition(async () => { const result = await rescheduleWorkOrder(form); if (!result.ok) toast.error(result.error); else { toast.success(`Werkbon verplaatst naar ${new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(start)}`); router.refresh(); } });
    } catch { toast.error("Werkbon kon niet worden verplaatst"); }
  };
  return <div className="planboard"><div className="plan-head"><span className="plan-avatar-head"/><strong className="plan-name-head">Medewerker</strong><div className="plan-ruler">{[7, 9, 11, 13, 15, 17, 19].map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</div></div>{data.personnel.map((person) => <div className="plan-row" key={person.id}><div className="plan-avatar-rail"><span className="avatar avatar-mint">{initials(person.full_name)}</span></div><div className="plan-person"><span><strong>{person.full_name}</strong><small>{data.qualifications.filter((item) => item.personnel_id === person.id).map((item) => item.code).slice(0, 2).join(" · ") || "Beschikbaar"}</small></span></div><div className={`plan-lane ${editable ? "editable" : ""}`} onDragOver={(event) => { if (editable) event.preventDefault(); }} onDrop={(event) => drop(event, person.id)}>{data.assignments.filter((item) => item.personnel_id === person.id && new Date(item.projected_start_at) >= dayStart && new Date(item.projected_start_at) < dayEnd).map((assignment) => { const order = orderById.get(assignment.work_order_id); if (!order) return null; const start = new Date(assignment.projected_start_at); const end = new Date(assignment.projected_end_at); const left = Math.max(0, ((start.getTime() - dayStart.getTime()) / 60000) / spanMinutes * 100); const width = Math.max(3, ((end.getTime() - start.getTime()) / 60000) / spanMinutes * 100); const movable = editable && order.status === "planned"; return <button className={`plan-bon ${order.discipline.toLowerCase().replaceAll(" ", "-")} ${order.status === "in_progress" ? "running" : ""}`} style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} key={assignment.id} title={`${order.work_order_number} · ${dateTime(order.projected_start_at, timezone)}${movable ? " · sleep om te verplaatsen" : ""}`} draggable={movable} onDragStart={(event) => { if (movable) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-fieldgrid-work-order", JSON.stringify({ id: order.id, version: order.version })); } }}><span>{order.work_order_number} · {customerById.get(order.customer_id)?.name}</span><small>{new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(start)}–{new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(end)}</small></button>; })}</div></div>)}{!data.personnel.length && <Empty>Voeg personeel toe om het planbord te vullen.</Empty>}<div className="plan-legend"><span><i className="legend teal"/> Planning op minuutniveau · {new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeZone: timezone }).format(dayStart)}</span><em>07:00–19:00</em></div></div>;
}
