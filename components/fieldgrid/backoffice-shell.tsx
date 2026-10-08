"use client";
import { OwnershipTransfer } from "./management/transfer";
import { hasManagementPermission, permissionForPath } from "@/lib/management/model";
import "./management/management.css";
import { GuideBanner } from "@/components/fieldgrid/guides/guide";
import { ActionIcon } from "./action-icon";
import { AccountMenu, accountInitials } from "./account-menu";
import { GlobalSearch } from "./global-search";
import { EmptyState } from "./empty-state";
import { WorkOrderDialog } from "./work-orders/dialog";
import { ListPagination, useListPagination } from "./list-pagination";
import { CompactFilterMenu } from "./compact-filter-menu";
import { TaskCatalogue } from "./tasks/catalogue";
import { ContentTabs } from "./content-tabs";
import { PageHeading } from "./page-heading";
import { TravelSettings } from "./travel-settings";
import { TicketNavigation } from "./tickets/navigation";
import { NotificationBell } from "./notifications/inbox";
import { NotificationNavigation } from "./notifications/navigation";
import { WorkOrderSignatureSettings } from "./work-orders/settings";

import { useEffect,useMemo,useRef,useState,useTransition,type FormEvent,type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive, ArrowDownAZ, Bell, BriefcaseBusiness, Building2, CalendarDays, ChevronRight, ClipboardCheck,
  Clock3, CreditCard, FileText, LayoutDashboard, Megaphone,
  Menu, PackageCheck, Settings,
  UsersRound, Wrench,X, Plus, Eye,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import type { AuthContext } from "@/lib/auth/context";
import type { WorkspaceData } from "@/lib/data/workspace";
import type { ActionResult } from "@/lib/actions/result";
import { FieldgridBrand } from "@/components/fieldgrid/brand";
import { TenantBrandingSettings } from "@/components/fieldgrid/tenant-branding-settings";
import { TenantThemeProvider } from "@/components/fieldgrid/tenant-theme";
import { BackofficeLive } from "@/components/fieldgrid/backoffice-live";
import { brandThemeStyle } from "@/lib/branding/palette";
import { formatPersonnelNumber, PERSONNEL_NUMBER_MAX } from "@/lib/personnel/numbering";
import "./backoffice-portal.css";
import "./shell-chrome.css";
import { CustomersPage, InvoicesPage, ObjectsPage, PersonnelPage, ReportsPage } from "@/components/fieldgrid/resource-pages";
import { switchTenant } from "@/app/app/actions";
import {
  createAnnouncement,
  dispatchWorkOrder,
  withdrawAnnouncement, updatePersonnelNumberSettings,

} from "@/app/app/operations-actions";

export type BackofficeView = "overzicht" | "aanvragen" | "planning" | "werkbonnen" | "taken" | "klanten" | "objecten" | "personeel" | "controle" | "facturen" | "nieuws" | "instellingen" | "opvolging" | "meldingen" | "support" | "notificaties" | "gebruikers";

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
  { id: "opvolging", label: "Opvolging", icon: ClipboardCheck, href: "/app/opvolging" },
  { id: "gebruikers", label: "Gebruikers en rollen", icon: UsersRound, href: "/app/gebruikers" },
  { id: "instellingen", label: "Instellingen", icon: Settings, href: "/app/instellingen" },
  { id: "meldingen", label: "Personeelsmeldingen", icon: Bell, href: "/app/meldingen" },
  { id: "support", label: "Fieldgrid-support", icon: Bell, href: "/app/support" },
  { id: "notificaties", label: "Notificaties", icon: Bell, href: "/app/notificaties" },
];

const serviceByView: Partial<Record<BackofficeView, string>> = {
  aanvragen: "planning", planning: "planning", werkbonnen: "planning", taken: "planning",
  klanten: "planning", objecten: "planning", personeel: "personeel", nieuws: "personeel",
  controle: "rapportage", facturen: "finance",
};

const organisationViews: BackofficeView[] = ["nieuws", "opvolging", "instellingen", "gebruikers"];

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

