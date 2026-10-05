"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell, Building2, CalendarCheck, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Eye, FileText,
  List, LogOut, Megaphone, Menu,
  Info, Navigation, Newspaper, Pencil, Phone, RotateCcw, Settings, Settings2, SlidersHorizontal, Square, TicketCheck, Umbrella, UserRound,
  UsersRound, X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ComponentType,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { Toaster, toast } from "sonner";
import type { AuthContext } from "@/lib/auth/context";
import type { Json } from "@/lib/database.types";
import type { NotificationPreferences } from "@/lib/notifications/model";
import type { StaffPersonnel, StaffWorkspaceData } from "@/lib/staff/workspace";
import { addStaffDays, assignmentInterval, staffClock, staffDate, staffDayLabel, staffDuration, staffWeek, summarizeEntries } from "@/lib/staff/time";
import { localDateTime } from "@/lib/planning/time";
import { personnelThemeStyle } from "@/lib/staff/theme";
import { createClient } from "@/lib/supabase/client";
import { NotificationBell } from "@/components/fieldgrid/notifications/inbox";
import { NotificationPushControl } from "@/components/fieldgrid/notifications/push";
import {
  markAnnouncementRead, requestTimeCorrection, runStaffDayCommand,
  runStaffLeaveCommand, toggleShiftInterest, transitionWorkOrder,
  updateStaffAvailability, updateStaffProfile,
} from "@/app/staff/actions";
import { StaffOrderSheet, type StaffOrder } from "@/components/fieldgrid/staff-app";
import { defaultAvailability, defaultTransport } from "@/lib/staff/onboarding";
import { Onboarding } from "@/components/fieldgrid/staff/onboarding";
import { StaffProfileRecovery } from "@/components/fieldgrid/staff/profile-recovery";
import { StaffTicketsEntry } from "@/components/fieldgrid/staff/tickets-entry";

type Assignment = StaffWorkspaceData["assignments"][number];
type MainView = "planning" | "nieuws" | "uren" | "meer";
type MoreView = "menu" | "verlof" | "beschikbaarheid" | "documenten" | "instellingen" | "profiel";
type PlanningView = "lijst" | "agenda";
type SyncState = "offline" | "connecting" | "syncing" | "current";
type WithoutIdempotency<T> = T extends { idempotencyKey: string } ? Omit<T, "idempotencyKey"> : never;

const statusLabels: Record<string, string> = {
  planned: "Ingepland", released: "Nieuw", seen: "Gezien", travelling: "Onderweg",
  in_progress: "Aan het werk", completed: "Gereedgemeld", returned: "Teruggemeld",
  correction_required: "Correctie gevraagd", approved: "Goedgekeurd", invoice_ready: "Afgerond",
};
const leaveLabels: Record<string, string> = { vacation: "Vakantie", short: "Kort verlof", care: "Zorgverlof", unpaid: "Onbetaald verlof", other: "Anders" };
const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const dayLabels: Record<(typeof dayKeys)[number], string> = { monday: "Maandag", tuesday: "Dinsdag", wednesday: "Woensdag", thursday: "Donderdag", friday: "Vrijdag", saturday: "Zaterdag", sunday: "Zondag" };

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const objectAddress = (value: unknown) => {
  const address = (value ?? {}) as Record<string, unknown>;
  return [address.street, [address.postal_code, address.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
};
const jsonObject = (value: Json | undefined | null) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Json> : {};
const asText = (value: Json | undefined) => typeof value === "string" ? value : "";

function useProfileMenu(wrap: RefObject<HTMLDivElement | null>) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnFocusLoss = (event: FocusEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); wrap.current?.querySelector<HTMLElement>("button")?.focus(); return; }
      const items = [...(wrap.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
      const current = items.indexOf(document.activeElement as HTMLElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); items[(current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); }
      if (event.key === "Home") { event.preventDefault(); items[0]?.focus(); }
      if (event.key === "End") { event.preventDefault(); items.at(-1)?.focus(); }
    };
    wrap.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    document.addEventListener("mousedown", close);
    document.addEventListener("focusin", closeOnFocusLoss);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("focusin", closeOnFocusLoss); document.removeEventListener("keydown", key); };
  }, [open, wrap]);
  return [open, setOpen] as const;
}

