import { GuideBanner } from "../guides/guide";
import { AccountMenu } from "../account-menu";
import { TenantThemeProvider } from "../tenant-theme";
import { PageHeading } from "../page-heading";
import { ListPagination } from "../list-pagination";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { getPlanningShellData } from "@/lib/planning/data";
import { brandThemeStyle } from "@/lib/branding/palette";
import { getNotificationAccess, getNotificationCampaign, getNotificationCampaigns, getNotificationDeliveries, getNotificationDetail, getNotificationInbox, getNotificationPreferences, getNotificationSettings, getNotificationTemplates } from "@/lib/notifications/data";
import { getNotificationPermissions } from "@/lib/notifications/data";
import { channelLabels, notificationPaths, notificationQueryFromSearch, tabLabels, type NotificationAccess, type NotificationItem, type NotificationQuery, type NotificationWorkspace } from "@/lib/notifications/model";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import { StaffRouteShell } from "@/components/fieldgrid/staff/route-shell";
import { FieldgridBrand, ProductBrand } from "@/components/fieldgrid/brand";
import { NotificationBell, InboxActions, InboxRows, NotificationDetail } from "./inbox";
import { CampaignDetail, CampaignTable, NewCampaignButton } from "./campaigns";
import { canCreateCampaign } from "@/lib/notifications/presentation";
import { Deliveries, Policies, Preferences, Rules, TenantPolicySelector } from "./settings";
import { Templates } from "./templates";
import { Permissions } from "./permissions";
import { CompactFilterMenu } from "../compact-filter-menu";
import "./notifications.css";