function ActionForm({ action, children, className, success = "Opgeslagen", onSuccess, submitIcon }: { action: (data: FormData) => Promise<ActionResult<Record<string, unknown>>> | Promise<ActionResult>; children: ReactNode; className?: string; success?: string; submitIcon?: ReactNode; onSuccess?: (result: ActionResult<Record<string, unknown>> | ActionResult) => void }) {
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
  return <form className={className} onSubmit={submit}>{children}<button className={submitIcon ? "fg-action-icon" : "primary-button"} aria-label={submitIcon ? success : undefined} title={submitIcon ? success : undefined} disabled={pending}>{submitIcon ?? (pending ? "Bezig…" : success)}</button></form>;
}

function PageIntro({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <PageHeading eyebrow={eyebrow} title={title} help={description} actions={children}/>;
}

function Empty({ children }: { children: ReactNode }) { return <div className="workspace-empty"><PackageCheck size={28}/><p>{children}</p></div>; }

export function BackofficeShell({ context, data, initialView = "overzicht", children }: { context: AuthContext & { tenant: NonNullable<AuthContext["tenant"]> }; data: WorkspaceData; initialView?: BackofficeView; children?: ReactNode }) {
  const view = initialView;
  const [mobileNav, setMobileNav] = useState(false);
  const sidebar=useRef<HTMLElement>(null);
  const tenant = context.tenant;
  const visibleNav = nav.filter((item) => hasManagementPermission(tenant, permissionForPath(item.href) ?? "backoffice.access") && (item.id !== "gebruikers" || tenant.permissions?.includes("management.users.read")) && !["meldingen", "support", "notificaties"].includes(item.id) && (!serviceByView[item.id] || tenant.enabledServices.includes(serviceByView[item.id]!)));
  const customerById = useMemo(() => new Map(data.customers.map((item) => [item.id, item])), [data.customers]);
  const objectById = useMemo(() => new Map(data.objects.map((item) => [item.id, item])), [data.objects]);
  const current = nav.find((item) => item.id === view)!;
  const visibleOrders = data.workOrders;
  const person = data.personnel.find(item => item.user_id === context.user.id);
  const accountName = person?.full_name || context.user.displayName || context.user.email || "Mijn account";
  const accountRole = tenant.managementRole ?? (tenant.roles.includes("tenant_admin") ? "Eigenaar" : tenant.roles.includes("management") ? "Management" : tenant.roles.includes("planner") ? "Planner" : tenant.roles.includes("hr") ? "Personeelsbeheer" : tenant.roles.includes("finance") ? "Financieel beheer" : "Medewerker");
  const attention = data.workOrders.filter((order) => ["returned", "correction_required", "under_review"].includes(order.status));
  const navLink = (item: typeof nav[number]) => <Link
    aria-label={item.label} title={item.label} aria-current={view === item.id ? "page" : undefined}
    prefetch={view === "planning" ? false : undefined} key={item.id} href={item.href}
    className={view === item.id ? "active" : ""} onClick={() => setMobileNav(false)}
  >
    <item.icon size={18}/><span>{item.label}</span>
    {item.id === "controle" && attention.length > 0 && <em>{attention.length}</em>}
  </Link>;
  useEffect(()=>{
    if(!mobileNav)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null,overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";sidebar.current?.querySelector<HTMLElement>("button,a")?.focus();
    const closeOnWide=()=>{if(window.innerWidth>600)setMobileNav(false);};window.addEventListener("resize",closeOnWide);
    return()=>{document.body.style.overflow=overflow;window.removeEventListener("resize",closeOnWide);if(previous?.isConnected)previous.focus();};
  },[mobileNav]);

  const content = (() => {
    if (children) return children;
    if (view === "overzicht") return <>
      <PageIntro eyebrow="WERKRUIMTE" title={`Goedendag, ${tenant.name}`} description="Live overzicht van aanvragen, uitvoering, controle en betalingen." />
      <div className="metric-grid">
        <Metric icon={<FileText/>} label="Open aanvragen" value={data.requests.filter((item) => !["closed", "rejected", "processed", "withdrawn"].includes(item.status)&&!item.archived_at).length} tone="mint" />
        <Metric icon={<CalendarDays/>} label="Actieve werkbonnen" value={data.workOrders.filter((item) => !["invoiced", "cancelled"].includes(item.status)).length} tone="blue" />
        <Metric icon={<ClipboardCheck/>} label="Aandacht nodig" value={attention.length} tone="amber" />
        <Metric icon={<CreditCard/>} label="Openstaand" value={money(data.invoices.reduce((sum, item) => sum + (item.total_cents - item.paid_cents), 0))} tone="navy" />
      </div>
      <section className="panel dashboard-attention"><div className="section-heading"><div><span className="eyebrow">SIGNALEN</span><h2>Aandacht</h2></div><Link className="text-link" href="/app/rapporten">Open rapportcontrole <ChevronRight size={15}/></Link></div>{attention.length ? <div className="attention-list">{attention.slice(0, 7).map((order) => <Link key={order.id} href="/app/rapporten"><span className="attention-icon orange"><Bell size={16}/></span><span><strong>{order.work_order_number}</strong><small>{statusLabel[order.status]} · {customerById.get(order.customer_id)?.name}</small></span><ChevronRight size={15}/></Link>)}</div> : <Empty>Er zijn geen open signalen.</Empty>}</section>
    </>;

    if (view === "werkbonnen") return <>
      <PageIntro eyebrow="UITVOERING" title="Werkbonnen" description="Vrijgeven, volgen en afronden op één versievaste statusstroom." />
      <div className="kanban">{["planned", "released", "in_progress", "under_review", "invoice_ready"].map((stage, index) => <section className="kanban-col" key={stage}><div className="kanban-top"><i className={`stage-${index}`}/><strong>{statusLabel[stage]}</strong><b>{visibleOrders.filter((item) => item.status === stage || (stage === "in_progress" && ["seen", "travelling", "completed"].includes(item.status))).length}</b></div>{visibleOrders.filter((item) => item.status === stage || (stage === "in_progress" && ["seen", "travelling", "completed"].includes(item.status))).map((order) => <article className="kanban-card" id={order.id} key={order.id}><div className="card-id"><span>{order.work_order_number}</span><Pill status={order.status}/></div><h3>{objectById.get(order.object_id)?.name}</h3><p>{customerById.get(order.customer_id)?.name} · {order.discipline}</p><div className="card-meta"><Clock3 size={13}/>{dateTime(order.projected_start_at, tenant.timezone)}</div>{order.status === "planned" && <ActionForm action={dispatchWorkOrder} className="kanban-action" success="Vrijgeven"><input type="hidden" name="workOrderId" value={order.id}/><input type="hidden" name="personnelId" value={data.assignments.find((item) => item.work_order_id === order.id)?.personnel_id ?? ""}/><input type="hidden" name="version" value={order.version}/></ActionForm>}</article>)}</section>)}</div>
    </>;

    if (view === "taken") return <TaskCatalogue tenant={tenant} workspace={data}/>;

    if (view === "klanten") return <CustomersPage data={data} timezone={tenant.timezone} roles={tenant.roles}/>;
    if (view === "objecten") return <ObjectsPage data={data} timezone={tenant.timezone}/>;

    if (view === "personeel") return <PersonnelPage data={data} roles={tenant.roles}/>;

    if (view === "controle") return <ReportsPage data={data} timezone={tenant.timezone}/>;

    if (view === "facturen") return <InvoicesPage data={data}/>;

    if (view === "nieuws") return <NewsPage tenant={tenant} data={data}/>;

    return <>
      <PageIntro eyebrow="BEHEER" title="Instellingen" description="Huisstijl, afzendergegevens en nummering voor jouw organisatie." />
      <ContentTabs label="Organisatie-instellingen" tabs={[
        { id: "huisstijl", title: "Huisstijl & afzender", content: <TenantBrandingSettings key={tenant.id} tenant={tenant} branding={data.branding} logoUrl={data.brandingLogoUrl}/> },
        ...(tenant.roles.some(r => ["tenant_admin", "management"].includes(r)) ? [{ id: "reizen", title: "Reizen", content: <TravelSettings/> }] : []),
        ...(tenant.enabledServices.includes("personeel") && (context.isPlatformAdmin || tenant.roles.some(r => ["tenant_admin", "management"].includes(r))) ? [{ id: "nummering", title: "Personeelsnummering", content: <PersonnelNumberSettings key={`${tenant.id}:${data.settings?.personnel_number_prefix}:${data.settings?.personnel_number_start}`} settings={data.settings}/> }] : []),
        ...(tenant.enabledServices.includes("planning") && tenant.roles.some(r => ["tenant_admin", "management"].includes(r)) ? [{ id: "ondertekening", title: "Ondertekening", content: <WorkOrderSignatureSettings/> }] : []),
      ]}/>

    </>;
  })();

  return <TenantThemeProvider primary={tenant.primaryColor} accent={tenant.accentColor}><div className="workspace-shell" style={brandThemeStyle(tenant.primaryColor, tenant.accentColor)}>
    <BackofficeLive tenantId={tenant.id}/>
    {mobileNav&&<button type="button" className="backoffice-nav-backdrop" aria-label="Menu sluiten" onClick={()=>setMobileNav(false)}/>}
    <aside ref={sidebar} role={mobileNav?"dialog":undefined} aria-modal={mobileNav||undefined} aria-label="Hoofdnavigatie" className={`workspace-sidebar ${mobileNav ? "open" : ""}`} onKeyDown={event=>{
      if(!mobileNav)return;if(event.key==="Escape"){event.preventDefault();setMobileNav(false);return;}
      if(event.key==="Tab"){const targets=Array.from(sidebar.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],select:not(:disabled)')??[]).filter(element=>element.offsetParent!==null),first=targets[0],last=targets.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    }}>
      <div className="workspace-brand">
        <FieldgridBrand tenantName={tenant.name} logoUrl={data.brandingLogoUrl}/>
        <span className="workspace-brand-label">Backoffice</span>
        <button className="backoffice-nav-close icon-button" type="button" aria-label="Menu sluiten" onClick={() => setMobileNav(false)}><X size={20}/></button>
      </div>
      <nav aria-label="Backoffice">
        <div className="workspace-nav-group">{visibleNav.filter(item => !organisationViews.includes(item.id)).map(navLink)}</div>
        <div className="workspace-nav-group">
          <span className="workspace-nav-label">Organisatie</span>
          {visibleNav.filter(item => organisationViews.includes(item.id)).map(navLink)}
          <TicketNavigation workspace="tenant" current={view} actorKey={`${tenant.id}:${context.user.id}`}/>
          <NotificationNavigation workspace="backoffice" actorKey={`${tenant.id}:${context.user.id}`}/>
        </div>
      </nav>
      <footer>
        <span className="workspace-organisation-label">Mijn account</span>
        <div className="workspace-organisation"><span className="workspace-organisation-avatar" aria-hidden="true">{accountInitials(accountName)}</span><div><strong>{accountName}</strong><small>{accountRole}</small></div></div>
        {!tenant.whiteLabelEnabled && <span className="workspace-powered">Powered by Fieldgrid</span>}
      </footer>
    </aside>
    <div className="workspace-main" inert={mobileNav||undefined}><header className="workspace-topbar"><div><button className="mobile-menu" onClick={() => setMobileNav((value) => !value)} aria-label="Menu" aria-expanded={mobileNav}><Menu size={20}/></button><span className="breadcrumb"><span className="workspace-origin-dot" aria-hidden="true"/><span className="workspace-origin-label">Mijn omgeving</span><span aria-hidden="true">/</span><strong>{current.label}</strong></span></div><GlobalSearch key={`${tenant.id}:${context.user.id}`} actorKey={`${tenant.id}:${context.user.id}`}/><div className="shell-account-actions"><NotificationBell workspace="backoffice" actorKey={`${tenant.id}:${context.user.id}`}/><AccountMenu name={accountName} email={context.user.email} role={accountRole} settingsHref="/app/instellingen" preferencesHref="/app/notificaties/instellingen"/></div></header>{context.memberships.length > 1 && <form action={switchTenant} className="tenant-switch"><select aria-label="Tenant kiezen" name="tenantId" defaultValue={tenant.id} onChange={(event) => event.currentTarget.form?.requestSubmit()}>{context.memberships.map((item) => <option key={item.tenantId} value={item.tenantId}>{item.tenantName}</option>)}</select></form>}<main className={`backoffice-content view-${view}`}><OwnershipTransfer tenant={tenant}/><GuideBanner guideKey={`backoffice.${view}`}/>{content}</main></div><Toaster richColors position="top-right"/>
  </div></TenantThemeProvider>;
}

function NewsPage({tenant,data}:{tenant:NonNullable<AuthContext["tenant"]>;data:WorkspaceData}) {
 const router=useRouter(),[creating,setCreating]=useState(false),[selected,setSelected]=useState<WorkspaceData["announcements"][number]|null>(null),[query,setQuery]=useState(""),[state,setState]=useState("active"),[sort,setSort]=useState<"date"|"title">("date"),[descending,setDescending]=useState(true);
 const rows=data.announcements.filter(item=>(state==="all"||state==="withdrawn"?state==="all"||!!item.withdrawn_at:!item.withdrawn_at)&&`${item.title} ${item.body}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(sort==="title" ? a.title.localeCompare(b.title,"nl") : (a.published_at??a.created_at).localeCompare(b.published_at??b.created_at))*(descending?-1:1));
 const toggleSort=(key:"date"|"title")=>{setDescending(sort===key?!descending:key==="date");setSort(key);};
 const pagination=useListPagination(rows),canManage=tenant.roles.some(role=>["tenant_admin","management"].includes(role));
 return <><PageIntro eyebrow="COMMUNICATIE" title="Nieuws" description="Publiceer tenantnieuws en stuur optioneel een pushmelding."><CompactFilterMenu activeCount={(query?1:0)+(state!=="active"?1:0)}><div className="compact-filter-grid"><label>Zoeken<input type="search" value={query} onChange={e=>{setQuery(e.target.value);pagination.setPage(1);}} placeholder="Titel of bericht…"/></label><label>Weergave<select value={state} onChange={e=>{setState(e.target.value);pagination.setPage(1);}}><option value="active">Actieve berichten</option><option value="all">Alle berichten</option><option value="withdrawn">Ingetrokken berichten</option></select></label></div></CompactFilterMenu>{canManage&&<ActionIcon label="Nieuw nieuwsbericht" className="primary-button" icon={<Plus size={18}/>} onClick={()=>setCreating(true)}/>}</PageIntro>
 <section aria-label="Nieuwsberichten" className="resource-table-panel panel"><div className="table-scroll"><table className="resource-table"><thead><tr><th scope="col" aria-sort={sort==="title"?descending?"descending":"ascending":"none"}><button onClick={()=>toggleSort("title")}>Bericht<ArrowDownAZ size={13}/></button></th><th scope="col" aria-sort={sort==="date"?descending?"descending":"ascending":"none"}><button onClick={()=>toggleSort("date")}>Gepubliceerd<ArrowDownAZ size={13}/></button></th><th scope="col">Gelezen</th><th scope="col">Status</th><th scope="col">Acties</th></tr></thead><tbody>{pagination.items.map(item=><tr key={item.id}><td><button className="table-record-link" onClick={()=>setSelected(item)}>{item.title}</button><small>{item.body.length>180?`${item.body.slice(0,180)}…`:item.body}</small></td><td>{item.published_at?dateTime(item.published_at,tenant.timezone):"Concept"}</td><td>{data.announcementReads.filter(read=>read.announcement_id===item.id).length}</td><td><span className="resource-status">{item.withdrawn_at?"Ingetrokken":item.published_at?"Gepubliceerd":"Concept"}</span></td><td><div className="resource-actions"><ActionIcon label="Nieuwsbericht bekijken" icon={<Eye size={15}/>} onClick={()=>setSelected(item)}/>{canManage&&!item.withdrawn_at&&<ActionForm action={withdrawAnnouncement} success="Nieuwsbericht intrekken" submitIcon={<Archive size={15}/>} className="inline-server-form"><input type="hidden" name="announcementId" value={item.id}/></ActionForm>}</div></td></tr>)}</tbody></table></div>{!rows.length&&<EmptyState title="Nog geen nieuwsberichten" description="Gebruik de knop bovenaan om een nieuwsbericht toe te voegen."/>}</section>
 <ListPagination total={pagination.total} page={pagination.page} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} noun="berichten" preferenceKey={`backoffice:${tenant.id}:news`}/>
 {creating&&canManage&&<AnnouncementEditor tenant={tenant} onClose={()=>setCreating(false)} onSaved={()=>{setCreating(false);router.refresh();}}/>}
 {selected&&<WorkOrderDialog tenant={tenant} eyebrow="NIEUWS" title={selected.title} description={selected.published_at?dateTime(selected.published_at,tenant.timezone):"Concept"} onClose={()=>setSelected(null)}><div className="wo-dialog-body"><p style={{whiteSpace:"pre-wrap",margin:0,lineHeight:1.7}}>{selected.body}</p></div></WorkOrderDialog>}
 </>;
}
function AnnouncementEditor({tenant,onClose,onSaved}:{tenant:NonNullable<AuthContext["tenant"]>;onClose:()=>void;onSaved:()=>void}) {
 const[title,setTitle]=useState(""),[body,setBody]=useState(""),[push,setPush]=useState(false),[pending,start]=useTransition(),[error,setError]=useState("");
 return <WorkOrderDialog tenant={tenant} eyebrow="COMMUNICATIE" title="Nieuwsbericht toevoegen" description="Publiceer een bericht voor de medewerkers van je organisatie." busy={pending} dirty={Boolean(title||body||push)} onClose={onClose}><form id="announcement-create" className="wo-dialog-body wo-form" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);start(async()=>{const result=await createAnnouncement(form);if(!result.ok){setError(result.error);return;}toast.success("Nieuwsbericht gepubliceerd");onSaved();});}}><label className="wide">Titel<input name="title" required maxLength={180} value={title} onChange={e=>setTitle(e.target.value)}/></label><label className="wide">Bericht<textarea name="body" required rows={6} value={body} onChange={e=>setBody(e.target.value)}/></label><label className="check wide" style={{display:"flex",alignItems:"center",gap:10}}><input type="checkbox" name="sendPush" checked={push} onChange={e=>setPush(e.target.checked)}/>Pushmelding versturen</label>{error&&<p className="wo-error wide" role="alert">{error}</p>}</form><footer className="wizard-footer"><button className="secondary-button" disabled={pending} onClick={onClose}>Annuleren</button><button className="primary-button" form="announcement-create" disabled={pending}>{pending?"Publiceren…":"Publiceren"}</button></footer></WorkOrderDialog>;
}

function PersonnelNumberSettings({ settings }: { settings: WorkspaceData["settings"] }) {
  const [prefix, setPrefix] = useState(settings?.personnel_number_prefix ?? "P-");
  const [start, setStart] = useState(String(settings?.personnel_number_start ?? 1));
  const validStart = Number.isInteger(Number(start)) && Number(start) >= 1 && Number(start) <= PERSONNEL_NUMBER_MAX;
  return <section className="panel personnel-number-settings" aria-labelledby="personnel-number-settings-title">
    <div className="section-heading"><div><span className="eyebrow">PERSONEEL</span><h2 id="personnel-number-settings-title">Personeelsnummering</h2></div></div>
    <p className="form-note">Nieuwe medewerkers krijgen automatisch een nummer. In de wizard kun je dit per medewerker aanpassen. Bestaande nummers blijven gelijk.</p>
    <ActionForm action={updatePersonnelNumberSettings} className="workspace-form" success="Nummering opslaan">
      <label>Voorvoegsel (prefix)<input name="prefix" value={prefix} onChange={(event) => setPrefix(event.target.value)} maxLength={20} pattern="[A-Za-z0-9_\-]*" placeholder="P-"/><small>Bijvoorbeeld P- of MW-. Leeg laten mag ook.</small></label>
      <label>Startnummer<input name="startNumber" type="number" min={1} max={PERSONNEL_NUMBER_MAX} step={1} value={start} onChange={(event) => setStart(event.target.value)} required/><small>We tellen vanaf dit nummer verder; al gebruikte nummers slaan we over.</small></label>
      <div className="wizard-note wide" aria-live="polite"><UsersRound size={18}/><span>Voorbeeld bij dit startnummer: <strong>{validStart ? formatPersonnelNumber(prefix.trim(), Number(start)) : "—"}</strong>. De reeks gebruikt minimaal vier cijfers en loopt verder na het hoogste gebruikte nummer.</span></div>
    </ActionForm>
  </section>;
}

function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string | number; tone: string }) { return <article className="metric"><span className={`metric-icon ${tone}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong></div></article>; }
function Pill({ status }: { status: string }) { const tone = ["paid", "accepted", "approved", "invoice_ready", "active"].includes(status) ? "green" : ["returned", "correction_required", "overdue", "urgent"].includes(status) ? "orange" : ["released", "seen", "travelling", "in_progress", "sent"].includes(status) ? "blue" : "neutral"; return <span className={`pill pill-${tone}`}>{statusLabel[status] ?? status.replaceAll("_", " ")}</span>; }