export function PersonnelApp({ context, data, personnel, notificationPreferences }: {
  context: AuthContext & { tenant: NonNullable<AuthContext["tenant"]> };
  data: StaffWorkspaceData;
  personnel: StaffWorkspaceData["personnel"][number] | null;
  notificationPreferences: NotificationPreferences;
}) {
  const router = useRouter();
  const [view, setView] = useState<MainView>("planning");
  const [moreView, setMoreView] = useState<MoreView>("menu");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>("connecting");
  const [pending, startTransition] = useTransition();
  const profileMenuWrap = useRef<HTMLDivElement>(null);
  const pendingRefresh = useRef(false);
  const subscriptionReady = useRef(false);
  const [profileMenuOpen, setProfileMenuOpen] = useProfileMenu(profileMenuWrap);
  const profile = personnel;
  const assignments = useMemo(() => profile ? data.assignments.filter((item) => item.personnel_id === profile.id && item.status !== "cancelled") : [], [data.assignments, profile]);
  const assignmentByOrder = useMemo(() => new Map(assignments.map((item) => [item.work_order_id, item])), [assignments]);
  const assigned = useMemo(() => data.workOrders.filter((item) => assignmentByOrder.has(item.id)), [data.workOrders, assignmentByOrder]);
  const selected = assigned.find((item) => item.id === selectedId) ?? null;
  const tenant = context.tenant;
  const ticketsEnabled = tenant.enabledServices.includes("tickets");
  const unreadNews = data.announcements.filter(announcement => !data.announcementReads.some(read => read.announcement_id === announcement.id)).length;

  const run = (task: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) => startTransition(async () => {
    let result: { ok: boolean; error?: string };
    try {
      result = await task();
    } catch {
      toast.error("Actie mislukt. Probeer het opnieuw.");
      return;
    }
    if (!result.ok) { toast.error(result.error ?? "Actie mislukt"); return; }
    after?.();
    toast.success(success);
    router.refresh();
  });

  useEffect(() => {
    if (!pendingRefresh.current) return;
    pendingRefresh.current = false;
    setSync(!navigator.onLine ? "offline" : subscriptionReady.current ? "current" : "connecting");
  }, [data]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      const tab = query.get("tab");
      if (tab === "nieuws" || tab === "uren" || tab === "meer" || tab === "planning") setView(tab);
      const section = query.get("section");
      if (tab === "meer" && (section === "verlof" || section === "beschikbaarheid" || section === "documenten" || section === "instellingen" || section === "profiel")) setMoreView(section);
      const workOrder = query.get("workOrder");
      if (workOrder && assignmentByOrder.has(workOrder)) setSelectedId(workOrder);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [assignmentByOrder]);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    let refreshTimer = 0;
    let alive = true;
    const refresh = () => {
      if (!alive) return;
      if (!navigator.onLine) { pendingRefresh.current = false; setSync("offline"); return; }
      pendingRefresh.current = true;
      setSync("syncing");
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => router.refresh(), 250);
    };
    const online = () => { setSync("connecting"); refresh(); };
    const offline = () => { subscriptionReady.current = false; setSync("offline"); };
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const connect = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!alive || error || !session?.access_token) { setSync(navigator.onLine ? "connecting" : "offline"); return; }
      await supabase.realtime.setAuth(session.access_token);
      if (!alive) return;
      channel = supabase.channel(`staff-workspace-${tenant.id}`, { config: { postgres_changes_options: { wait: true } } }).on("postgres_changes", { event: "*", schema: "public", table: "staff_workspace_revisions", filter: `tenant_id=eq.${tenant.id}` }, refresh);
      channel.subscribe((state) => {
        if (!alive) return;
        if (state === "SUBSCRIBED") { subscriptionReady.current = true; refresh(); }
        else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") { subscriptionReady.current = false; setSync(navigator.onLine ? "connecting" : "offline"); }
      });
    };
    void connect().catch(() => { if (alive) setSync(navigator.onLine ? "connecting" : "offline"); });
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 20_000);
    window.addEventListener("focus", refresh);
    return () => { alive = false; subscriptionReady.current = false; window.clearTimeout(refreshTimer); window.clearInterval(interval); window.removeEventListener("online", online); window.removeEventListener("offline", offline); window.removeEventListener("focus", refresh); if (channel) void supabase.removeChannel(channel); };
  }, [router, tenant.id]);

  const navigate = (next: MainView) => { setView(next); setMoreView("menu"); setProfileMenuOpen(false); };
  const openOrder = (order: StaffOrder) => {
    if (profile && "onboarding_completed_at" in profile && !profile.onboarding_completed_at) { toast.error("Rond eerst je profielinstelling af."); return; }
    setSelectedId(order.id);
    const assignment = assignmentByOrder.get(order.id);
    if (assignment?.status === "released" && tenant.enabledServices.includes("rapportage")) run(() => transitionWorkOrder({ workOrderId: order.id, action: "open", version: order.version, idempotencyKey: `open-${assignment.id}-${assignment.version}` }), "Werkbon geopend");
  };

  if (!profile) return <StaffProfileRecovery/>;

  const title = view === "planning" ? "Planning" : view === "nieuws" ? "Nieuws" : view === "uren" ? "Mijn uren" : moreView === "menu" ? "Meer" : ({ verlof: "Verlof", beschikbaarheid: "Beschikbaarheid", documenten: "Documenten", instellingen: "Instellingen", profiel: "Profiel" } as Record<MoreView, string>)[moreView];
  return <div className={`personnel-app${view === "planning" ? " ps-planning-screen" : ""}`} style={personnelThemeStyle()}>
    <aside className="ps-sidebar">
      <div className="ps-sidebar-brand"><div className="ps-sidebar-logo">Fieldgrid</div><small>PERSONEELSAPP</small></div>
      <nav className="ps-nav" aria-label="Hoofdnavigatie">
        <button className={`ps-nav-button${view === "planning" ? " active" : ""}`} onClick={() => navigate("planning")}><CalendarDays/><span>Dagplanning</span></button>
        <button className={`ps-nav-button${view === "nieuws" ? " active" : ""}`} onClick={() => navigate("nieuws")}><Newspaper/><span>Nieuws</span>{unreadNews > 0 && <b>{unreadNews}</b>}</button>
        <button className={`ps-nav-button${view === "uren" ? " active" : ""}`} onClick={() => navigate("uren")}><Clock3/><span>Mijn uren</span></button>
        <StaffTicketsEntry className="ps-nav-button" enabled={ticketsEnabled}/>
        <span className="ps-nav-section">PERSONEELSZAKEN</span>
        <button className={`ps-nav-button${view === "meer" && moreView === "verlof" ? " active" : ""}`} onClick={() => { setView("meer"); setMoreView("verlof"); }}><Umbrella/><span>Verlof</span></button>
        <button className={`ps-nav-button${view === "meer" && moreView === "beschikbaarheid" ? " active" : ""}`} onClick={() => { setView("meer"); setMoreView("beschikbaarheid"); }}><CalendarCheck/><span>Beschikbaarheid</span></button>
        <button className={`ps-nav-button${view === "meer" && moreView === "documenten" ? " active" : ""}`} onClick={() => { setView("meer"); setMoreView("documenten"); }}><FileText/><span>Documenten</span></button>
        <button className={`ps-nav-button${view === "meer" && moreView === "instellingen" ? " active" : ""}`} onClick={() => { setView("meer"); setMoreView("instellingen"); }}><Settings/><span>Instellingen</span></button>
      </nav>
      <footer className="ps-sidebar-footer">
        <div className="ps-sidebar-person"><span>{initials(profile.preferred_name || profile.full_name)}</span><span><strong>{profile.preferred_name || profile.full_name}</strong><small>Medewerker</small></span></div>
      </footer>
    </aside>
    <div className="ps-workspace">
      <header className="ps-topbar">
        <div className="ps-topbar-leading">
          <div className="ps-mobile-brand"><strong>Fieldgrid</strong></div>
          <div className={`ps-sync ${sync}`} role="status" aria-label={sync === "current" ? "Alles bijgewerkt" : sync === "offline" ? "Offline" : sync === "syncing" ? "Synchroniseren" : "Verbinden"}><i/><span>{sync === "current" ? "Bijgewerkt" : sync === "offline" ? "Offline" : sync === "syncing" ? "Synchroniseren" : "Verbinden"}</span></div>
          <div className="ps-breadcrumb"><span>Mijn werkplek</span><span aria-hidden="true">/</span><strong>{view === "planning" ? "Dagplanning" : title}</strong></div>
        </div>
        <div className="ps-top-actions">
          <NotificationBell workspace="staff" actorKey={`${tenant.id}:${context.user.id}`}/>
          <div className="ps-profile-wrap" ref={profileMenuWrap}>
            <button className="ps-profile-button" aria-label={`Profielmenu van ${profile.preferred_name || profile.full_name}`} aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen(!profileMenuOpen)}><span>{initials(profile.preferred_name || profile.full_name)}</span><small>{profile.preferred_name || profile.full_name}</small><ChevronRight/></button>
            {profileMenuOpen && <div className="ps-profile-menu" role="menu">
              <button role="menuitem" onClick={() => { setView("meer"); setMoreView("profiel"); setProfileMenuOpen(false); }}><UserRound/>Profiel</button>
              <button role="menuitem" onClick={() => { setView("meer"); setMoreView("instellingen"); setProfileMenuOpen(false); }}><Settings2/>Instellingen</button>
              <form action="/auth/signout" method="post"><button role="menuitem"><LogOut/>Uitloggen</button></form>
            </div>}
          </div>
        </div>
      </header>
      <main className="ps-content">
        {view === "planning" ? <h1 className="ps-visually-hidden">Planning</h1> : view !== "uren" && <header className="ps-page-heading"><div><span className="ps-page-kicker">FIELDGRID / PERSONEEL</span><h1>{title}</h1></div>{moreView !== "menu" && view === "meer" && <button className="ps-secondary" onClick={() => setMoreView("menu")}><ChevronLeft/>Terug</button>}</header>}
        {view === "planning" && (tenant.enabledServices.includes("planning") ? <PlanningScreen orders={assigned} assignments={assignments} data={data} timezone={tenant.timezone} onOpen={openOrder} onHours={() => navigate("uren")} onNews={() => navigate("nieuws")}/> : <Empty icon={CalendarDays} title="Planning niet ingeschakeld">Vraag je beheerder om de module Planning te activeren.</Empty>)}
        {view === "nieuws" && <NewsScreen data={data} onRead={(id) => run(() => markAnnouncementRead(id), "Gemarkeerd als gelezen")}/>}
        {view === "uren" && <HoursScreen data={data} personnelId={profile.id} timezone={tenant.timezone} pending={pending} run={run}/>}
        {view === "meer" && <MoreScreen view={moreView} setView={setMoreView} data={data} profile={profile} timezone={tenant.timezone} email={context.user.email ?? profile.email ?? ""} ticketsEnabled={ticketsEnabled} pending={pending} run={run}/>}
      </main>
      <nav className="ps-bottom-nav" aria-label="Mobiele navigatie">
        <button className={view === "planning" ? "active" : ""} onClick={() => navigate("planning")}><CalendarDays/><span>Planning</span></button>
        <button className={view === "nieuws" ? "active" : ""} onClick={() => navigate("nieuws")}><Megaphone/><span>Nieuws</span></button>
        <button className={view === "uren" ? "active" : ""} onClick={() => navigate("uren")}><Clock3/><span>Mijn uren</span></button>
        <StaffTicketsEntry className="ps-bottom-tickets" enabled={ticketsEnabled}/>
        <button className={view === "meer" ? "active" : ""} onClick={() => navigate("meer")}><Menu/><span>Meer</span></button>
      </nav>
    </div>
    {selected && <StaffOrderSheet reportingEnabled={tenant.enabledServices.includes("rapportage")} order={selected} data={data} timezone={tenant.timezone} pending={pending} close={() => setSelectedId(null)} run={run}/>}
    {profile.onboarding_completed_at === null && <Onboarding profile={profile} depots={data.staffDepots} email={context.user.email ?? profile.email ?? ""} notificationPreferences={notificationPreferences} pending={pending} run={run}/>}
    <Toaster richColors position="top-center"/>
  </div>;
}

