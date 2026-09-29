"use client";

import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell, BriefcaseBusiness, Building2, CalendarDays, ChevronRight, ClipboardCheck,
  Clock3, CreditCard, FileText, LayoutDashboard, LogOut, Megaphone,
  Menu, PackageCheck, Search, Settings,
  UsersRound, Wrench,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import type { AuthContext } from "@/lib/auth/context";
import type { WorkspaceData } from "@/lib/data/workspace";
import type { ActionResult } from "@/lib/actions/result";
import { FieldgridBrand } from "@/components/fieldgrid/brand";
import { CustomersPage, InvoicesPage, ObjectsPage, PersonnelPage, ReportsPage } from "@/components/fieldgrid/resource-pages";
import { switchTenant } from "@/app/app/actions";
import {
  createAnnouncement, createQuote, createRequest,
  createTask, dispatchWorkOrder,
  updateTenantBranding, withdrawAnnouncement, createBookingLink,
  uploadTenantLogo,
  rescheduleWorkOrder, recordQuoteDecision, sendQuoteEmail,
  createExtraWorkRule, allowExtraWork,
} from "@/app/app/operations-actions";

export type BackofficeView = "overzicht" | "aanvragen" | "planning" | "werkbonnen" | "taken" | "klanten" | "objecten" | "personeel" | "controle" | "facturen" | "nieuws" | "instellingen";

const nav: Array<{ id: BackofficeView; label: string; icon: typeof LayoutDashboard; href: string }> = [
  { id: "overzicht", label: "Overzicht", icon: LayoutDashboard, href: "/app" },
  { id: "aanvragen", label: "Aanvragen & offertes", icon: FileText, href: "/app/aanvragen" },
  { id: "planning", label: "Planbord", icon: CalendarDays, href: "/app/planning" },
  { id: "werkbonnen", label: "Werkbonnen", icon: BriefcaseBusiness, href: "/app/werkbonnen" },
  { id: "taken", label: "Taken & tarieven", icon: Wrench, href: "/app/taken" },
  { id: "klanten", label: "Klanten", icon: Building2, href: "/app/klanten" },
  { id: "objecten", label: "Objecten", icon: Building2, href: "/app/objecten" },
  { id: "personeel", label: "Personeel", icon: UsersRound, href: "/app/personeel" },
  { id: "controle", label: "Rapportcontrole", icon: ClipboardCheck, href: "/app/rapporten" },
  { id: "facturen", label: "Facturen", icon: CreditCard, href: "/app/facturen" },
  { id: "nieuws", label: "Nieuws", icon: Megaphone, href: "/app/nieuws" },
  { id: "instellingen", label: "Instellingen", icon: Settings, href: "/app/instellingen" },
];

const serviceByView: Partial<Record<BackofficeView, string>> = {
  aanvragen: "planning", planning: "planning", werkbonnen: "planning", taken: "planning",
  klanten: "planning", objecten: "planning", personeel: "personeel", nieuws: "personeel",
  controle: "rapportage", facturen: "finance",
};

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
      if ("warning" in result && result.warning) toast.warning(String(result.warning));
      else if ("alreadySent" in result && result.alreadySent) toast.info("Deze prijsopgave is al verzonden");
      else toast.success(success);
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