export type NotificationSearch = Record<string, string | string[] | undefined>;
function url(access: NotificationAccess, query: NotificationQuery, changes: Record<string, string | number>) { const p = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => [key, String(value)])); Object.entries(changes).forEach(([key, value]) => p.set(key, String(value))); return `${notificationPaths[access.workspace]}?${p}`; }
function Pagination({ access, query, total }: { access: NotificationAccess; query: NotificationQuery; total: number }) { return <ListPagination noun="notificaties" total={total} page={query.page} pageSize={query.pageSize} preferenceKey={`${access.workspace}:${access.userId}:notifications:${query.tab}`} href={url(access,query,{})}/>; }
function Filters({ access, query, categories = [] }: { access: NotificationAccess; query: NotificationQuery; categories?: Array<{ id: string; label: string }> }) { return <form className="nt-toolbar" action={notificationPaths[access.workspace]}><input type="hidden" name="tab" value={query.tab}/><input type="hidden" name="pageSize" value={query.pageSize}/><label>Zoeken<input name="search" type="search" defaultValue={query.search} maxLength={160} placeholder="Onderwerp of afzender"/></label>{query.tab === "inbox" && <><label>Weergave<select name="view" defaultValue={query.view}><option value="all">Alle ontvangen</option><option value="unread">Ongelezen</option><option value="action">Actie gevraagd</option><option value="archived">Archief</option></select></label>{categories.length > 0 && <label>Categorie<select name="category" defaultValue={query.category}><option value="">Alle categorieën</option>{categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}</>}{query.tab === "delivery" && <><label>Kanaal<select name="channel" defaultValue={query.channel ?? ""}><option value="">Alle kanalen</option>{Object.entries(channelLabels).map(([c, label]) => <option key={c} value={c}>{label}</option>)}</select></label><label>Status<select name="status" defaultValue={query.status ?? ""}><option value="">Alle statussen</option><option value="queued">In wachtrij</option><option value="deferred">Uitgesteld</option><option value="processing">In verwerking</option><option value="accepted">Aangeboden aan provider</option><option value="failed">Mislukt</option><option value="uncertain">Onzeker</option><option value="suppressed">Onderdrukt</option><option value="unreachable">Niet bereikbaar</option><option value="expired">Verlopen</option><option value="revoked">Ingetrokken</option></select></label></>}<div className="compact-filter-actions"><Link className="text-link" href={`${notificationPaths[access.workspace]}?tab=${query.tab}`}>Filters wissen</Link><button className="secondary-button">Toepassen</button></div></form>; }

export async function NotificationRouteLayout({ workspace, children }: { workspace: NotificationWorkspace; children: ReactNode }) {
  const access = await getNotificationAccess(workspace);
  if (!access.allowed) notFound();
  if (workspace === "backoffice") { const context = await getAuthContext(); if (!context.tenant || context.tenant.id !== access.tenant?.id) notFound(); const shell = await getPlanningShellData(context.tenant.id); return <BackofficeShell context={{ ...context, tenant: context.tenant }} data={shell} initialView="notificaties">{children}</BackofficeShell>; }
  if (workspace === "staff") return <StaffRouteShell active="notifications">{children}</StaffRouteShell>;
  if (workspace === "platform") return children;
  const home = "/klant";
  const context = await getAuthContext();
  if (context.user.id !== access.userId) notFound();
  return <TenantThemeProvider primary={access.tenant?.primaryColor} accent={access.tenant?.accentColor}><div className="nt-standalone" style={brandThemeStyle(access.tenant?.primaryColor, access.tenant?.accentColor)}><header>{access.tenant ? <FieldgridBrand tenantName={access.tenant.name} logoUrl={access.tenant.logoUrl}/> : <ProductBrand/>}<nav><Link href={home}>Mijn afspraken</Link><NotificationBell workspace={workspace} actorKey={`${access.userId}:${access.tenant?.id ?? "platform"}`}/><AccountMenu name={context.user.displayName || context.user.email || "Mijn account"} email={context.user.email} role="Klant" preferencesHref={`${notificationPaths[workspace]}/instellingen`}/></nav></header><main>{workspace === "customer" && <GuideBanner guideKey="customer.notifications"/>}{children}</main></div></TenantThemeProvider>;
}
export async function NotificationIndexRoute({ workspace, searchParams, detail }: { workspace: NotificationWorkspace; searchParams: Promise<NotificationSearch>; detail?: NotificationItem }) {
  const access = await getNotificationAccess(workspace); if (!access.allowed) notFound();
  const raw = await searchParams; let query: NotificationQuery;
  try { query = notificationQueryFromSearch(raw); } catch { return <section className="nt-panel"><h1>Controleer de notificatiefilters</h1><p role="alert">Een filter of paginanummer is ongeldig.</p><Link className="secondary-button" href={notificationPaths[workspace]}>Filters herstellen</Link></section>; }
  if (!access.tabs.includes(query.tab)) { if (!raw.tab && access.tabs[0]) redirect(`${notificationPaths[workspace]}?tab=${access.tabs[0]}`); notFound(); }
  let content: ReactNode; let filters: ReactNode = null; let inboxActions: ReactNode = null;
  if (query.tab === "inbox") { const data = await getNotificationInbox(workspace, query); filters = <Filters access={access} query={query} categories={data.categories}/>; inboxActions = <InboxActions access={access} unreadCount={data.unreadCount}/>; content = <><section className="panel resource-table-panel" aria-label="Ontvangen notificaties"><InboxRows access={access} data={data}/></section><Pagination access={access} query={query} total={data.total}/></>; }
  else if (query.tab === "sent" || query.tab === "scheduled") { const data = await getNotificationCampaigns(workspace, query); filters = <Filters access={access} query={query}/>; content = <><section className="panel resource-table-panel" aria-label={query.tab === "sent" ? "Verzonden meldingen" : "Geplande meldingen"}><CampaignTable access={access} data={data}/></section><Pagination access={access} query={query} total={data.total}/></>; }
  else if (query.tab === "templates") content = <Templates access={access} data={await getNotificationTemplates(workspace)}/>;
  else if (query.tab === "permissions") content = <Permissions access={access} data={await getNotificationPermissions(workspace)}/>;
  else if (query.tab === "delivery") { const data = await getNotificationDeliveries(workspace, query); filters = <Filters access={access} query={query}/>; content = <><Deliveries access={access} data={data}/><Pagination access={access} query={query} total={data.total}/></>; }
  else {
    const selectedTenantId = workspace === "platform" && query.tab === "tenants" ? query.tenantId : undefined;
    let data: Awaited<ReturnType<typeof getNotificationSettings>>;
    try { data = await getNotificationSettings(workspace, selectedTenantId); }
    catch (error) { if (error && typeof error === "object" && "code" in error && ["42501", "P0002"].includes(String(error.code))) notFound(); throw error; }
    content = query.tab === "rules" ? <><Rules access={access} data={data}/>{workspace !== "platform" && <Policies access={access} data={data}/>}</> : query.tab === "tenants" ? <><TenantPolicySelector access={access} data={data} selectedTenantId={selectedTenantId}/>{selectedTenantId ? <Policies key={selectedTenantId} access={access} data={data} tenantOnly selectedTenantId={selectedTenantId}/> : <p className="nt-notice">Kies een tenant om de effectieve regels en afwijkingen te bekijken of aan te passen.</p>}</> : <Policies access={access} data={data}/>;
  }
  const activeFilterCount = [query.search, query.category, query.channel, query.status, query.view !== "all" ? query.view : ""].filter(Boolean).length;
  const tabs = <nav className="nt-tabs" aria-label="Notificatieonderdelen">{access.tabs.map(tab => <Link key={tab} href={`${notificationPaths[workspace]}?tab=${tab}`} aria-current={query.tab === tab ? "page" : undefined}>{tabLabels[tab]}</Link>)}</nav>;
  const actions=<>{filters&&<CompactFilterMenu activeCount={activeFilterCount} contentClassName={`nt-filter-popover${workspace === "staff" ? " ps-staff-popover" : ""}`} contentStyle={brandThemeStyle(access.tenant?.primaryColor, access.tenant?.accentColor)}>{filters}</CompactFilterMenu>}{inboxActions}{access.permissions.includes("read_own") && <Link className="secondary-button" href={`${notificationPaths[workspace]}/instellingen`}>Mijn voorkeuren</Link>}{canCreateCampaign(access) && <NewCampaignButton access={access}/>}</>;
  const title=workspace === "platform" ? "Notificatiebeheer" : workspace === "backoffice" ? "Notificaties" : "Mijn notificaties";
  return <div className={`nt-page${workspace === "backoffice" ? " nt-backoffice" : ""}`} aria-busy="false"><PageHeading eyebrow="COMMUNICATIE" title={title} help="Berichten, persoonlijke aandachtspunten en actuele bezorgstatus." actions={actions}/><div className="fg-tabbed-content">{tabs}{content}</div>{detail && <NotificationDetail access={access} data={detail}/>}</div>;
}
export async function NotificationDetailRoute({ workspace, params }: { workspace: NotificationWorkspace; params: Promise<{ id: string }> }) { const { id } = await params; if (!z.uuid().safeParse(id).success) notFound(); const access = await getNotificationAccess(workspace); if (!access.allowed || !access.permissions.includes("read_own")) notFound(); const data = await getNotificationDetail(workspace, id); if (!data) notFound(); return <NotificationIndexRoute workspace={workspace} searchParams={Promise.resolve({})} detail={data}/>; }
export async function NotificationCampaignRoute({ workspace, params }: { workspace: NotificationWorkspace; params: Promise<{ id: string }> }) { const { id } = await params; if (!z.uuid().safeParse(id).success) notFound(); const access = await getNotificationAccess(workspace); if (!access.allowed) notFound(); const data = await getNotificationCampaign(workspace, id); if (!data) notFound(); return <CampaignDetail access={access} data={data}/>; }
export async function NotificationPreferencesRoute({ workspace }: { workspace: NotificationWorkspace }) {
  const access = await getNotificationAccess(workspace);
  // Personal delivery preferences are available to an active workspace actor,
  // independently of an inbox grant. The existing preference RPCs recheck the
  // live session and bind reads/writes to this account and workspace.
  if (!access.allowed) notFound();
  return <Preferences access={access} data={await getNotificationPreferences(workspace)}/>;
}