function PlanningScreen({ orders, assignments, data, timezone, onOpen, onHours, onNews }: { orders: StaffOrder[]; assignments: Assignment[]; data: StaffWorkspaceData; timezone: string; onOpen: (order: StaffOrder) => void; onHours: () => void; onNews: () => void }) {
  const today = staffDate(new Date(), timezone);
  const orderDays = assignments.map((item) => staffDate(item.projected_start_at, timezone));
  const initial = orderDays.includes(today) ? today : [...orderDays].filter((item) => item > today).sort()[0] ?? [...orderDays].sort().at(-1) ?? today;
  const [selectedDay, setSelectedDay] = useState(initial);
  const [mode, setMode] = useState<PlanningView>("lijst");
  const swipe = useRef<number | null>(null);
  const week = staffWeek(selectedDay);
  const assignmentsByOrder = new Map(assignments.map((item) => [item.work_order_id, item]));
  const visible = orders.filter((order) => staffDate(assignmentsByOrder.get(order.id)!.projected_start_at, timezone) === selectedDay)
    .sort((left, right) => mode === "agenda"
      ? Date.parse(assignmentsByOrder.get(left.id)!.projected_start_at) - Date.parse(assignmentsByOrder.get(right.id)!.projected_start_at)
      : Date.parse(right.published_at ?? assignmentsByOrder.get(right.id)!.created_at) - Date.parse(left.published_at ?? assignmentsByOrder.get(left.id)!.created_at));
  const objects = new Map(data.objects.map((item) => [item.id, item]));
  const customers = new Map(data.customers.map((item) => [item.id, item]));
  const contacts = data.staffContacts;
  const chronological = [...visible].sort((left, right) => Date.parse(assignmentsByOrder.get(left.id)!.projected_start_at) - Date.parse(assignmentsByOrder.get(right.id)!.projected_start_at));
  const next = chronological.find((order) => !assignmentsByOrder.get(order.id)?.actual_end_at) ?? chronological[0];
  const dayEntries = data.timeEntries.filter((entry) => staffDate(entry.starts_at, timezone) === selectedDay);
  const totals = summarizeEntries(dayEntries);
  const nextAssignment = next ? assignmentsByOrder.get(next.id) : null;
  const nextObject = next ? objects.get(next.object_id) : null;
  const nextContact = next ? contacts.find((item) => item.work_order_id === next.id && item.roles.includes("site")) ?? contacts.find((item) => item.work_order_id === next.id) : null;
  const nextTravel = nextAssignment ? data.travelLegs.find((leg) => leg.assignment_id === nextAssignment.id && leg.direction === "before") : null;
  const completedCount = visible.filter((order) => Boolean(assignmentsByOrder.get(order.id)?.actual_end_at) || assignmentsByOrder.get(order.id)?.status === "completed").length;
  const firstEntry = [...dayEntries].sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at))[0];
  const dateLabel = selectedDay === today
    ? `Vandaag, ${new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${selectedDay}T12:00:00Z`))}`
    : staffDayLabel(selectedDay, timezone);
  const onKey = (event: ReactKeyboardEvent) => { if (event.key === "ArrowLeft") setSelectedDay(addStaffDays(selectedDay, -1)); if (event.key === "ArrowRight") setSelectedDay(addStaffDays(selectedDay, 1)); };
  const swipeEnd = (clientX: number) => { if (swipe.current === null) return; const delta = clientX - swipe.current; if (Math.abs(delta) > 45) setSelectedDay(addStaffDays(selectedDay, delta < 0 ? 1 : -1)); swipe.current = null; };
  return <div className="ps-planning-grid">
    <section className="ps-planning-main">
      <div className="ps-planning-controls">
        <div className="ps-datebar">
          <div className="ps-week-navigation"><button className="ps-week-arrow" aria-label="Vorige week" onClick={() => setSelectedDay(addStaffDays(selectedDay, -7))}><ChevronLeft/></button><strong>{dateLabel}</strong><button className="ps-week-arrow" aria-label="Volgende week" onClick={() => setSelectedDay(addStaffDays(selectedDay, 7))}><ChevronRight/></button></div>
          <div className="ps-view-toggle" aria-label="Planningweergave"><button className={mode === "lijst" ? "active" : ""} aria-pressed={mode === "lijst"} onClick={() => setMode("lijst")}><List/>Lijst</button><button className={mode === "agenda" ? "active" : ""} aria-pressed={mode === "agenda"} onClick={() => setMode("agenda")}><CalendarDays/>Agenda</button></div>
        </div>
        <div className="ps-week" tabIndex={0} onKeyDown={onKey} onTouchStart={(event) => { swipe.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => swipeEnd(event.changedTouches[0]?.clientX ?? 0)}>
          <div className="ps-week-days">{week.map((date) => <button key={date} className={`ps-week-day${date === selectedDay ? " active" : ""}${orderDays.includes(date) ? " has-work" : ""}`} aria-pressed={date === selectedDay} onClick={() => setSelectedDay(date)}><span>{staffDayLabel(date, timezone, "short").split(" ")[0]}</span><strong>{Number(date.slice(-2))}</strong><i/></button>)}</div>
        </div>
        <div className="ps-result-line"><strong>{visible.length} {visible.length === 1 ? "werkbon" : "werkbonnen"}</strong><span>{mode === "lijst" ? "Nieuwste ontvangen bovenaan" : "Op volgorde van afspraak"}</span></div>
      </div>
      {visible.length ? mode === "lijst" ? <div className="ps-order-list">{visible.map((order) => {
        const assignment = assignmentsByOrder.get(order.id)!;
        const object = objects.get(order.object_id);
        const customer = customers.get(order.customer_id);
        const interval = assignmentInterval(assignment, timezone);
        const contact = contacts.find((item) => item.work_order_id === order.id && item.roles.includes("site")) ?? contacts.find((item) => item.work_order_id === order.id);
        const published = order.published_at ?? assignment.created_at;
        return <button className="ps-order-card" data-status={assignment.status} key={order.id} onClick={() => onOpen(order)} aria-label={`${order.work_order_number} ${object?.name ?? order.title}`}>
          <span className="ps-order-card-head"><span className="ps-order-time"><Clock3/>{interval.start}<i>–</i>{interval.end}</span><span className="ps-status" data-status={assignment.status}>{interval.paused ? "Gepauzeerd" : statusLabels[assignment.status] ?? assignment.status}</span></span>
          <span className="ps-order-main"><span className="ps-object-icon"><Building2/></span><span className="ps-order-copy"><strong className="ps-order-title">{object?.name || customer?.name || order.title}</strong><span className="ps-order-address">{objectAddress(object?.address)}</span>{contact?.phone && <span className="ps-order-phone"><Phone/>{contact.phone}</span>}</span><ChevronRight className="ps-order-chevron"/></span>
          <span className="ps-order-meta"><span>{order.work_order_number}</span><time dateTime={published}>Ontvangen {staffClock(published, timezone)}</time></span>
        </button>;
      })}</div> : <div className="ps-agenda">{visible.map((order) => { const assignment = assignmentsByOrder.get(order.id)!; const object = objects.get(order.object_id); const interval = assignmentInterval(assignment, timezone); return <div className="ps-agenda-row" key={order.id}><time><strong>{interval.start}</strong><small>{interval.end}</small></time><div><button onClick={() => onOpen(order)}><span className="ps-agenda-copy"><strong>{object?.name ?? order.title}</strong><small>{order.work_order_number} · {objectAddress(object?.address)}</small></span><span className="ps-status" data-status={assignment.status}>{interval.paused ? "Gepauzeerd" : statusLabels[assignment.status] ?? assignment.status}</span></button></div></div>; })}</div>
      : <Empty icon={CalendarDays} title="Geen werkbonnen op deze dag">Kies een andere dag. Nieuwe vrijgegeven opdrachten verschijnen automatisch.</Empty>}
    </section>
    <aside className="ps-planning-aside">
      <section className="ps-panel ps-next-panel"><div className="ps-panel-heading"><span>EERSTVOLGENDE AFSPRAAK</span><CalendarDays/></div>{next && nextAssignment ? <><h2>{nextObject?.name ?? next.title}</h2><p>{objectAddress(nextObject?.address)}</p>{nextContact?.phone && <p className="ps-next-phone"><Phone/>{nextContact.phone}</p>}<strong className="ps-next-time">{assignmentInterval(nextAssignment, timezone).start}</strong><p>Verwachte start{nextTravel?.estimated_minutes != null ? ` · ${nextTravel.estimated_minutes} min reistijd` : ""}</p><button className="ps-primary ps-full" onClick={() => onOpen(next)}><Eye/>Open werkbon</button></> : <p>Er staat niets gepland.</p>}</section>
      <section className="ps-panel"><div className="ps-panel-heading"><h2>Jouw werkdag</h2><Clock3/></div><div className="ps-metric-row"><span>Werkbonnen afgerond</span><strong>{completedCount} / {visible.length}</strong></div><div className="ps-progress"><span style={{ width: `${visible.length ? completedCount / visible.length * 100 : 0}%` }}/></div><div className="ps-metric-row"><span>Geregistreerd vanaf</span><strong>{firstEntry ? staffClock(firstEntry.starts_at, timezone) : "–"}</strong></div><div className="ps-metric-row"><span>Werkdag tot nu toe</span><strong>{staffDuration(totals.paid)}</strong></div><button className="ps-text-button" onClick={onHours}>Bekijk mijn uren</button></section>
      {data.announcements.length > 0 && <section className="ps-panel"><div className="ps-panel-heading"><h2>Goed om te weten</h2><Newspaper/></div>{data.announcements.slice(0, 2).map((announcement) => <button className="ps-mini-news" key={announcement.id} onClick={onNews}><small>Teamnieuws</small><strong>{announcement.title}</strong></button>)}</section>}
    </aside>
  </div>;
}

function NewsScreen({ data, onRead }: { data: StaffWorkspaceData; onRead: (id: string) => void }) {
  const [selected, setSelected] = useState<StaffWorkspaceData["announcements"][number] | null>(null);
  const articles = [...data.announcements].filter((item) => item.published_at && !item.withdrawn_at).sort((a, b) => Date.parse(b.published_at!) - Date.parse(a.published_at!));
  return <><div className="ps-card-list">{articles.map((item) => { const read = data.announcementReads.some((entry) => entry.announcement_id === item.id); return <button className={`ps-news-card${read ? " read" : ""}`} key={item.id} onClick={() => setSelected(item)}><span className="ps-news-card-meta"><Megaphone/><small>{new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(item.published_at!))}</small>{!read && <i/>}</span><strong className="ps-news-card-title">{item.title}</strong><span className="ps-news-card-summary">{item.body.slice(0, 220)}</span><span className="ps-news-card-footer"><span>{read ? "Gelezen" : "Graag lezen"}</span><ChevronRight/></span></button>; })}</div>{!articles.length && <Empty icon={Megaphone} title="Geen nieuws">Nieuwe teamberichten verschijnen hier.</Empty>}
    {selected && <Dialog title={selected.title} kicker="TEAMNIEUWS" close={() => setSelected(null)}><p style={{ whiteSpace: "pre-wrap" }}>{selected.body}</p><div className="ps-toast-note">Gepubliceerd op {new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short" }).format(new Date(selected.published_at!))}</div>{!data.announcementReads.some((entry) => entry.announcement_id === selected.id) && <button className="ps-primary" onClick={() => { onRead(selected.id); setSelected(null); }}><Check/>Markeer als gelezen</button>}</Dialog>}
  </>;
}

function HoursScreen({ data, personnelId, timezone, pending, run }: { data: StaffWorkspaceData; personnelId: string; timezone: string; pending: boolean; run: (task: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) => void }) {
  const [correction, setCorrection] = useState<StaffWorkspaceData["timeEntries"][number] | null>(null);
  const [chooseCorrection, setChooseCorrection] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const dayCommandKeys = useRef(new Map<string, string>());
  const runDayCommand = (intent: string, input: WithoutIdempotency<Parameters<typeof runStaffDayCommand>[0]>, success: string) => {
    const idempotencyKey = dayCommandKeys.current.get(intent) ?? crypto.randomUUID();
    dayCommandKeys.current.set(intent, idempotencyKey);
    run(async () => {
      const result = await runStaffDayCommand({ ...input, idempotencyKey } as Parameters<typeof runStaffDayCommand>[0]);
      if (result.ok) dayCommandKeys.current.delete(intent);
      return result;
    }, success);
  };
  const today = staffDate(now, timezone);
  const [selectedDay, setSelectedDay] = useState(today);
  const week = staffWeek(selectedDay);
  const currentWeek = week[0] === staffWeek(today)[0];
  const entries = data.timeEntries.filter(item => item.personnel_id === personnelId).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const rows = entries.filter(entry => staffDate(entry.starts_at, timezone) === selectedDay);
  const totals = summarizeEntries(rows, now);
  const review = data.staffDayReviews.find(item => item.personnel_id === personnelId && item.day === selectedDay);
  const requestsFor = (entry: typeof rows[number]) => data.staffTimeCorrectionRequests.filter(item => item.time_entry_id === entry.id).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const hasPendingCorrection = rows.some(entry => entry.status === "correction_requested" || requestsFor(entry).some(request => request.status === "pending"));
  const running = rows.some(entry => !entry.ends_at);
  const closed = review?.state === "closed" || review?.state === "confirmed";
  const canClose = rows.length > 0 && !closed && !running && !hasPendingCorrection && selectedDay <= today && selectedDay >= addStaffDays(today, -366);
  const canConfirm = review?.state === "closed" && rows.length > 0 && !running && !hasPendingCorrection;
  const correctable = rows.filter(entry => entry.ends_at && entry.status !== "correction_requested" && !requestsFor(entry).some(request => request.status === "pending"));
  const dayTotals = new Map(week.map(date => [date, summarizeEntries(entries.filter(entry => staffDate(entry.starts_at, timezone) === date), now)]));
  const weekTotal = week.reduce((sum, date) => sum + dayTotals.get(date)!.paid, 0);
  const visibleWeek = week.filter((date, index) => index < 5 || date === selectedDay || entries.some(entry => staffDate(entry.starts_at, timezone) === date));
  const rangeDate = (date: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const dayLabel = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${selectedDay}T12:00:00Z`));
  const entryContext = (entry: typeof rows[number]) => {
    const assignment = data.assignments.find(item => item.id === entry.assignment_id);
    const order = data.workOrders.find(item => item.id === assignment?.work_order_id);
    const object = data.objects.find(item => item.id === order?.object_id);
    return object?.name ?? (entry.kind === "travel" ? "Geregistreerde reistijd" : entry.kind === "work" ? "Geregistreerd op locatie" : "Geregistreerde overige werktijd");
  };
  const correctionStatus = (entry: typeof rows[number]) => {
    const requests = requestsFor(entry);
    const request = requests.find(item => item.status === "pending");
    const latest = requests[0];
    return request ? <small id={`time-correction-${request.id}`}>Correctie in behandeling · gewenst {staffClock(request.requested_starts_at, timezone)}–{staffClock(request.requested_ends_at, timezone)} ({request.requested_duration_minutes} min)</small> : latest && latest.status !== "withdrawn" ? <small id={`time-correction-${latest.id}`}>{latest.status === "approved" ? "Correctie goedgekeurd" : "Correctie afgewezen"}{latest.review_note ? ` · ${latest.review_note}` : ""}</small> : null;
  };
  const closeHint = closed ? "Deze werkdag is al afgesloten." : !rows.length ? "Start een werkbon om uren te registreren." : selectedDay > today ? "Een toekomstige werkdag kun je nog niet afsluiten." : selectedDay < addStaffDays(today, -366) ? "Deze werkdag valt buiten de afsluitperiode." : running ? "Rond eerst je lopende werkbon of tijdregistratie af." : hasPendingCorrection ? "Wacht eerst op de beoordeling van je correctieverzoek." : undefined;
  const openCorrection = () => {
    if (correctable.length === 1) setCorrection(correctable[0]!);
    else setChooseCorrection(true);
  };
  return <>
    <header className="ps-page-heading ps-hours-heading"><div><h1>Mijn uren</h1><p>Je volledige werkdag, met reistijd apart geregistreerd.</p></div><button className="ps-secondary" disabled={pending || !canClose} title={closeHint} onClick={() => runDayCommand(`close:${selectedDay}`, { command: "close", workDay: selectedDay, note: null }, "Werkdag afgesloten")}><Square/>{closed ? "Werkdag afgesloten" : "Werkdag afsluiten"}</button></header>
    <div className="ps-hours-metrics" aria-label="Geregistreerde dagtotalen">
      <section className="ps-panel"><span>Werkdag</span><strong>{staffDuration(totals.paid)}</strong><small>{rows[0] ? `Vanaf ${staffClock(rows[0].starts_at, timezone)}${running ? " tot nu" : " · geregistreerde tijd"}` : "Nog geen geregistreerde tijd"}</small></section>
      <section className="ps-panel"><span>Op locatie</span><strong>{staffDuration(totals.work)}</strong><small>Uit je werkbonnen</small></section>
      <section className="ps-panel"><span>Reistijd</span><strong>{staffDuration(totals.travel)}</strong><small>Inbegrepen in totaal</small></section>
    </div>
    <div className="ps-hours-grid">
      <div className="ps-hours-main">
        <section className="ps-panel ps-hours-day" aria-labelledby="ps-hours-day-title">
          <div className="ps-panel-heading"><h2 id="ps-hours-day-title">{dayLabel}</h2><span className="ps-status" data-status={hasPendingCorrection ? "correction_requested" : review?.state ?? "open"}>{hasPendingCorrection ? "Correctie in behandeling" : review?.state === "confirmed" ? "Door mij akkoord" : closed ? "Afgesloten" : !rows.length ? "Nog geen uren" : selectedDay === today ? "Dag loopt" : "Nog af te sluiten"}</span></div>
          {!rows.length && <p className="ps-hours-empty">Er zijn nog geen uren voor deze dag. Start een werkbon om uren te registreren of kies een andere dag.</p>}
          {rows.filter(entry => entry.kind !== "break").map(entry => <div className="ps-hour-row" key={entry.id}>
            <time>{staffClock(entry.starts_at, timezone)} – {entry.ends_at ? staffClock(entry.ends_at, timezone) : "nu"}</time>
            <div className="ps-hour-detail" data-kind={entry.kind}><strong>{entry.kind === "work" ? "Werk op locatie" : entry.kind === "travel" ? "Reistijd" : "Overige werktijd"}</strong><small>{entryContext(entry)}</small>{correctionStatus(entry)}</div>
            <strong>{staffDuration(summarizeEntries([entry], now).paid)}</strong>
          </div>)}
          {!rows.some(entry => !["work", "travel", "break"].includes(entry.kind)) && <div className="ps-hour-row"><span>Overige tijd</span><div className="ps-hour-detail" data-kind="other"><strong>Overige werktijd</strong><small>Geregistreerde overige tijd</small></div><strong>0 min</strong></div>}
          <div className="ps-hours-break"><span>Pauze (niet meegerekend)</span><strong>{staffDuration(totals.break)}</strong></div>
          {rows.filter(entry => entry.kind === "break").map(entry => <div className="ps-hours-break-detail" key={entry.id}><span>{staffClock(entry.starts_at, timezone)} – {entry.ends_at ? staffClock(entry.ends_at, timezone) : "nu"}</span>{correctionStatus(entry)}</div>)}
          <div className="ps-hours-day-total"><strong>Totaal ter akkoord</strong><strong>{staffDuration(totals.paid)}</strong></div>
          <footer className="ps-hours-day-actions"><button className="ps-secondary" disabled={pending || correctable.length === 0} onClick={openCorrection}><Pencil/>Correctie doorgeven</button><button className="ps-primary" disabled={pending || !canConfirm} onClick={() => review && runDayCommand(`confirm:${review.id}:${review.version}`, { command: "confirm", dayReviewId: review.id, version: review.version, note: null }, "Uren door jou bevestigd")}><Check/>{review?.state === "confirmed" ? "Uren akkoord gegeven" : "Uren akkoord geven"}</button></footer>
          {rows.length > 0 && (hasPendingCorrection || running || !closed) && <p className="ps-hours-action-note">{hasPendingCorrection ? "Je kunt deze dag pas akkoord geven nadat het openstaande correctieverzoek is beoordeeld." : running ? "Rond eerst je lopende werkbon of tijdregistratie af om je werkdag af te sluiten." : "Sluit eerst je werkdag af om je uren akkoord te geven."}</p>}
        </section>
        <p className="ps-hours-info"><Info/><span>Je uren bestaan uit geregistreerde tijd op locatie, reistijd en overige werktijd. Reistijd telt mee en blijft apart zichtbaar. Pauzes worden niet meegerekend.</span></p>
      </div>
      <aside className="ps-hours-aside">
        <section className="ps-panel ps-hours-week-panel" aria-labelledby="ps-hours-week-title">
          <div className="ps-hours-week-toolbar"><h2 id="ps-hours-week-title">{currentWeek ? "Deze week" : "Weekoverzicht"}</h2><div className="ps-hours-week-actions"><button className="ps-week-arrow" aria-label="Vorige week" onClick={() => setSelectedDay(addStaffDays(selectedDay, -7))}><ChevronLeft/></button><button className="ps-week-arrow" aria-label="Terug naar huidige week" title="Terug naar huidige week" disabled={currentWeek && selectedDay === today} onClick={() => setSelectedDay(today)}><RotateCcw/></button><button className="ps-week-arrow" aria-label="Volgende week" onClick={() => setSelectedDay(addStaffDays(selectedDay, 7))}><ChevronRight/></button></div></div>
          {!currentWeek && <small className="ps-hours-week-range" aria-live="polite">{rangeDate(week[0]!)} – {rangeDate(week[6]!)}</small>}
          <div className="ps-hours-week-overview" aria-label="Geregistreerde tijd per weekdag">{visibleWeek.map(date => <button type="button" className="ps-hours-week-day" aria-pressed={date === selectedDay} aria-label={`${staffDayLabel(date, timezone)}: ${staffDuration(dayTotals.get(date)!.paid)}`} onClick={() => setSelectedDay(date)} key={date}><span>{new Intl.DateTimeFormat("nl-NL", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</span><strong>{staffDuration(dayTotals.get(date)!.paid)}</strong></button>)}</div>
          <div className="ps-hours-week-total"><span>Totaal</span><strong>{staffDuration(weekTotal)}</strong></div>
        </section>
        <section className="ps-panel ps-hours-retention"><h2>DUIDELIJK GEREGISTREERD</h2><p>Je uren blijven beschikbaar nadat werkbonnen uit de dagplanning zijn verdwenen.</p></section>
      </aside>
    </div>
    {chooseCorrection && <Dialog title="Correctie doorgeven" kicker="MIJN UREN" close={() => setChooseCorrection(false)}><p>Kies de registratie die je wilt corrigeren.</p><div className="ps-hours-correction-options">{correctable.map(entry => <button type="button" className="ps-secondary" key={entry.id} onClick={() => { setChooseCorrection(false); setCorrection(entry); }}><span>{entry.kind === "work" ? "Werk op locatie" : entry.kind === "travel" ? "Reistijd" : entry.kind === "break" ? "Pauze" : "Overige werktijd"} · {staffClock(entry.starts_at, timezone)} – {staffClock(entry.ends_at!, timezone)}</span><ChevronRight/></button>)}</div></Dialog>}
    {correction && <CorrectionDialog entry={correction} timezone={timezone} pending={pending} close={() => setCorrection(null)} submit={input => run(() => requestTimeCorrection(input), "Correctieverzoek verstuurd; je uren blijven ongewijzigd", () => setCorrection(null))}/>}
  </>;
}

function CorrectionDialog({ entry, timezone, pending, close, submit }: { entry: StaffWorkspaceData["timeEntries"][number]; timezone: string; pending: boolean; close: () => void; submit: (input: Parameters<typeof requestTimeCorrection>[0]) => void }) {
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);
  const [mode, setMode] = useState<"times" | "duration">("duration");
  const [reason, setReason] = useState("");
  const [requestedStartLocal, setRequestedStartLocal] = useState(localDateTime(entry.starts_at, timezone));
  const [requestedEndLocal, setRequestedEndLocal] = useState(entry.ends_at ? localDateTime(entry.ends_at, timezone) : "");
  const originalDuration = entry.ends_at ? Math.max(1, Math.round((Date.parse(entry.ends_at) - Date.parse(entry.starts_at)) / 60_000)) : 1;
  const [requestedDurationMinutes, setRequestedDurationMinutes] = useState(Math.min(600, originalDuration));
  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const base = { timeEntryId: entry.id, version: entry.version, reason };
    const request = mode === "times"
      ? { ...base, mode, requestedStartLocal, requestedEndLocal }
      : { ...base, mode, requestedDurationMinutes };
    const fingerprint = JSON.stringify(request);
    if (intent.current?.fingerprint !== fingerprint) {
      intent.current = { fingerprint, key: crypto.randomUUID() };
    }
    submit({ ...request, idempotencyKey: intent.current.key });
  };
  const changed = mode === "duration"
    ? requestedDurationMinutes !== originalDuration
    : requestedStartLocal !== localDateTime(entry.starts_at, timezone) || requestedEndLocal !== localDateTime(entry.ends_at!, timezone);
  const ready = reason.trim().length >= 3 && changed && (mode === "duration"
    ? requestedDurationMinutes >= 1 && requestedDurationMinutes <= 600
    : Boolean(requestedStartLocal && requestedEndLocal));
  return <Dialog title="Correctie doorgeven" kicker="MIJN UREN" close={close} footer={<><button type="button" className="ps-secondary" disabled={pending} onClick={close}>Annuleren</button><button type="submit" form="ps-time-correction-form" className="ps-primary" disabled={pending || !ready}>{pending ? "Versturen…" : "Correctieverzoek indienen"}</button></>}>
    <form id="ps-time-correction-form" className="ps-form" onSubmit={send}>
      <div className="ps-toast-note"><strong>Gekozen registratie</strong><br/>{staffDayLabel(staffDate(entry.starts_at, timezone), timezone)} · {staffClock(entry.starts_at, timezone)}–{staffClock(entry.ends_at!, timezone)} · {entry.kind}</div>
      <fieldset className="ps-choice-group ps-time-correction-modes"><legend>Hoe wil je de correctie doorgeven?</legend><label className="ps-check"><input type="radio" name="correction-mode" value="duration" checked={mode === "duration"} onChange={() => setMode("duration")}/>Correcte duur</label><label className="ps-check"><input type="radio" name="correction-mode" value="times" checked={mode === "times"} onChange={() => setMode("times")}/>Begin- en eindtijd</label></fieldset>
      {mode === "duration" ? <label className="ps-field">Correcte duur (minuten)<input type="number" min={1} max={600} step={1} required value={requestedDurationMinutes} onChange={(event) => setRequestedDurationMinutes(event.currentTarget.valueAsNumber)}/><small>Pas de huidige duur aan; de bestaande begintijd blijft het uitgangspunt.</small></label> : <div className="ps-form-grid"><label className="ps-field">Correcte begintijd<input type="datetime-local" required value={requestedStartLocal} onChange={(event) => setRequestedStartLocal(event.target.value)}/></label><label className="ps-field">Correcte eindtijd<input type="datetime-local" required value={requestedEndLocal} onChange={(event) => setRequestedEndLocal(event.target.value)}/></label></div>}
      <label className="ps-field">Reden voor correctie<textarea rows={5} required minLength={3} maxLength={2000} placeholder="Geef concreet aan wat er niet klopt." value={reason} onChange={(event) => setReason(event.target.value)}/></label>
      <p className="ps-toast-note">Je geregistreerde uren en een eventuele accordering blijven ongewijzigd. Management beoordeelt dit verzoek afzonderlijk.</p>
    </form>
  </Dialog>;
}