export function BackofficeShell({ context, data, initialView = "overzicht" }: { context: AuthContext & { tenant: NonNullable<AuthContext["tenant"]> }; data: WorkspaceData; initialView?: BackofficeView }) {
  const view = initialView;
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const tenant = context.tenant;
  const visibleNav = nav.filter((item) => !serviceByView[item.id] || tenant.enabledServices.includes(serviceByView[item.id]!));
  const customerById = useMemo(() => new Map(data.customers.map((item) => [item.id, item])), [data.customers]);
  const objectById = useMemo(() => new Map(data.objects.map((item) => [item.id, item])), [data.objects]);
  const current = nav.find((item) => item.id === view)!;
  const q = search.trim().toLowerCase();
  const visibleOrders = q ? data.workOrders.filter((order) => [order.work_order_number, order.discipline, customerById.get(order.customer_id)?.name, objectById.get(order.object_id)?.name].some((value) => value?.toLowerCase().includes(q))) : data.workOrders;
  const attention = data.workOrders.filter((order) => ["returned", "correction_required", "under_review"].includes(order.status));

  const content = (() => {
    if (view === "overzicht") return <>
      <PageIntro eyebrow="WERKRUIMTE" title={`Goedendag, ${tenant.name}`} description="Live overzicht van aanvragen, uitvoering, controle en betalingen." />
      <div className="metric-grid">
        <Metric icon={<FileText/>} label="Open aanvragen" value={data.requests.filter((item) => !["closed", "rejected"].includes(item.status)).length} tone="mint" />
        <Metric icon={<CalendarDays/>} label="Actieve werkbonnen" value={data.workOrders.filter((item) => !["invoiced", "cancelled"].includes(item.status)).length} tone="blue" />
        <Metric icon={<ClipboardCheck/>} label="Aandacht nodig" value={attention.length} tone="amber" />
        <Metric icon={<CreditCard/>} label="Openstaand" value={money(data.invoices.reduce((sum, item) => sum + (item.total_cents - item.paid_cents), 0))} tone="navy" />
      </div>
      <section className="panel dashboard-attention"><div className="section-heading"><div><span className="eyebrow">SIGNALEN</span><h2>Aandacht</h2></div><Link className="text-link" href="/app/rapporten">Open rapportcontrole <ChevronRight size={15}/></Link></div>{attention.length ? <div className="attention-list">{attention.slice(0, 7).map((order) => <Link key={order.id} href="/app/rapporten"><span className="attention-icon orange"><Bell size={16}/></span><span><strong>{order.work_order_number}</strong><small>{statusLabel[order.status]} · {customerById.get(order.customer_id)?.name}</small></span><ChevronRight size={15}/></Link>)}</div> : <Empty>Er zijn geen open signalen.</Empty>}</section>
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
      {data.quotes.some((item) => item.status === "awaiting_acceptance") && <div className="workspace-split">
        <section className="panel"><div className="section-heading"><h2>Prijsopgave e-mailen</h2></div><ActionForm action={sendQuoteEmail} className="workspace-form" success="Prijsopgave verzenden" onSuccess={(result) => { if (result.ok && "previewUrl" in result && result.previewUrl) navigator.clipboard.writeText(String(result.previewUrl)); }}><label className="wide">Prijsopgave<select name="quoteId" required defaultValue=""><option value="" disabled>Kies prijsopgave</option>{data.quotes.filter((item) => item.status === "awaiting_acceptance").map((item) => <option key={item.id} value={item.id}>{item.quote_number} · {customerById.get(item.customer_id)?.name}</option>)}</select></label></ActionForm><p className="form-note">De tenanttemplate, actuele huisstijl en veilige acceptatielink worden in één versievaste verzending vastgelegd.</p></section>
        <section className="panel"><div className="section-heading"><h2>Akkoord registreren</h2></div><ActionForm action={recordQuoteDecision} className="workspace-form" success="Besluit registreren"><label>Prijsopgave<select name="quoteId" required defaultValue=""><option value="" disabled>Kies verzonden prijsopgave</option>{data.quotes.filter((item) => item.status === "awaiting_acceptance").map((item) => <option key={item.id} value={item.id}>{item.quote_number}</option>)}</select></label><label>Besluit<select name="decision" defaultValue="accepted"><option value="accepted">Akkoord</option><option value="rejected">Afgewezen</option></select></label><label>Naam klant<input name="name" required/></label><label>Bewijs/notitie<input name="evidence" required placeholder="Bijv. e-mail ontvangen op…"/></label></ActionForm></section>
      </div>}
      <DataTable headers={["Nummer", "Klant", "Omschrijving", "Prioriteit", "Status"]}>{data.requests.map((item) => <tr key={item.id}><td><strong>{item.request_number}</strong><small>{dateTime(item.created_at, tenant.timezone)}</small></td><td>{item.customer_id ? customerById.get(item.customer_id)?.name : "—"}</td><td>{item.description}</td><td>{item.priority}</td><td><Pill status={item.status}/></td></tr>)}</DataTable>
    </>;

    if (view === "planning") return <>
      <PageIntro eyebrow="OPERATIE" title="Planbord" description="Planning in echte minuten, per medewerker en met de avatarrail vast in beeld." />
      <section className="panel planboard-viewport"><Planboard data={data} timezone={tenant.timezone} editable/></section>
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

    if (view === "klanten") return <CustomersPage data={data}/>;
    if (view === "objecten") return <ObjectsPage data={data}/>;

    if (view === "personeel") return <PersonnelPage data={data}/>;

    if (view === "controle") return <ReportsPage data={data} timezone={tenant.timezone}/>;

    if (view === "facturen") return <InvoicesPage data={data}/>;

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
    <aside className={`workspace-sidebar ${mobileNav ? "open" : ""}`}><div className="workspace-brand"><FieldgridBrand tenantName={tenant.name} logoUrl={data.brandingLogoUrl}/></div><nav>{visibleNav.map((item) => <Link key={item.id} href={item.href} className={view === item.id ? "active" : ""} onClick={() => setMobileNav(false)}><item.icon size={18}/><span>{item.label}</span>{item.id === "controle" && attention.length > 0 && <em>{attention.length}</em>}</Link>)}</nav><footer><span className="live-dot"/> Beveiligde tenantomgeving<small>{tenant.roles.join(" · ")}</small></footer></aside>
    <div className="workspace-main"><header className="workspace-topbar"><div><button className="mobile-menu" onClick={() => setMobileNav((value) => !value)} aria-label="Menu"><Menu size={20}/></button><span className="breadcrumb">Fieldgrid <ChevronRight size={13}/> <strong>{current.label}</strong></span></div><div className="global-search"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Zoek werkbon…"/></div><div><Bell size={18}/><span className="top-avatar">{initials(context.user.email ?? "FG")}</span><form action="/auth/signout" method="post"><button className="icon-button" aria-label="Uitloggen"><LogOut size={17}/></button></form></div></header>{context.memberships.length > 1 && <form action={switchTenant} className="tenant-switch"><select name="tenantId" defaultValue={tenant.id} onChange={(event) => event.currentTarget.form?.requestSubmit()}>{context.memberships.map((item) => <option key={item.tenantId} value={item.tenantId}>{item.tenantName}</option>)}</select></form>}<main className={`backoffice-content view-${view}`}>{content}</main></div><Toaster richColors position="top-right"/>
  </div>;
}

function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string | number; tone: string }) { return <article className="metric"><span className={`metric-icon ${tone}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong></div></article>; }
function Pill({ status }: { status: string }) { const tone = ["paid", "accepted", "approved", "invoice_ready", "active"].includes(status) ? "green" : ["returned", "correction_required", "overdue", "urgent"].includes(status) ? "orange" : ["released", "seen", "travelling", "in_progress", "sent"].includes(status) ? "blue" : "neutral"; return <span className={`pill pill-${tone}`}>{statusLabel[status] ?? status.replaceAll("_", " ")}</span>; }
function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) { return <section className="panel table-panel"><div className="table-scroll"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div></section>; }

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