function MoreScreen({ view, setView, data, profile, timezone, email, ticketsEnabled, pending, run }: { view: MoreView; setView: (view: MoreView) => void; data: StaffWorkspaceData; profile: StaffPersonnel; timezone: string; email: string; ticketsEnabled: boolean; pending: boolean; run: (task: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) => void }) {
  if (view === "verlof") return <LeaveScreen requests={data.staffLeaveRequests} entitlements={data.staffLeaveEntitlements} timezone={timezone} pending={pending} run={run}/>;
  if (view === "beschikbaarheid") return <AvailabilityScreen key={profile.id} profile={profile} pending={pending} run={run}/>;
  if (view === "documenten") return <DocumentsScreen data={data} profile={profile}/>;
  if (view === "profiel") return <ProfileScreen key={profile.id} profile={profile} depots={data.staffDepots} email={email} pending={pending} run={run}/>;
  if (view === "instellingen") return <SettingsScreen profile={profile}/>;
  const actions: Array<[MoreView, string, string, ComponentType<{ size?: number }>]> = [
    ["verlof", "Verlof", "Bekijk en dien een aanvraag in", CalendarDays], ["beschikbaarheid", "Beschikbaarheid", "Je weekpatroon en dienstvoorkeuren", UsersRound],
    ["documenten", "Documenten", "Persoonlijk met jou gedeeld", FileText], ["profiel", "Profiel", "Contact- en vervoersgegevens", UserRound], ["instellingen", "Instellingen", "Meldingen en account", Settings2],
  ];
  const shifts = data.openShifts.filter((shift) => shift.status === "open");
  return <div className="ps-more-grid">
    <section className="ps-profile-summary"><span>{initials(profile.preferred_name || profile.full_name)}</span><div><small>MIJN PROFIEL</small><h2>{profile.preferred_name || profile.full_name}</h2><p>{profile.employee_number}</p></div></section>
    {actions.map(([key, title, text, Icon]) => <button className="ps-list-row" key={key} onClick={() => setView(key)}><Icon/><span><strong>{title}</strong><small>{text}</small></span><ChevronRight/></button>)}
    <Link className="ps-list-row" href="/staff/notificaties"><Bell/><span><strong>Notificaties</strong><small>Inbox en persoonlijke voorkeuren</small></span><ChevronRight/></Link>
    <StaffTicketsEntry className="ps-list-row" enabled={ticketsEnabled}><TicketCheck/><span><strong>Tickets</strong><small>Vragen en meldingen aan je organisatie</small></span><ChevronRight/></StaffTicketsEntry>
    <section className="ps-panel"><div className="ps-panel-heading"><div><span>OPEN DIENSTEN</span><h2>Interesse doorgeven</h2></div><CalendarDays/></div>{shifts.map((shift) => {
      const interest = data.shiftInterests.find((item) => item.open_shift_id === shift.id && item.personnel_id === profile.id);
      const interested = interest?.status === "interested";
      return <div className="ps-list-row" key={shift.id}><span><strong>{staffDayLabel(staffDate(shift.starts_at, timezone), timezone)}</strong><small>{staffClock(shift.starts_at, timezone)}–{staffClock(shift.ends_at, timezone)}</small></span><button className={interested ? "ps-secondary" : "ps-primary"} disabled={pending} onClick={() => run(() => toggleShiftInterest({ shiftId: shift.id, interested: !interested }), interested ? "Interesse ingetrokken" : "Interesse doorgegeven")}>{interested ? "Intrekken" : "Interesse"}</button></div>;
    })}{!shifts.length && <p>Er zijn geen open diensten.</p>}</section>
    <form action="/auth/signout" method="post"><button className="ps-secondary"><LogOut/>Uitloggen</button></form>
  </div>;
}

function LeaveScreen({ requests, entitlements, timezone, pending, run }: { requests: StaffWorkspaceData["staffLeaveRequests"]; entitlements: StaffWorkspaceData["staffLeaveEntitlements"]; timezone: string; pending: boolean; run: (task: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) => void }) {
  const [open, setOpen] = useState(false);
  const createKey = useRef<string | null>(null);
  const withdrawKeys = useRef(new Map<string, string>());
  const close = () => {
    createKey.current = null;
    setOpen(false);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget));
    const note = String(input.note ?? "").trim();
    createKey.current ??= crypto.randomUUID();
    const idempotencyKey = createKey.current;
    run(async () => {
      const result = await runStaffLeaveCommand({
        command: "create",
        leaveType: String(input.leaveType) as "vacation" | "short" | "care" | "unpaid" | "other",
        startsOn: String(input.startsOn),
        endsOn: String(input.endsOn),
        note: note || null,
        idempotencyKey,
      });
      if (result.ok) createKey.current = null;
      return result;
    }, "Verlofaanvraag ingediend", close);
  };
  const withdraw = (request: StaffWorkspaceData["staffLeaveRequests"][number]) => {
    const intent = `${request.id}:${request.version}`;
    const idempotencyKey = withdrawKeys.current.get(intent) ?? crypto.randomUUID();
    withdrawKeys.current.set(intent, idempotencyKey);
    run(async () => {
      const result = await runStaffLeaveCommand({ command: "withdraw", leaveRequestId: request.id, version: request.version, reason: null, idempotencyKey });
      if (result.ok) withdrawKeys.current.delete(intent);
      return result;
    }, "Aanvraag ingetrokken");
  };
  const year = Number(staffDate(new Date(), timezone).slice(0, 4));
  const entitlement = entitlements.find((item) => item.calendar_year === year);
  const pendingCount = requests.filter((item) => item.status === "pending").length;
  const approvedMinutes = requests.filter((item) => item.status === "approved" && item.leave_type === "vacation").reduce((total, item) => total + (item.approved_minutes_by_year[String(year)] ?? 0), 0);
  const availableMinutes = entitlement ? entitlement.allowance_minutes + entitlement.carryover_minutes - approvedMinutes : null;
  return <>
    <div className="ps-stat-grid"><div><small>Beschikbaar saldo</small><strong>{availableMinutes === null ? "Nog niet ingesteld" : staffDuration(Math.max(0, availableMinutes))}</strong><small>{year}</small></div><div><small>Goedgekeurd</small><strong>{staffDuration(approvedMinutes)}</strong><small>Dit kalenderjaar</small></div><div><small>In afwachting</small><strong>{pendingCount}</strong><small>{pendingCount === 1 ? "Aanvraag" : "Aanvragen"}</small></div></div>
    <button className="ps-primary" onClick={() => setOpen(true)}>Verlof aanvragen</button>
    <div className="ps-card-list">{requests.map((request) => <article className="ps-panel" key={request.id}>
      <div className="ps-panel-heading"><div><span>{leaveLabels[request.leave_type] ?? request.leave_type}</span><h2>{request.starts_on} – {request.ends_on}</h2></div><span className="ps-status" data-status={request.status}>{request.status === "pending" ? "In behandeling" : request.status === "approved" ? "Goedgekeurd" : request.status === "rejected" ? "Afgewezen" : "Ingetrokken"}</span></div>
      {(request.approved_minutes ?? request.requested_minutes) && <p>{request.status === "approved" ? "Goedgekeurd" : "Aangevraagd"}: {staffDuration(request.approved_minutes ?? request.requested_minutes ?? 0)}</p>}
      {request.note && <p>{request.note}</p>}
      {request.status === "pending" && <button className="ps-danger" disabled={pending} onClick={() => withdraw(request)}>Aanvraag intrekken</button>}
    </article>)}</div>
    {!requests.length && <Empty icon={CalendarDays} title="Nog geen verlofaanvragen">Je aanvragen en besluiten verschijnen hier.</Empty>}
    {open && <Dialog title="Verlof aanvragen" kicker="PERSONEELSZAKEN" close={close} footer={<><button type="button" className="ps-secondary" onClick={close}>Annuleren</button><button type="submit" form="staff-leave-request" className="ps-primary" disabled={pending}>Aanvraag indienen</button></>}><form id="staff-leave-request" className="ps-form" onChange={() => { createKey.current = null; }} onSubmit={submit}><label className="ps-field">Type<select name="leaveType" required><option value="vacation">Vakantie</option><option value="short">Kort verlof</option><option value="care">Zorgverlof</option><option value="unpaid">Onbetaald verlof</option><option value="other">Anders</option></select></label><div className="ps-form-grid"><label className="ps-field">Vanaf<input type="date" name="startsOn" required/></label><label className="ps-field">Tot en met<input type="date" name="endsOn" required/></label></div><label className="ps-field">Toelichting<textarea name="note" rows={4} maxLength={1000}/></label></form></Dialog>}
  </>;
}

function AvailabilityScreen({ profile, pending, run }: { profile: StaffPersonnel; pending: boolean; run: (task: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) => void }) {
  const [value, setValue] = useState(() => ({ ...defaultAvailability(profile.availability_preferences), version: profile.version ?? 1 }));
  const enabled = Boolean(profile.availability_self_service_enabled);
  const toggleShift = (shift: "day" | "evening" | "night", checked: boolean) => setValue((current) => ({
    ...current,
    shifts: checked ? [...new Set([...current.shifts, shift])] : current.shifts.filter((item) => item !== shift),
  }));
  return <section className="ps-panel">
    <div className="ps-panel-heading"><div><span>WEEKPATROON</span><h2>Mijn beschikbaarheid</h2></div><span className="ps-status" data-status={enabled ? "approved" : "closed"}>{enabled ? "Bewerken toegestaan" : "Alleen-lezen"}</span></div>
    {!enabled && <div className="ps-toast-note">Je planner beheert dit patroon. Vraag management om selfservice tijdelijk te activeren als je wijzigingen moet doorgeven.</div>}
    <div className="ps-card-list">{dayKeys.map((key) => <div className="ps-list-row" key={key}><label className="ps-check"><input type="checkbox" disabled={!enabled} checked={value.week[key].enabled} onChange={(event) => setValue({ ...value, week: { ...value.week, [key]: { ...value.week[key], enabled: event.target.checked } } })}/><span><strong>{dayLabels[key]}</strong><small>{value.week[key].enabled ? "Beschikbaar" : "Niet beschikbaar"}</small></span></label><input aria-label={`${dayLabels[key]} vanaf`} type="time" disabled={!enabled || !value.week[key].enabled} value={value.week[key].start} onChange={(event) => setValue({ ...value, week: { ...value.week, [key]: { ...value.week[key], start: event.target.value } } })}/><input aria-label={`${dayLabels[key]} tot`} type="time" disabled={!enabled || !value.week[key].enabled} value={value.week[key].end} onChange={(event) => setValue({ ...value, week: { ...value.week, [key]: { ...value.week[key], end: event.target.value } } })}/></div>)}</div>
    <fieldset className="ps-choice-group" disabled={!enabled}><legend>Dienstvoorkeur</legend><label className="ps-check"><input type="checkbox" checked={value.shifts.includes("day")} onChange={(event) => toggleShift("day", event.target.checked)}/>Dag</label><label className="ps-check"><input type="checkbox" checked={value.shifts.includes("evening")} onChange={(event) => toggleShift("evening", event.target.checked)}/>Avond</label><label className="ps-check"><input type="checkbox" checked={value.shifts.includes("night")} onChange={(event) => toggleShift("night", event.target.checked)}/>Nacht</label></fieldset>
    <div className="ps-form-grid"><label className="ps-check"><input type="checkbox" disabled={!enabled} checked={value.weekends} onChange={(event) => setValue({ ...value, weekends: event.target.checked })}/>Weekend inzetbaar</label><label className="ps-check"><input type="checkbox" disabled={!enabled} checked={value.holidays} onChange={(event) => setValue({ ...value, holidays: event.target.checked })}/>Feestdagen inzetbaar</label></div>
    <label className="ps-field">Planningsopmerking<textarea disabled={!enabled} rows={4} maxLength={1000} value={value.planningNote} onChange={(event) => setValue({ ...value, planningNote: event.target.value })}/></label>
    {enabled && <button className="ps-primary" disabled={pending} onClick={() => run(async () => {
      const result = await updateStaffAvailability(value);
      if (result.ok) setValue((current) => ({ ...current, version: result.version }));
      return result;
    }, "Beschikbaarheid opgeslagen")}>Beschikbaarheid opslaan</button>}
  </section>;
}

function DocumentsScreen({ data, profile }: { data: StaffWorkspaceData; profile: StaffPersonnel }) {
  const docs = data.personnelDocuments.filter((item) => item.personnel_id === profile.id && item.visible_to_employee);
  return <div className="ps-card-list">{docs.map((item) => <a className="ps-list-row" href={`/api/files/personnel-document/${item.id}`} target="_blank" rel="noreferrer" key={item.id}><FileText/><span><strong>{item.title}</strong><small>{item.file_name ?? `Versie ${item.version}`}</small></span><ChevronRight/></a>)}{!docs.length && <Empty icon={FileText} title="Geen documenten">Documenten die HR met je deelt verschijnen hier.</Empty>}</div>;
}

function ProfileScreen({ profile, depots, email, pending, run }: { profile: StaffPersonnel; depots: StaffWorkspaceData["staffDepots"]; email: string; pending: boolean; run: (task: () => Promise<{ ok: boolean; error?: string }>, success: string) => void }) {
  const home = jsonObject(profile.home_address);
  const emergency = jsonObject(profile.emergency_contact);
  // Keep the optimistic-lock version tied to the draft that is on screen.
  // A realtime refresh may replace `profile` while the employee is typing;
  // adopting that newer version with the older draft would silently overwrite
  // the concurrent change instead of letting the database reject it.
  const [baseVersion, setBaseVersion] = useState(profile.version ?? 1);
  const [transport, setTransport] = useState(() => defaultTransport(profile));
  const setAlternate = (field: "street" | "postalCode" | "city" | "country", value: string) => setTransport((current) => ({
    ...current,
    alternateDepartureAddress: { street: "", postalCode: "", city: "", country: "NL", ...current.alternateDepartureAddress, [field]: value },
  }));
  const toggleLicenseCategory = (category: string, checked: boolean) => setTransport((current) => ({
    ...current,
    drivingLicenseCategories: checked ? [...new Set([...current.drivingLicenseCategories, category])] : current.drivingLicenseCategories.filter((item) => item !== category),
  }));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget));
    run(async () => {
      const result = await updateStaffProfile({
      version: baseVersion,
      fullName: String(input.fullName),
      preferredName: String(input.preferredName),
      phone: String(input.phone),
      mobilePhone: String(input.mobilePhone),
      birthDate: String(input.birthDate),
      homeAddress: { street: String(input.street), postalCode: String(input.postalCode), city: String(input.city), country: String(input.country) },
      emergencyContact: { name: String(input.emergencyName), phone: String(input.emergencyPhone), relation: String(input.emergencyRelation) },
      transport,
      });
      if (result.ok) setBaseVersion((current) => current + 1);
      return result;
    }, "Profiel opgeslagen");
  };
  return <section className="ps-panel"><form className="ps-form" onSubmit={submit}>
    <div className="ps-panel-heading"><div><span>MIJN GEGEVENS</span><h2>Profiel en contact</h2></div><UserRound/></div>
    <div className="ps-form-grid"><label className="ps-field">Volledige naam<input name="fullName" autoComplete="name" defaultValue={profile.full_name} required minLength={2}/></label><label className="ps-field">Roepnaam<input name="preferredName" defaultValue={profile.preferred_name ?? ""}/></label><label className="ps-field">Tweede telefoonnummer<input name="phone" type="tel" defaultValue={profile.phone ?? ""}/></label><label className="ps-field">Mobiel<input name="mobilePhone" type="tel" autoComplete="tel" defaultValue={profile.mobile_phone ?? ""}/></label><label className="ps-field">Geboortedatum<input name="birthDate" type="date" defaultValue={profile.birth_date ?? ""}/></label><label className="ps-field">Login-e-mail<input value={email} readOnly aria-readonly="true"/></label></div>
    <div className="ps-form-grid"><label className="ps-field">Straat en huisnummer<input name="street" autoComplete="street-address" defaultValue={asText(home.street)}/></label><label className="ps-field">Postcode<input name="postalCode" autoComplete="postal-code" defaultValue={asText(home.postal_code)}/></label><label className="ps-field">Plaats<input name="city" autoComplete="address-level2" defaultValue={asText(home.city)}/></label><label className="ps-field">Land<input name="country" autoComplete="country-name" defaultValue={asText(home.country) || "NL"}/></label><label className="ps-field">Noodcontact naam<input name="emergencyName" defaultValue={asText(emergency.name)}/></label><label className="ps-field">Noodcontact telefoon<input name="emergencyPhone" type="tel" defaultValue={asText(emergency.phone)}/></label><label className="ps-field">Relatie<input name="emergencyRelation" defaultValue={asText(emergency.relation)}/></label></div>
    <div className="ps-panel-heading"><div><span>REIZEN</span><h2>Vervoer en vertreklocatie</h2></div><Navigation/></div>
    <div className="ps-form-grid">
      <label className="ps-field">Standaard vervoer<select value={transport.vehicle} onChange={(event) => setTransport({ ...transport, vehicle: event.target.value as typeof transport.vehicle })}><option value="car">Auto</option><option value="van">Bedrijfsbus</option><option value="motorcycle">Motor</option><option value="scooter">Scooter</option><option value="bicycle">Fiets</option><option value="electric_bicycle">E-bike</option><option value="public_transport">Openbaar vervoer</option><option value="walking">Lopend</option><option value="other">Anders</option></select></label>
      <label className="ps-field">Vertreklocatie<select value={transport.departureKind} onChange={(event) => setTransport({ ...transport, departureKind: event.target.value as typeof transport.departureKind })}><option value="home">Woonadres</option><option value="depot">Vestiging</option><option value="alternate">Ander adres</option></select></label>
      {transport.departureKind === "depot" && <label className="ps-field">Vestiging<select required value={transport.departureDepotId ?? ""} onChange={(event) => setTransport({ ...transport, departureDepotId: event.target.value || null })}><option value="">Kies een vestiging</option>{depots.map((depot) => <option value={depot.id} key={depot.id}>{depot.name}</option>)}</select></label>}
    </div>
    {transport.departureKind === "alternate" && <div className="ps-form-grid"><label className="ps-field">Alternatief adres<input required value={transport.alternateDepartureAddress?.street ?? ""} onChange={(event) => setAlternate("street", event.target.value)}/></label><label className="ps-field">Postcode<input required value={transport.alternateDepartureAddress?.postalCode ?? ""} onChange={(event) => setAlternate("postalCode", event.target.value)}/></label><label className="ps-field">Plaats<input required value={transport.alternateDepartureAddress?.city ?? ""} onChange={(event) => setAlternate("city", event.target.value)}/></label><label className="ps-field">Land<input required value={transport.alternateDepartureAddress?.country ?? "NL"} onChange={(event) => setAlternate("country", event.target.value)}/></label></div>}
    <div className="ps-form-grid"><label className="ps-check"><input type="checkbox" checked={transport.ownTransport} onChange={(event) => setTransport({ ...transport, ownTransport: event.target.checked })}/>Ik beschik over eigen vervoer</label><label className="ps-check"><input type="checkbox" checked={transport.returnToDeparture} onChange={(event) => setTransport({ ...transport, returnToDeparture: event.target.checked })}/>Na werk terug naar vertreklocatie</label><label className="ps-check"><input type="checkbox" checked={transport.carpoolAllowed} onChange={(event) => setTransport({ ...transport, carpoolAllowed: event.target.checked })}/>Meerijden/carpool is mogelijk</label><label className="ps-check"><input type="checkbox" checked={transport.drivingLicense} onChange={(event) => setTransport({ ...transport, drivingLicense: event.target.checked, drivingLicenseCategories: event.target.checked ? transport.drivingLicenseCategories : [] })}/>Ik heb een rijbewijs</label></div>
    {transport.drivingLicense && <fieldset className="ps-choice-group"><legend>Rijbewijscategorieën</legend>{["AM", "A", "B", "BE", "C", "CE", "D"].map((category) => <label className="ps-check" key={category}><input type="checkbox" checked={transport.drivingLicenseCategories.includes(category)} onChange={(event) => toggleLicenseCategory(category, event.target.checked)}/>{category}</label>)}</fieldset>}
    <label className="ps-field">Beperkingen of aandachtspunten<textarea rows={3} maxLength={1000} value={transport.limitations} onChange={(event) => setTransport({ ...transport, limitations: event.target.value })}/></label>
    <button className="ps-primary" disabled={pending}>Profiel opslaan</button>
  </form></section>;
}

function SettingsScreen({ profile }: { profile: StaffPersonnel }) {
  return <div className="ps-card-list"><section className="ps-panel"><div className="ps-panel-heading"><div><span>MELDINGEN</span><h2>Pushmeldingen</h2></div><Bell/></div><NotificationPushControl workspace="staff"/></section><section className="ps-panel"><div className="ps-panel-heading"><div><span>ACCOUNT</span><h2>{profile.full_name}</h2></div><UserRound/></div><p>Je gebruikt de beveiligde Fieldgrid-login van je organisatie.</p><Link className="ps-secondary" href="/staff/notificaties/instellingen"><SlidersHorizontal/>Meldingsvoorkeuren</Link></section><form action="/auth/signout" method="post"><button className="ps-danger"><LogOut/>Uitloggen op dit apparaat</button></form></div>;
}

function Dialog({ title, kicker, close, children, footer }: { title: string; kicker: string; close: () => void; children: ReactNode; footer?: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => [...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
    focusable()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0]; const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, []);
  return <div className="ps-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={panel} className="ps-modal" role="dialog" aria-modal="true" aria-labelledby="ps-dialog-title"><header className="ps-modal-header"><div><span>{kicker}</span><h2 id="ps-dialog-title">{title}</h2></div><button className="ps-icon-button" onClick={close} aria-label="Sluiten"><X/></button></header><div className="ps-modal-body">{children}</div>{footer && <footer className="ps-modal-footer">{footer}</footer>}</section></div>;
}

function Empty({ icon: Icon, title, children }: { icon: ComponentType<{ size?: number }>; title: string; children: ReactNode }) {
  return <div className="ps-empty"><Icon size={34}/><h2>{title}</h2><p>{children}</p></div>;
}
