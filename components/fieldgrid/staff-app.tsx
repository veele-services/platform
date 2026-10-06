"use client";
import { SecureObjectVisit } from "./objects/secure-visit";
import { TravelOrderPanel } from "./travel";
import { TicketNavigation } from "./tickets/navigation";
import { StaffDialogContent } from "./staff/dialog-content";
import { NotificationBell } from "./notifications/inbox";
import { NotificationNavigation } from "./notifications/navigation";
import { NotificationPushControl } from "./notifications/push";
import { TicketContextPanel } from "./tickets/context";
import { businessToday } from "@/lib/personnel/dossier";

import { TaskExecution } from "./task-execution";
import {ObjectVisitSignals} from "./objects/visit-signals";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays, Camera, Check, CheckCircle2,
  ChevronRight, Clock3, FileText, Mail, MapPin, Megaphone, MoreHorizontal,
  Navigation, Package, PenLine, Phone, Play, Plus, ReceiptText, RotateCcw,
  ShieldCheck, Trash2, UserRound, X,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import type { AuthContext } from "@/lib/auth/context";
import type { StaffWorkspaceData, StaffWorkOrder } from "@/lib/staff/workspace";
import { createClient } from "@/lib/supabase/client";
import { FieldgridBrand } from "@/components/fieldgrid/brand";
import { brandThemeStyle } from "@/lib/branding/palette";
import { loadWorkOrderReport, submitWorkOrderReport } from "@/lib/work-orders/report-actions";
import { ReportDocument } from "./work-orders/report";
import { ChecklistPanel } from "./work-orders/checklists";
import { WorkOrderExceptions } from "./work-orders/exceptions";
import { reportStateLabels, type ReportVersion, type WorkOrderReport } from "@/lib/work-orders/report-model";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  externalMapsUrl,
  staffTaskBlocksCompletion,
  staffTaskIsChecked,
  staffTaskOwnQuantity,
} from "@/lib/staff/work-order-completion";
import {
  addExtraWork, addReportEntry, captureSignature, markAnnouncementRead, requestTimeCorrection,
  loadStaffSignaturePreview, reportStaffCustomerAbsent, requestStaffExtraWork, runStaffWorkOrderCostCommand,
  setTaskCompletion, toggleShiftInterest, transitionWorkOrder,
  updateReportEntry, deleteReportEntry,
} from "@/app/staff/actions";

export type StaffOrder = StaffWorkOrder;
type Order = StaffOrder;
type Tab = "planning" | "nieuws" | "uren" | "meer";
const statusLabel: Record<string, string> = { released: "Klaar om te openen", seen: "Gezien", travelling: "Onderweg", in_progress: "Bezig", completed: "Ingediend", returned: "Teruggestuurd", correction_required: "Correctie gevraagd", approved: "Goedgekeurd", invoice_ready: "Goedgekeurd" };
const time = (value: string | null, timezone: string) => value ? new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(value)) : "Nog niet gepland";
const day = (value: string | null, timezone: string) => value ? new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: timezone }).format(new Date(value)) : "Nog geen datum";
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const address = (value: unknown) => { const item = (value ?? {}) as Record<string, unknown>; return [item.street, [item.postal_code, item.city].filter(Boolean).join(" ")].filter(Boolean).join(", "); };

export function StaffApp({ context, data, personnel }: { context: AuthContext & { tenant: NonNullable<AuthContext["tenant"]> }; data: StaffWorkspaceData; personnel: StaffWorkspaceData["personnel"][number] | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("planning");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tenant = context.tenant;
  const selected = data.workOrders.find((item) => item.id === selectedId) ?? null;
  const assignments = useMemo(() => personnel ? data.assignments.filter((item) => item.personnel_id === personnel.id && item.status !== "cancelled") : [], [data.assignments, personnel]);
  const assignedIds = useMemo(() => new Set(assignments.map((item) => item.work_order_id)), [assignments]);
  const orders = data.workOrders.filter((item) => assignedIds.has(item.id)).map(item=>{const own=assignments.find(a=>a.work_order_id===item.id);return {...item,projected_start_at:own?.projected_start_at??item.projected_start_at,projected_end_at:own?.projected_end_at??item.projected_end_at};}).sort((a, b) => (b.projected_start_at ? Date.parse(b.projected_start_at) : 0) - (a.projected_start_at ? Date.parse(a.projected_start_at) : 0));

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const supabase = createClient();
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const connect = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!active || error || !session?.access_token) return;
      await supabase.realtime.setAuth(session.access_token);
      if (!active) return;
      channel = supabase.channel(`staff-workspace-${tenant.id}`, { config: { postgres_changes_options: { wait: true } } })
        .on("postgres_changes", { event: "*", schema: "public", table: "staff_workspace_revisions", filter: `tenant_id=eq.${tenant.id}` }, () => router.refresh());
      channel.subscribe();
    };
    void connect().catch(() => undefined);
    return () => { active = false; if (channel) void supabase.removeChannel(channel); };
  }, [router, tenant.id]);

  useEffect(() => {
    // Also works when the hosted database does not publish realtime events.
    // Keep an open report/form untouched while its author is working.
    const refresh = () => { if (!selectedId && !pending && document.visibilityState === "visible") router.refresh(); };
    const timer = window.setInterval(refresh, 20000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [router, selectedId, pending]);

  useEffect(() => {
    const synchronizeUrl = window.setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      const requestedTab = query.get("tab");
      if (requestedTab === "nieuws" || requestedTab === "uren" || requestedTab === "meer" || requestedTab === "planning") setTab(requestedTab);
      const requestedOrder = query.get("workOrder");
      if (requestedOrder && assignedIds.has(requestedOrder)) setSelectedId(requestedOrder);
    }, 0);
    return () => window.clearTimeout(synchronizeUrl);
  }, [data.workOrders, assignedIds]);

  const run = (task: () => Promise<{ ok: boolean; error?: string }>, success: string) => startTransition(async () => {
    const result = await task();
    if (!result.ok) { toast.error(result.error ?? "Actie mislukt"); return; }
    toast.success(success); router.refresh();
  });
  const openOrder = (order: Order) => {
    setSelectedId(order.id);
    if (tenant.enabledServices.includes("rapportage") && assignments.some(a=>a.work_order_id===order.id&&a.status==="released")) run(() => transitionWorkOrder({ workOrderId: order.id, action: "open", version: order.version, idempotencyKey: `open-${order.id}-${order.version}` }), "Werkbon geopend");
  };

  if (!personnel) return <main className="staff-blocked"><span className="product-brand">Fieldgrid</span><UserRound size={36}/><h1>Personeelsprofiel ontbreekt</h1><p>Je account heeft een personeelsrol, maar is nog niet aan een personeelskaart gekoppeld. Vraag de tenantbeheerder dit te herstellen.</p><form method="post" action="/auth/signout"><button className="secondary-button">Uitloggen</button></form></main>;

  return <div className="staff-app" style={brandThemeStyle(tenant.primaryColor, tenant.accentColor)}>
    <header className="staff-header"><FieldgridBrand tenantName={tenant.name} logoUrl={data.brandingLogoUrl}/><div className="nt-actions"><NotificationBell workspace="staff" actorKey={`${tenant.id}:${context.user.id}`}/><button className="staff-avatar" onClick={() => setTab("meer")}>{initials(personnel.full_name)}</button></div></header>
    <main className="staff-content">
      {tab === "planning" && (tenant.enabledServices.includes("planning") ? <Schedule orders={orders} data={data} timezone={tenant.timezone} onOpen={openOrder}/> : <section className="staff-panel"><h1>Planning niet ingeschakeld</h1><p>Je eigen personeelsgegevens, nieuws en uren blijven beschikbaar. Vraag je beheerder naar de module Planning.</p></section>)}
      {tab === "nieuws" && <News data={data} onRead={(id) => run(() => markAnnouncementRead(id), "Gemarkeerd als gelezen")}/>}
      {tab === "uren" && (
        <Hours
          data={data}
          personnelId={personnel.id}
          timezone={tenant.timezone}
          onCorrect={(id, duration, reason, version) =>
            run(
              () =>
                requestTimeCorrection({
                  timeEntryId: id,
                  version,
                  mode: "duration",
                  requestedDurationMinutes: duration,
                  reason,
                  idempotencyKey: crypto.randomUUID(),
                }),
              "Correctieverzoek verstuurd",
            )
          }
        />
      )}
      {tab === "meer" && <More data={data} personnel={personnel} timezone={tenant.timezone} onInterest={(shiftId, interested) => run(() => toggleShiftInterest({ shiftId, interested }), interested ? "Interesse doorgegeven" : "Interesse ingetrokken")}/>}
    </main>
    <nav className="staff-bottom-nav">{([{ id: "planning", label: "Planning", icon: CalendarDays }, { id: "nieuws", label: "Nieuws", icon: Megaphone }, { id: "uren", label: "Uren", icon: Clock3 }, { id: "meer", label: "Meer", icon: MoreHorizontal }] as const).map((item) => <button className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)}><item.icon size={20}/><span>{item.label}</span>{item.id === "nieuws" && data.announcements.some((announcement) => !data.announcementReads.some((read) => read.announcement_id === announcement.id)) && <i/>}</button>)}</nav>
    {selected && <StaffOrderSheet reportingEnabled={tenant.enabledServices.includes("rapportage")} order={selected} data={data} timezone={tenant.timezone} pending={pending} close={() => setSelectedId(null)} run={run}/>}<Toaster richColors position="top-center"/>
  </div>;
}

function Schedule({ orders, data, timezone, onOpen }: { orders: Order[]; data: StaffWorkspaceData; timezone: string; onOpen: (order: Order) => void }) {
  const objects = new Map(data.objects.map((item) => [item.id, item]));
  const customers = new Map(data.customers.map((item) => [item.id, item]));
  const grouped = orders.reduce<Map<string, Order[]>>((map, item) => { const key = item.projected_start_at ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeZone: timezone }).format(new Date(item.projected_start_at)) : "Nog geen datum"; map.set(key, [...(map.get(key) ?? []), item]); return map; }, new Map());
  return <><section className="staff-intro"><span className="eyebrow">MIJN WERK</span><h1>Planning</h1><p>{orders.length} toegewezen werkbonnen</p></section>{orders.length ? Array.from(grouped.entries()).map(([key, items]) => <section className="schedule-day" key={key}><h2>{day(items[0].projected_start_at, timezone)}</h2>{items.map((order) => <button className="schedule-card" key={order.id} onClick={() => onOpen(order)}><span className="schedule-time"><strong>{time(order.projected_start_at, timezone)}</strong><small>{time(order.projected_end_at, timezone)}</small></span><span className="schedule-line"/><span className="schedule-copy"><small>{order.work_order_number} · {order.discipline}</small><strong>{objects.get(order.object_id)?.name}</strong><span>{customers.get(order.customer_id)?.name} · {address(objects.get(order.object_id)?.address)}</span><em>{statusLabel[order.status] ?? order.status}</em></span><ChevronRight size={18}/></button>)}</section>) : <div className="staff-empty"><CalendarDays size={35}/><h2>Geen werkbonnen</h2><p>Nieuwe vrijgegeven opdrachten verschijnen hier automatisch.</p></div>}</>;
}

export function StaffOrderSheet({ reportingEnabled, order, data, timezone, pending, close, run }: { reportingEnabled: boolean; order: Order; data: StaffWorkspaceData; timezone: string; pending: boolean; close: () => void; run: (task: () => Promise<{ ok: boolean; error?: string }>, success: string) => void }) {
  const router = useRouter();
  const [section, setSection] = useState<"overzicht" | "taken" | "tijd" | "rapport">("overzicht");
  const [returnOpen, setReturnOpen] = useState(false);
  const [reportDraftOpen, setReportDraftOpen] = useState(false);
  const [deliveryDraftOpen, setDeliveryDraftOpen] = useState(false);
  const [detailDialog, setDetailDialog] = useState<"contacts" | "route" | "access" | null>(null);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [completionStage, setCompletionStage] = useState<"review" | "delivery">("review");
  const [completionError, setCompletionError] = useState("");
  const [completionPending, startCompletionTransition] = useTransition();
  const sheet = useRef<HTMLElement>(null);
  const discardReportDraft = () => {
    if (!reportDraftOpen && !deliveryDraftOpen) return true;
    if (!window.confirm("Je rapportinvoer is nog niet opgeslagen. Wil je deze invoer verwerpen?")) return false;
    setReportDraftOpen(false);
    setDeliveryDraftOpen(false);
    return true;
  };
  const requestClose = () => { if (discardReportDraft()) close(); };
  const closeCompletion = () => {
    if (completionPending) return;
    if (deliveryDraftOpen && !window.confirm("Je klantzichtbare samenvatting is nog niet opgeslagen. Wil je deze invoer verwerpen?")) return;
    setDeliveryDraftOpen(false);
    setCompletionOpen(false);
  };
  const selectSection = (nextSection: "overzicht" | "taken" | "tijd" | "rapport") => {
    if (section === "rapport" && nextSection !== "rapport" && !discardReportDraft()) return;
    setSection(nextSection);
  };
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheet.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  const handleSheetKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...(sheet.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
      .filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const object = data.objects.find((item) => item.id === order.object_id);
  const customer = data.customers.find((item) => item.id === order.customer_id);
  const tasks = data.workOrderTasks.filter((item) => item.work_order_id === order.id).map(task=>({...task,canExecute:"can_execute" in task&&task.can_execute===true}));
  const reports = data.reports.filter((item) => item.work_order_id === order.id);
  const assignment = data.assignments.find((item) => item.work_order_id === order.id && item.status !== "cancelled");
  const executionStatus = order.status === "correction_required" ? order.status : assignment?.status ?? order.status;
  const paused=Boolean(assignment?.paused_at);
  const next = executionStatus === "released" ? { action: "open" as const, label: "Open werkbon", icon: FileText } : executionStatus === "seen" ? { action: "travel" as const, label: "Vertrek", icon: Navigation } : executionStatus === "travelling" ? { action: "start" as const, label: "Start werk", icon: Play } : null;
  const transition = () => {if(!next)return;run(() => transitionWorkOrder({ workOrderId: order.id, action: next.action, version: order.version, idempotencyKey: `${next.action}-${assignment?.id}-${order.version}` }), "Status bijgewerkt");};
  const allowed = data.allowedExtraWork.filter((item) => item.work_order_id === order.id).flatMap((item) => { const rule = data.extraWorkRules.find((candidate) => candidate.id === item.extra_work_rule_id); const revision = rule ? data.taskRevisions.find((candidate) => candidate.id === rule.task_revision_id) : null; const task = revision ? data.tasks.find((candidate) => candidate.id === revision.task_id) : null; return rule && revision && task ? [{ rule, revision, task }] : []; });
  const materials = data.staffMaterials.filter((item) => item.work_order_id === order.id);
  const expenses = data.staffExpenses.filter((item) => item.work_order_id === order.id);
  const contacts = data.staffContacts.filter((item) => item.work_order_id === order.id);
  const statusEvents = data.staffStatusEvents.filter((item) => item.work_order_id === order.id);
  const canEditCosts = reportingEnabled && Boolean(assignment) && ["seen", "travelling", "in_progress", "correction_required", "completed"].includes(executionStatus);
  const canCorrectTasks = order.status === "in_progress" || order.status === "correction_required";
  const outstandingTasks = tasks.filter(staffTaskBlocksCompletion);
  const ownOutstandingTasks = outstandingTasks.filter((task) => task.canExecute);
  const colleagueOutstandingTasks = outstandingTasks.filter((task) => !task.canExecute);
  const canResumeCompletion = assignment?.status === "completed" && ["draft", "correction", "waiting_signature", "review"].includes(order.report_state);
  const openCompletion = () => {
    const blocked = reportDraftOpen || deliveryDraftOpen || ownOutstandingTasks.length > 0;
    const deliver = assignment?.status === "completed" && !blocked;
    setCompletionError("");
    setCompletionStage(deliver ? "delivery" : "review");
    if (deliver) setSection("overzicht");
    setCompletionOpen(true);
  };
  const prepareCompletion = () => {
    if (!assignment) { setCompletionError("Je actuele inzet is niet beschikbaar. Vernieuw de werkbon."); return; }
    if (reportDraftOpen || deliveryDraftOpen || ownOutstandingTasks.length > 0) return;
    if (assignment.status === "completed") { setSection("overzicht"); setCompletionStage("delivery"); return; }
    if (assignment.status !== "in_progress") { setCompletionError("Start eerst je inzet voordat je de werkbon afrondt."); return; }
    setCompletionError("");
    startCompletionTransition(async () => {
      const result = await transitionWorkOrder({ workOrderId: order.id, action: "stop", version: order.version, idempotencyKey: `stop-${assignment.id}-${order.version}` });
      if (!result.ok) { setCompletionError(result.error ?? "Je inzet kon niet veilig worden gestopt."); return; }
      setSection("overzicht");
      setCompletionStage("delivery");
      toast.success("Je eigen inzet is gestopt. Rond nu het opleverrapport af.");
      router.refresh();
    });
  };
  const leaveCompletionFor = (target: "taken" | "rapport") => {
    setCompletionOpen(false);
    setSection(target);
  };
  const returnOrder = (reason: string, note: string, idempotencyKey: string) => run(async () => {
    const result = await transitionWorkOrder({ workOrderId: order.id, action: "return", version: order.version, reason, note, idempotencyKey });
    if (result.ok) setReturnOpen(false);
    return result;
  }, "Werkbon teruggemeld");
  const canReturn = reportingEnabled && ["seen", "travelling", "in_progress", "correction_required"].includes(executionStatus);
  return <><section ref={sheet} className="order-sheet" role="dialog" aria-modal="true" aria-label={`Werkbon ${order.work_order_number}`} onKeyDown={handleSheetKeyDown}><header className="ps-order-header"><div><small>{order.work_order_number} · {day(assignment?.planned_start_at ?? order.projected_start_at, timezone)}</small><h2>{object?.name}</h2><p>{address(object?.address)}</p>{contacts[0]?.phone && <p>{contacts[0].phone}</p>}</div><div className="ps-order-header-actions">{canReturn && <button type="button" onClick={() => setReturnOpen(true)} aria-label="Werkbon terugmelden" title="Werkbon terugmelden"><RotateCcw size={19}/></button>}<button type="button" onClick={requestClose} aria-label="Sluiten"><X size={21}/></button></div></header><div className="order-tabs" role="tablist" aria-label="Werkbononderdelen"><button role="tab" aria-selected={section === "overzicht"} className={section === "overzicht" ? "active" : ""} onClick={() => selectSection("overzicht")}>Overzicht</button><button role="tab" aria-selected={section === "taken"} className={section === "taken" ? "active" : ""} onClick={() => selectSection("taken")}>Taken</button><button role="tab" aria-selected={section === "tijd"} className={section === "tijd" ? "active" : ""} onClick={() => selectSection("tijd")}>Tijd & status</button><button role="tab" aria-selected={section === "rapport"} className={section === "rapport" ? "active" : ""} onClick={() => selectSection("rapport")}>Rapport</button></div><div className="order-body">
    {!reportingEnabled && <section className="staff-panel"><p>Rapportage is niet ingeschakeld. Je kunt de planning bekijken, maar geen uitvoering of rapport vastleggen.</p></section>}
    {section === "overzicht" && <><div className="ps-order-summary"><div><h3>{customer?.name}</h3><p>{order.discipline}</p></div><span className="pill pill-teal">{statusLabel[executionStatus] ?? executionStatus}</span></div><div className="ps-order-times"><div><small>Afspraakvenster</small><strong>{time(assignment?.planned_start_at ?? order.projected_start_at, timezone)} – {time(assignment?.planned_end_at ?? order.projected_end_at, timezone)}</strong><small>Geplande afspraak</small></div><div><small>Starttijd · eindtijd</small><strong>{assignment?.actual_start_at ? time(assignment.actual_start_at, timezone) : "–"} – {assignment?.actual_end_at ? time(assignment.actual_end_at, timezone) : assignment?.actual_start_at ? "nu" : "–"}</strong><small>{assignment?.actual_end_at ? "Werkelijke werktijd" : assignment?.actual_start_at ? "Werk in uitvoering" : "Nog niet gestart"}</small></div></div><div className="ps-order-expectation"><Clock3/><span>Actuele verwachting <strong>{time(assignment?.projected_start_at ?? order.projected_start_at, timezone)} – {time(assignment?.projected_end_at ?? order.projected_end_at, timezone)}</strong></span></div></>}
    {section === "overzicht" && <section className="staff-panel staff-visit-actions"><h2>Klant & locatie</h2>{contacts[0] ? <div className="time-detail"><UserRound/><span><strong>{contacts[0].name || "Contactpersoon"}</strong><small>{contacts[0].roles.join(" · ") || customer?.name || "Contact"}</small></span></div> : <p className="muted-p">Er is geen contactpersoon aan deze afspraak gekoppeld.</p>}<div className="staff-dialog-actions">{contacts.length > 0 && <button type="button" className="secondary-button" onClick={() => setDetailDialog("contacts")}><Phone size={16}/>Contactgegevens</button>}<button type="button" className="secondary-button" disabled={!address(object?.address)} onClick={() => setDetailDialog("route")}><Navigation size={16}/>Route bekijken</button></div></section>}
    {section === "overzicht" && <TicketContextPanel kind="work_order" id={order.id} workspace="staff"/>}
    {section === "overzicht" && <section className="staff-panel"><h2>Objectdossier bij deze uitvoering</h2><ObjectVisitSignals orderId={order.id}/><p>Bekijk actuele instructies, klantverzoeken en beveiligde gegevens alleen binnen de bestaande objecttoegang.</p><button type="button" className="secondary-button" onClick={() => setDetailDialog("access")}><ShieldCheck size={16}/>Beveiligde objecttoegang</button></section>}
    {section === "overzicht" && assignment && <section className="staff-panel"><TravelOrderPanel day={businessToday(new Date(assignment.projected_start_at),timezone)} orderId={order.id} personnelId={assignment.personnel_id}/></section>}
    {section === "overzicht" && order.day_instructions && <section className="staff-panel"><h2>Instructies voor deze uitvoering</h2><p style={{whiteSpace:"pre-wrap"}}>{order.day_instructions}</p><small>Alleen voor deze bon. Eventueel meerwerk leg je afzonderlijk vast.</small></section>}
    {section === "taken" && <><section className="staff-panel"><h2>Checklist</h2>{tasks.map((task) => { const checked = staffTaskIsChecked(task); const ownQuantity = staffTaskOwnQuantity(task); return <label className={`task-check ${checked ? "done" : ""}`} key={task.id}><input type="checkbox" checked={checked} disabled={pending || checked || ownQuantity <= 0 || !reportingEnabled || !task.canExecute || !canCorrectTasks} onChange={(event) => { if (!event.currentTarget.checked) return; run(() => setTaskCompletion({ taskId: task.id, version: task.execution_version, quantity: ownQuantity }), "Taak als geheel uitgevoerd vastgelegd"); }}/><span><strong>{task.task_name}</strong><small>{task.duration_minutes} min{task.is_extra_work ? " · meerwerk" : ""}{task.execution_state === "partial" ? " · deels uitgevoerd" : task.execution_state === "not_done" ? " · niet uitgevoerd" : task.execution_state === "not_applicable" ? " · niet van toepassing" : ""}</small></span><CheckCircle2/></label>; })}</section>{canCorrectTasks && <section className="staff-panel"><h2>Resultaat & deeluitvoering</h2>{tasks.map(task=><TaskExecution key={task.id} task={task} editable={reportingEnabled && task.canExecute}/>)}</section>}{order.status === "in_progress" && allowed.length > 0 && <section className="staff-panel"><h2>Toegestaan meerwerk</h2>{allowed.map(({ rule, revision, task }) => <button className="extra-work-button" key={rule.id} onClick={() => run(() => addExtraWork({ workOrderId: order.id, ruleId: rule.id, idempotencyKey: `extra-${order.id}-${rule.id}-${crypto.randomUUID()}` }), "Meerwerk toegevoegd")}><Plus/><span><strong>{task.name}</strong><small>{revision.duration_minutes} min</small></span></button>)}</section>}</>}
    {section === "tijd" && <><section className="staff-panel"><h2>Werk en reis</h2>{data.timeEntries.filter((entry) => entry.assignment_id === assignment?.id).map((entry) => <div className="time-detail" key={entry.id}><Clock3/><span><strong>{entry.kind}</strong><small>{time(entry.starts_at, timezone)}–{entry.ends_at ? time(entry.ends_at, timezone) : "loopt"} · {entry.status}</small></span></div>)}{data.travelLegs.filter((leg) => leg.assignment_id === assignment?.id).map((leg) => <div className="time-detail" key={leg.id}><Navigation/><span><strong>{leg.direction === "before" ? "Heenreis" : "Terugreis"}</strong><small>{leg.estimated_minutes !== null ? `${leg.estimated_minutes} min · ${leg.travel_mode}` : "Reistijd onbekend"}</small></span></div>)}{!data.timeEntries.some((entry) => entry.assignment_id === assignment?.id) && !data.travelLegs.some((leg) => leg.assignment_id === assignment?.id) && <p className="muted-p">Nog geen tijdregistratie of reisberekening.</p>}</section><section className="staff-panel"><h2>Statusverloop</h2>{statusEvents.map((event) => <div className="time-detail" key={event.id}><CheckCircle2/><span><strong>{statusLabel[event.new_status] ?? event.new_status}</strong><small>{new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(event.created_at))}{event.reason_code ? ` · ${event.reason_code}` : ""}</small>{event.note && <small>{event.note}</small>}</span></div>)}{!statusEvents.length && <p className="muted-p">Nog geen statuswijzigingen vastgelegd.</p>}</section></>}
    {section === "rapport" && reportingEnabled && <><ReportSection order={order} reports={reports} data={data} pending={pending} run={run} adding={reportDraftOpen} setAdding={setReportDraftOpen}/><ExtraWorkRequests order={order} tasks={tasks.filter((task) => task.is_extra_work)} editable={executionStatus === "in_progress"} pending={pending} run={run}/><WorkOrderCosts order={order} materials={materials} expenses={expenses} editable={canEditCosts} pending={pending} run={run}/><StaffReportDelivery order={order} attachments={data.attachments.filter(a=>a.work_order_id===order.id)} draftBlocked={reportDraftOpen} onDraftChange={setDeliveryDraftOpen}/></>}
  </div>{reportingEnabled && (next || executionStatus === "in_progress" || canResumeCompletion) && <footer className="order-action">{executionStatus==="seen"&&<button className="secondary-button" disabled={pending} onClick={()=>run(()=>transitionWorkOrder({workOrderId:order.id,action:"start",version:order.version,idempotencyKey:`start-${assignment?.id}-${order.version}`}),"Werk gestart")}>Al op locatie: starten</button>}{executionStatus==="in_progress"&&<button className="secondary-button" disabled={pending} onClick={()=>run(()=>transitionWorkOrder({workOrderId:order.id,action:paused?"resume":"pause",version:order.version,idempotencyKey:`${paused?"resume":"pause"}-${assignment?.id}-${order.version}`}),paused?"Inzet hervat":"Inzet gepauzeerd")}>{paused?"Hervatten":"Pauzeren"}</button>}{next && <button className="primary-button" disabled={pending} onClick={transition}><next.icon size={18}/>{pending ? "Bezig…" : next.label}</button>}{(executionStatus === "in_progress" || canResumeCompletion) && <button className="primary-button" disabled={pending} onClick={openCompletion}><CheckCircle2 size={18}/>{canResumeCompletion ? "Gereedmelden hervatten" : "Werk afronden"}</button>}</footer>}</section><ReturnWorkOrderDialog open={returnOpen} pending={pending} workOrderNumber={order.work_order_number} onClose={() => setReturnOpen(false)} onSubmit={returnOrder}/><WorkOrderDetailDialog kind={detailDialog} contacts={contacts} customerName={customer?.name ?? ""} objectName={object?.name ?? ""} destination={address(object?.address)} projectedStart={assignment?.projected_start_at ?? order.projected_start_at} travelMinutes={data.travelLegs.find((leg) => leg.assignment_id === assignment?.id && leg.direction === "before")?.estimated_minutes ?? null} timezone={timezone} objectId={order.object_id} orderId={order.id} onClose={() => setDetailDialog(null)}/><WorkOrderCompletionDialog open={completionOpen} stage={completionStage} order={order} objectName={object?.name ?? ""} customerName={customer?.name ?? ""} assignment={assignment} tasks={tasks} ownOutstandingTasks={ownOutstandingTasks} colleagueOutstandingTasks={colleagueOutstandingTasks} customerVisibleReports={reports.filter((report) => report.customer_visible).length} materialCount={materials.length} expenseCount={expenses.length} reportDraftOpen={reportDraftOpen || deliveryDraftOpen} ownStopped={assignment?.status === "completed"} error={completionError} pending={completionPending} attachments={data.attachments.filter((attachment) => attachment.work_order_id === order.id)} timezone={timezone} onClose={closeCompletion} onPrepare={prepareCompletion} onNavigate={leaveCompletionFor} onDeliveryDraftChange={setDeliveryDraftOpen}/></>;
}

type StaffContact = StaffWorkspaceData["staffContacts"][number];
type StaffAssignment = StaffWorkspaceData["assignments"][number];
type StaffTaskWithAccess = StaffWorkspaceData["workOrderTasks"][number] & { canExecute: boolean };

function WorkOrderDetailDialog({ kind, contacts, customerName, objectName, destination, projectedStart, travelMinutes, timezone, objectId, orderId, onClose }: {
  kind: "contacts" | "route" | "access" | null;
  contacts: StaffContact[];
  customerName: string;
  objectName: string;
  destination: string;
  projectedStart: string | null;
  travelMinutes: number | null;
  timezone: string;
  objectId: string;
  orderId: string;
  onClose: () => void;
}) {
  const mapsUrl = externalMapsUrl(destination);
  const title = kind === "contacts" ? "Contactgegevens" : kind === "route" ? "Route naar locatie" : "Beveiligde objecttoegang";
  return <Dialog open={kind !== null} onOpenChange={(next) => { if (!next) onClose(); }}><StaffDialogContent className="form-dialog staff-order-dialog staff-detail-dialog" showCloseButton={false} onKeyDown={(event) => event.stopPropagation()}>
    <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{objectName}{customerName ? ` · ${customerName}` : ""}</DialogDescription></DialogHeader>
    <div className="staff-dialog-scroll">
      {kind === "contacts" && <div className="staff-contact-list">{contacts.map((contact) => <article key={contact.id}><span className="staff-contact-avatar">{initials(contact.name || "Contactpersoon")}</span><div><strong>{contact.name || "Contactpersoon"}</strong><small>{contact.roles.join(" · ") || customerName || "Contact"}</small>{contact.phone && <a href={`tel:${contact.phone}`}><Phone size={16}/>{contact.phone}</a>}{contact.email && <a href={`mailto:${contact.email}`}><Mail size={16}/>{contact.email}</a>}</div></article>)}</div>}
      {kind === "route" && <><section className="completion-summary"><MapPin/><div><strong>{objectName}</strong><p>{destination}</p></div></section><dl className="staff-route-facts"><div><dt>Verwachte reistijd</dt><dd>{travelMinutes === null ? "Niet berekend" : `${travelMinutes} minuten`}</dd></div><div><dt>Verwachte start</dt><dd>{time(projectedStart, timezone)}</dd></div></dl><p className="staff-security-note"><Navigation size={18}/>De route opent in een externe navigatiedienst. Controleer de bestemming voordat je vertrekt.</p></>}
      {kind === "access" && <SecureObjectVisit objectId={objectId} orderId={orderId} timezone={timezone}/>}
    </div>
    <DialogFooter><button type="button" className="secondary-button" onClick={onClose}>Terug naar werkbon</button>{kind === "route" && mapsUrl && <a className="primary-button" href={mapsUrl} target="_blank" rel="noreferrer"><Navigation size={16}/>Open navigatie</a>}</DialogFooter>
  </StaffDialogContent></Dialog>;
}

const taskResultLabel: Record<string, string> = {
  planned: "Open",
  in_progress: "In uitvoering",
  completed: "Geheel uitgevoerd",
  partial: "Deels uitgevoerd",
  not_done: "Niet uitgevoerd",
  not_applicable: "Niet van toepassing",
};

function WorkOrderCompletionDialog({ open, stage, order, objectName, customerName, assignment, tasks, ownOutstandingTasks, colleagueOutstandingTasks, customerVisibleReports, materialCount, expenseCount, reportDraftOpen, ownStopped, error, pending, attachments, timezone, onClose, onPrepare, onNavigate, onDeliveryDraftChange }: {
  open: boolean;
  stage: "review" | "delivery";
  order: Order;
  objectName: string;
  customerName: string;
  assignment: StaffAssignment | undefined;
  tasks: StaffTaskWithAccess[];
  ownOutstandingTasks: StaffTaskWithAccess[];
  colleagueOutstandingTasks: StaffTaskWithAccess[];
  customerVisibleReports: number;
  materialCount: number;
  expenseCount: number;
  reportDraftOpen: boolean;
  ownStopped: boolean;
  error: string;
  pending: boolean;
  attachments: Array<{ id: string; file_name: string; mime_type: string }>;
  timezone: string;
  onClose: () => void;
  onPrepare: () => void;
  onNavigate: (target: "taken" | "rapport") => void;
  onDeliveryDraftChange: (dirty: boolean) => void;
}) {
  const blockers = ownOutstandingTasks.length + (reportDraftOpen ? 1 : 0);
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}><StaffDialogContent className="form-dialog staff-order-dialog staff-completion-dialog" showCloseButton={false} onKeyDown={(event) => event.stopPropagation()}>
    <DialogHeader><span className="eyebrow">{order.work_order_number}</span><DialogTitle>Werkbon gereedmelden</DialogTitle><DialogDescription>{objectName}{customerName ? ` · ${customerName}` : ""}</DialogDescription></DialogHeader>
    <div className="staff-dialog-scroll">
      {stage === "review" ? <>
        <div className="completion-step"><span>1</span><div><strong>Controleer vóór afronden</strong><small>{ownStopped ? "Je eigen inzet is al gestopt; controleer de resterende rapportinvoer." : "Je eigen inzet stopt pas na deze controle."}</small></div></div>
        <section className="completion-summary"><CheckCircle2/><div><strong>{objectName}</strong><p>{tasks.filter(staffTaskIsChecked).length} van {tasks.length} taken geheel uitgevoerd · {customerVisibleReports} klantzichtbare rapportregel{customerVisibleReports === 1 ? "" : "s"}</p><small>{materialCount} materiaalregel{materialCount === 1 ? "" : "s"} · {expenseCount} onkostenregel{expenseCount === 1 ? "" : "s"}</small></div></section>
        <section className="completion-task-review"><h3>Taakresultaten</h3>{tasks.map((task) => { const taskOpen = staffTaskBlocksCompletion(task); return <div key={task.id} className={taskOpen ? "open" : "ready"}><span>{taskOpen ? <Clock3 size={15}/> : <Check size={15}/>}</span><div><strong>{task.task_name}</strong><small>{taskResultLabel[task.execution_state] ?? task.execution_state}</small></div></div>; })}</section>
        {(blockers > 0 || colleagueOutstandingTasks.length > 0) && <section className="completion-open-points"><h3>Nog controleren</h3>{ownOutstandingTasks.length > 0 && <p><Clock3/>Leg voor {ownOutstandingTasks.length} open taak{ownOutstandingTasks.length === 1 ? "" : "en"} eerst het werkelijke resultaat vast.</p>}{reportDraftOpen && <p><FileText/>Sla je geopende rapportinvoer op of annuleer het concept.</p>}{colleagueOutstandingTasks.length > 0 && <p><UserRound/>{colleagueOutstandingTasks.length} taak{colleagueOutstandingTasks.length === 1 ? " wacht" : "taken wachten"} nog op een andere toegewezen medewerker. Je kunt je eigen inzet wel stoppen; het gezamenlijke rapport blijft servermatig geblokkeerd tot iedereen klaar is.</p>}<div className="staff-dialog-actions">{ownOutstandingTasks.length > 0 && <button type="button" className="secondary-button" onClick={() => onNavigate("taken")}>Taken controleren</button>}{reportDraftOpen && <button type="button" className="secondary-button" onClick={() => onNavigate("rapport")}>Rapport bekijken</button>}</div></section>}
        {error && <p className="auth-message error" role="alert">{error}</p>}
      </> : <>
        <div className="completion-step"><span>2</span><div><strong>Rapport & ondertekening</strong><small>Je eigen tijdregistratie is gestopt.</small></div></div>
        <p className="staff-security-note"><CheckCircle2 size={18}/>Eigen inzet gestopt{assignment?.actual_end_at ? ` om ${time(assignment.actual_end_at, timezone)}` : ""}. De server controleert alle taakresultaten, collega-inzet, checklistvragen en de actuele rapportversie opnieuw.</p>
        <StaffReportDelivery order={order} attachments={attachments} draftBlocked={false} onDraftChange={onDeliveryDraftChange}/>
      </>}
    </div>
    <DialogFooter>{stage === "review" ? <><button type="button" className="secondary-button" disabled={pending} onClick={onClose}>Nog iets wijzigen</button><button type="button" className="primary-button" disabled={pending || blockers > 0} onClick={onPrepare}><CheckCircle2 size={16}/>{pending ? (ownStopped ? "Rapport openen…" : "Inzet stoppen…") : (ownStopped ? "Rapport openen" : "Inzet stoppen en rapport openen")}</button></> : <button type="button" className="secondary-button" onClick={onClose}>Afronding sluiten</button>}</DialogFooter>
  </StaffDialogContent></Dialog>;
}

function ReturnWorkOrderDialog({ open, pending, workOrderNumber, onClose, onSubmit }: { open: boolean; pending: boolean; workOrderNumber: string; onClose: () => void; onSubmit: (reason: string, note: string, idempotencyKey: string) => void }) {
  const idempotencyKey = useRef<string | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") ?? "").trim();
    const note = String(form.get("note") ?? "").trim();
    if (!reason || note.length < 3) return;
    idempotencyKey.current ??= crypto.randomUUID();
    onSubmit(reason, note, idempotencyKey.current);
  };
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) onClose(); }}><StaffDialogContent className="form-dialog staff-order-dialog" showCloseButton={false}>
    <DialogHeader><DialogTitle>Werkbon terugmelden</DialogTitle><DialogDescription>{workOrderNumber} gaat terug naar de planning. Kies een reden en geef voldoende toelichting voor een veilige opvolging.</DialogDescription></DialogHeader>
    <form className="form-grid" onSubmit={submit} onChange={() => { idempotencyKey.current = null; }}>
      <label className="field">Reden<select name="reason" required defaultValue=""><option value="" disabled>Kies een reden</option><option value="customer_unavailable">Klant of locatie niet beschikbaar</option><option value="unsafe_situation">Onveilige situatie</option><option value="materials_missing">Materiaal of middelen ontbreken</option><option value="planning_issue">Planning of opdracht klopt niet</option><option value="other">Andere reden</option></select></label>
      <label className="field">Toelichting<textarea name="note" required minLength={3} maxLength={1000} rows={5} placeholder="Beschrijf concreet wat de planning moet weten."/></label>
      <DialogFooter><button type="button" className="secondary-button" disabled={pending} onClick={onClose}>Annuleren</button><button className="primary-button" disabled={pending}>{pending ? "Terugmelden…" : "Werkbon terugmelden"}</button></DialogFooter>
    </form>
  </StaffDialogContent></Dialog>;
}

type StaffMaterialRow = StaffWorkspaceData["staffMaterials"][number];
type StaffExpenseRow = StaffWorkspaceData["staffExpenses"][number];
type CostRemoval = { kind: "material"; item: StaffMaterialRow } | { kind: "expense"; item: StaffExpenseRow };

function WorkOrderCosts({ order, materials, expenses, editable, pending, run }: { order: Order; materials: StaffMaterialRow[]; expenses: StaffExpenseRow[]; editable: boolean; pending: boolean; run: (task: () => Promise<{ ok: boolean; error?: string }>, success: string) => void }) {
  const [mode, setMode] = useState<"material" | "expense" | null>(null);
  const [removal, setRemoval] = useState<CostRemoval | null>(null);
  const [removalError, setRemovalError] = useState("");
  const createKey = useRef<string | null>(null);
  const deleteKeys = useRef(new Map<string, string>());
  const close = () => { if (!pending) { setMode(null); createKey.current = null; } };
  const closeRemoval = () => { if (!pending) { setRemoval(null); setRemovalError(""); } };
  const createMaterial = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const quantity = Number(form.get("quantity"));
    const unitPrice = Number(form.get("unitPrice"));
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) return;
    createKey.current ??= crypto.randomUUID();
    const key = createKey.current;
    run(async () => {
      const result = await runStaffWorkOrderCostCommand({ command: "add_material", workOrderId: order.id, taskId: null, description: String(form.get("description") ?? "").trim(), quantity, unit: String(form.get("unit") ?? "").trim(), unitPriceCents: Math.round(unitPrice * 100), customerVisible: form.get("customerVisible") === "on", idempotencyKey: key });
      if (result.ok) close();
      return result;
    }, "Materiaal toegevoegd");
  };
  const createExpense = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) return;
    createKey.current ??= crypto.randomUUID();
    const key = createKey.current;
    run(async () => {
      const result = await runStaffWorkOrderCostCommand({ command: "add_expense", workOrderId: order.id, description: String(form.get("description") ?? "").trim(), amountCents: Math.round(amount * 100), customerVisible: form.get("customerVisible") === "on", idempotencyKey: key });
      if (result.ok) close();
      return result;
    }, "Onkosten toegevoegd");
  };
  const removeMaterial = (material: StaffMaterialRow) => {
    const key = deleteKeys.current.get(material.id) ?? crypto.randomUUID();
    deleteKeys.current.set(material.id, key);
    run(async () => {
      const result = await runStaffWorkOrderCostCommand({ command: "remove_material", workOrderId: order.id, materialId: material.id, idempotencyKey: key });
      if (result.ok) { deleteKeys.current.delete(material.id); setRemoval(null); setRemovalError(""); }
      else setRemovalError(result.error);
      return result;
    }, "Materiaal verwijderd");
  };
  const removeExpense = (expense: StaffExpenseRow) => {
    const key = deleteKeys.current.get(expense.id) ?? crypto.randomUUID();
    deleteKeys.current.set(expense.id, key);
    run(async () => {
      const result = await runStaffWorkOrderCostCommand({ command: "remove_expense", workOrderId: order.id, expenseId: expense.id, version: expense.version, idempotencyKey: key });
      if (result.ok) { deleteKeys.current.delete(expense.id); setRemoval(null); setRemovalError(""); }
      else setRemovalError(result.error);
      return result;
    }, "Onkosten verwijderd");
  };
  const confirmRemoval = () => {
    if (!removal || pending) return;
    if (removal.kind === "material") removeMaterial(removal.item);
    else removeExpense(removal.item);
  };
  return <section className="staff-panel"><div className="report-heading"><div><span className="eyebrow">UITVOERING</span><h2>Materiaal & onkosten</h2></div></div>
    {materials.map((material) => <div className="time-detail" key={material.id}><Package/><span style={{ flex: 1 }}><strong>{material.description}</strong><small>{material.quantity} {material.unit}{material.unit_price_cents ? ` · ${new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(material.unit_price_cents / 100)} per ${material.unit}` : " · inbegrepen"}{material.customer_visible ? " · klantzichtbaar" : " · intern"}</small></span>{editable && material.owned_by_current_user === true && <button type="button" className="secondary-button" disabled={pending} onClick={() => { setRemovalError(""); setRemoval({ kind: "material", item: material }); }} aria-label={`Verwijder materiaal ${material.description}`}><Trash2 size={15}/></button>}</div>)}
    {expenses.map((expense) => <div className="time-detail" key={expense.id}><ReceiptText/><span style={{ flex: 1 }}><strong>{expense.description}</strong><small>{new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(expense.amount_cents / 100)}{expense.customer_visible ? " · klantzichtbaar" : " · intern"}</small></span>{editable && expense.owned_by_current_user === true && <button type="button" className="secondary-button" disabled={pending} onClick={() => { setRemovalError(""); setRemoval({ kind: "expense", item: expense }); }} aria-label={`Verwijder onkosten ${expense.description}`}><Trash2 size={15}/></button>}</div>)}
    {!materials.length && !expenses.length && <p className="muted-p">Nog geen materiaal of onkosten geregistreerd.</p>}
    {editable && <div className="sheet-actions"><button type="button" className="secondary-button" onClick={() => setMode("material")} disabled={pending}><Package size={16}/> Materiaal</button><button type="button" className="secondary-button" onClick={() => setMode("expense")} disabled={pending}><ReceiptText size={16}/> Onkosten</button></div>}
    <Dialog open={mode !== null} onOpenChange={(next) => { if (!next) close(); }}><StaffDialogContent className="form-dialog staff-order-dialog" showCloseButton={false} onKeyDown={(event) => event.stopPropagation()}><DialogHeader><DialogTitle>{mode === "material" ? "Materiaal toevoegen" : "Onkosten toevoegen"}</DialogTitle><DialogDescription>Leg alleen gegevens vast die bij jouw uitvoering van {order.work_order_number} horen.</DialogDescription></DialogHeader>
      {mode === "material" && <form className="form-grid" onSubmit={createMaterial} onChange={() => { createKey.current = null; }}><label className="field">Materiaal<input name="description" required minLength={2} maxLength={300}/></label><div className="form-two"><label className="field">Aantal<input name="quantity" type="number" min="0.001" max="10000" step="0.001" defaultValue="1" required/></label><label className="field">Eenheid<input name="unit" required minLength={1} maxLength={40} placeholder="stuk, liter, meter…"/></label></div><label className="field">Extra prijs per eenheid (€)<input name="unitPrice" type="number" min="0" max="100000" step="0.01" defaultValue="0" required/><small>Laat 0 staan als het materiaal binnen de bestaande afspraak valt.</small></label><label className="check-line"><input name="customerVisible" type="checkbox"/> Omschrijving en hoeveelheid opnemen in het klantrapport</label><DialogFooter><button type="button" className="secondary-button" disabled={pending} onClick={close}>Annuleren</button><button className="primary-button" disabled={pending}>{pending ? "Opslaan…" : "Materiaal toevoegen"}</button></DialogFooter></form>}
      {mode === "expense" && <form className="form-grid" onSubmit={createExpense} onChange={() => { createKey.current = null; }}><label className="field">Omschrijving<input name="description" required minLength={2} maxLength={300}/></label><label className="field">Bedrag (€)<input name="amount" type="number" min="0.01" max="1000000" step="0.01" required/></label><label className="check-line"><input name="customerVisible" type="checkbox"/> Deze onkosten opnemen in het klantrapport</label><DialogFooter><button type="button" className="secondary-button" disabled={pending} onClick={close}>Annuleren</button><button className="primary-button" disabled={pending}>{pending ? "Opslaan…" : "Onkosten toevoegen"}</button></DialogFooter></form>}
    </StaffDialogContent></Dialog>
    <Dialog open={removal !== null} onOpenChange={(next) => { if (!next) closeRemoval(); }}><StaffDialogContent className="form-dialog staff-order-dialog" showCloseButton={false} onKeyDown={(event) => event.stopPropagation()}><DialogHeader><DialogTitle>{removal?.kind === "material" ? "Materiaal verwijderen" : "Onkosten verwijderen"}</DialogTitle><DialogDescription>Weet je zeker dat je <strong>{removal?.item.description}</strong> uit deze werkbon wilt verwijderen? Deze wijziging is direct zichtbaar in het werkrapport.</DialogDescription></DialogHeader>{removalError && <p className="auth-message error" role="alert">{removalError}</p>}<DialogFooter><button type="button" className="secondary-button" disabled={pending} onClick={closeRemoval}>Annuleren</button><button type="button" className="primary-button" disabled={pending || !removal} onClick={confirmRemoval}><Trash2 size={16}/>{pending ? "Verwijderen…" : "Definitief verwijderen"}</button></DialogFooter></StaffDialogContent></Dialog>
  </section>;
}

function PrivateAttachment({ id, name, mime }: { id: string; name: string; mime: string | null }) {
  if (mime === "application/pdf") return <a className="report-photo" style={{ display: "grid", placeItems: "center", alignContent: "center", gap: 6, padding: 8, color: "#087f7d", textAlign: "center", fontSize: 10, fontWeight: 800 }} href={`/api/files/attachment/${id}`} target="_blank" rel="noreferrer" aria-label={`Open PDF ${name}`}><FileText size={28}/><span>{name}</span></a>;
  return <a className="report-photo" href={`/api/files/attachment/${id}`} target="_blank" rel="noreferrer">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/api/files/attachment/${id}`} alt={name}/>
  </a>;
}

type OwnedReportEntry = StaffWorkspaceData["reports"][number];
type ReportEntryRow = OwnedReportEntry;
type ReportEntryAction = { mode: "edit" | "delete"; entry: ReportEntryRow };

function ReportSection({ order, reports, data, pending, run, adding, setAdding }: { order: Order; reports: OwnedReportEntry[]; data: StaffWorkspaceData; pending: boolean; run: (task: () => Promise<{ ok: boolean; error?: string }>, success: string) => void; adding: boolean; setAdding: (open: boolean) => void }) {
  const [fileError, setFileError] = useState("");
  const mutationId = useRef<string | null>(null);
  const [entryAction, setEntryAction] = useState<ReportEntryAction | null>(null);
  const [editBody, setEditBody] = useState("");
  const [entryError, setEntryError] = useState("");
  const canEdit = ["seen", "travelling", "in_progress", "correction_required", "completed"].includes(order.status);
  const attachmentError = (files: FileList | null) => {
    const selected = files ? [...files] : [];
    if (selected.length > 5) return "Selecteer maximaal vijf bijlagen.";
    if (selected.some((file) => file.size > 10 * 1024 * 1024)) return "Iedere bijlage mag maximaal 10 MB zijn.";
    if (selected.some((file) => !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type))) return "Gebruik alleen JPG, PNG, WebP of PDF.";
    return "";
  };
  const invalidateMutation = () => { mutationId.current = null; };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const input = form.elements.namedItem("photos"); const error = input instanceof HTMLInputElement ? attachmentError(input.files) : ""; setFileError(error); if (error) return; mutationId.current ??= crypto.randomUUID(); const formData = new FormData(form); formData.set("workOrderId", order.id); formData.set("mutationId", mutationId.current); run(async () => { const result=await addReportEntry(formData);if(result.ok){form.reset();mutationId.current=null;setFileError("");setAdding(false);}return result; }, "Rapportregel toegevoegd"); };
  const openEntryAction = (entry: ReportEntryRow, mode: ReportEntryAction["mode"]) => { setEntryAction({ entry, mode }); setEditBody(entry.body); setEntryError(""); };
  const closeEntryAction = () => { if (!pending) { setEntryAction(null); setEntryError(""); } };
  const submitEntryEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entryAction || entryAction.mode !== "edit" || pending) return;
    const body = editBody.trim();
    if (!body) { setEntryError("Vul een rapporttekst in."); return; }
    if (body.length > 5000) { setEntryError("Gebruik maximaal 5.000 tekens."); return; }
    if (body === entryAction.entry.body.trim()) { setEntryError("Wijzig de rapporttekst voordat je opslaat."); return; }
    const entryId = entryAction.entry.id;
    setEntryError("");
    run(async () => {
      const result = await updateReportEntry({ entryId, version: entryAction.entry.version, body });
      if (result.ok) { setEntryAction(null); setEntryError(""); }
      else setEntryError(result.error);
      return result;
    }, "Rapportregel bijgewerkt");
  };
  const confirmEntryDelete = () => {
    if (!entryAction || entryAction.mode !== "delete" || pending) return;
    const entryId = entryAction.entry.id;
    setEntryError("");
    run(async () => {
      const result = await deleteReportEntry({ entryId, version: entryAction.entry.version });
      if (result.ok) { setEntryAction(null); setEntryError(""); }
      else setEntryError(result.error);
      return result;
    }, "Rapportregel verwijderd");
  };
  return <>
    <div className="report-heading"><div><span className="eyebrow">TIJDLIJN</span><h2>Werkrapport <span>{reports.length}</span></h2></div>{canEdit && <button type="button" disabled={pending} onClick={() => { if (!adding || window.confirm("Je rapportnotitie en geselecteerde bijlagen zijn nog niet opgeslagen. Wil je deze invoer verwerpen?")) { mutationId.current=null; setAdding(!adding); } }}><Plus/> {adding ? "Annuleren" : "Notitie"}</button>}</div>
    {adding && <form className="staff-report-form" onSubmit={submit}>
      <textarea name="body" required maxLength={5000} rows={5} placeholder="Beschrijf wat je hebt uitgevoerd…" onChange={invalidateMutation}/>
      <select name="severity" defaultValue="" onChange={invalidateMutation}><option value="">Normale notitie</option><option value="low">Incident · laag</option><option value="medium">Incident · middel</option><option value="high">Incident · hoog</option><option value="critical">Incident · kritiek</option></select>
      <label><Camera/> Bijlagen toevoegen · max. 5, elk 10 MB<input name="photos" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(event) => { invalidateMutation(); setFileError(attachmentError(event.currentTarget.files)); }}/></label>
      {fileError && <p role="alert">{fileError}</p>}
      <label><input type="checkbox" name="customerVisible" onChange={invalidateMutation}/> Deze notitie en bijlagen opnemen in het klantrapport</label>
      <p>Alleen klantgeschikte inhoud delen. Geen toegangscodes of interne personeelsgegevens.</p>
      <button className="primary-button" disabled={pending}>{pending ? "Opslaan…" : "Opslaan"}</button>
    </form>}
    <ol className="staff-report-list">{reports.map(entry => {
      const attachments=data.attachments.filter(item => item.report_entry_id===entry.id);
      return <li key={entry.id}><i/><article><header><strong>{entry.is_incident ? `Incident · ${entry.incident_severity}` : "Rapportnotitie"}</strong><small>{new Intl.DateTimeFormat("nl-NL",{dateStyle:"short",timeStyle:"short"}).format(new Date(entry.created_at))} · {entry.customer_visible?"Klantzichtbaar":"Intern"}</small></header><p>{entry.body}</p>
        {attachments.length>0 && <div className="report-photos">{attachments.map(a=><PrivateAttachment key={a.id} id={a.id} name={a.file_name} mime={a.mime_type}/>)}</div>}
        {canEdit && entry.owned_by_current_user === true && <div className="report-entry-actions"><button type="button" disabled={pending} onClick={()=>openEntryAction(entry,"edit")}><PenLine size={14}/> Bewerken</button><button type="button" disabled={pending} onClick={()=>openEntryAction(entry,"delete")}><Trash2 size={14}/> Verwijderen</button></div>}
      </article></li>;
    })}</ol>
    {!reports.length&&<div className="staff-empty"><FileText/><h2>Nog geen rapportregels</h2></div>}
    <Dialog open={entryAction !== null} onOpenChange={(next) => { if (!next) closeEntryAction(); }}><StaffDialogContent className="form-dialog staff-order-dialog" showCloseButton={false} onKeyDown={(event) => event.stopPropagation()}><DialogHeader><DialogTitle>{entryAction?.mode === "edit" ? "Rapportregel bewerken" : "Rapportregel verwijderen"}</DialogTitle><DialogDescription>{entryAction?.mode === "edit" ? "Werk de tekst bij. Bestaande bijlagen en zichtbaarheid blijven ongewijzigd." : "De rapportregel en gekoppelde bijlagen worden verwijderd uit de actieve werkbon."}</DialogDescription></DialogHeader>
      {entryAction?.mode === "edit" && <form className="form-grid" onSubmit={submitEntryEdit}><label className="field">Rapporttekst<textarea value={editBody} onChange={(event) => { setEditBody(event.target.value); setEntryError(""); }} required minLength={1} maxLength={5000} rows={7}/><small>{editBody.length.toLocaleString("nl-NL")} / 5.000 tekens</small></label>{entryError && <p className="auth-message error" role="alert">{entryError}</p>}<DialogFooter><button type="button" className="secondary-button" disabled={pending} onClick={closeEntryAction}>Annuleren</button><button className="primary-button" disabled={pending || !editBody.trim() || editBody.trim() === entryAction.entry.body.trim()}>{pending ? "Opslaan…" : "Wijzigingen opslaan"}</button></DialogFooter></form>}
      {entryAction?.mode === "delete" && <><div className="staff-dialog-scroll"><p style={{ whiteSpace: "pre-wrap" }}>{entryAction.entry.body}</p>{entryError && <p className="auth-message error" role="alert">{entryError}</p>}</div><DialogFooter><button type="button" className="secondary-button" disabled={pending} onClick={closeEntryAction}>Annuleren</button><button type="button" className="primary-button" disabled={pending} onClick={confirmEntryDelete}><Trash2 size={16}/>{pending ? "Verwijderen…" : "Definitief verwijderen"}</button></DialogFooter></>}
    </StaffDialogContent></Dialog>
  </>;
}

function ExtraWorkRequests({ order, tasks, editable, pending, run }: { order: Order; tasks: StaffWorkspaceData["workOrderTasks"]; editable: boolean; pending: boolean; run: (task: () => Promise<{ ok: boolean; error?: string }>, success: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const key = useRef<string | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const minutes = Number(values.get("minutes"));
    const amount = String(values.get("amount") ?? "").trim();
    const amountValue = amount === "" ? null : Number(amount);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480 || minutes % 5 !== 0 || (amountValue !== null && (!Number.isFinite(amountValue) || amountValue < 0 || amountValue > 100000))) {
      setError("Controleer de extra tijd en het optionele bedrag.");
      return;
    }
    key.current ??= crypto.randomUUID();
    run(async () => {
      const result = await requestStaffExtraWork({
        workOrderId: order.id,
        title: String(values.get("title") ?? "").trim(),
        reason: String(values.get("reason") ?? "").trim(),
        minutes,
        amountCents: amountValue === null ? null : Math.round(amountValue * 100),
        idempotencyKey: key.current!,
      });
      if (result.ok) { form.reset(); setOpen(false); setError(""); key.current = null; }
      else setError(result.error);
      return result;
    }, "Meerwerk ter goedkeuring toegevoegd");
  };
  return <section className="staff-panel"><div className="report-heading"><div><span className="eyebrow">GOEDKEURING</span><h2>Meerwerk</h2><p>Extra werkzaamheden staan apart ter beoordeling.</p></div>{editable && <button type="button" disabled={pending} onClick={() => setOpen(true)}><Plus/>Toevoegen</button>}</div>
    {tasks.map((task) => <article className="extra-work-summary" key={task.id}><div><strong>{task.task_name}</strong><small>{task.duration_minutes} minuten{task.staff_request_reason ? ` · ${task.staff_request_reason}` : ""}</small><span className="pill">{task.extra_work_status === "approved" ? "Goedgekeurd" : task.extra_work_status === "rejected" ? "Afgewezen" : "Ter goedkeuring"}</span></div><strong>{task.staff_requested_amount_cents === null ? "Nog te bepalen" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(task.staff_requested_amount_cents / 100)}</strong></article>)}
    {!tasks.length && <p className="muted-p">Geen meerwerk toegevoegd.</p>}
    <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) { setOpen(false); setError(""); key.current = null; } }}><StaffDialogContent className="form-dialog staff-order-dialog" showCloseButton={false} onKeyDown={(event) => event.stopPropagation()}><DialogHeader><DialogTitle>Meerwerk toevoegen</DialogTitle><DialogDescription>Leg extra werkzaamheden afzonderlijk vast. Een bedrag is een voorstel en wordt pas na bevoegde beoordeling commercieel geldig.</DialogDescription></DialogHeader><form className="form-grid" onSubmit={submit} onChange={() => { key.current = null; setError(""); }}><label className="field">Extra werkzaamheden<input name="title" required minLength={2} maxLength={200} placeholder="Bijvoorbeeld: extra glaspartij reinigen"/></label><label className="field">Toelichting voor goedkeuring<textarea name="reason" required minLength={3} maxLength={1000} rows={4} placeholder="Waarom is dit meerwerk nodig?"/></label><label className="field">Geschatte extra tijd (minuten)<input name="minutes" type="number" min={5} max={480} step={5} defaultValue={30} required/></label><label className="field">Bedrag meerwerk (€ excl. btw) <small>optioneel</small><input name="amount" type="number" min={0} max={100000} step="0.01" placeholder="Nog te bepalen"/></label>{error && <p className="auth-message error" role="alert">{error}</p>}<DialogFooter><button type="button" className="secondary-button" disabled={pending} onClick={() => setOpen(false)}>Annuleren</button><button className="primary-button" disabled={pending}>{pending ? "Toevoegen…" : "Ter goedkeuring toevoegen"}</button></DialogFooter></form></StaffDialogContent></Dialog>
  </section>;
}

function StaffReportDelivery({order,attachments,draftBlocked,onDraftChange}:{order:Order;attachments:Array<{id:string;file_name:string;mime_type:string}>;draftBlocked:boolean;onDraftChange?:(dirty:boolean)=>void}){
  const [data,setData]=useState<WorkOrderReport|null>(null),[error,setError]=useState(""),[summary,setSummary]=useState(""),[pending,startTransition]=useTransition();
  const key=useRef<string|null>(null);
  const load=async()=>{const r=await loadWorkOrderReport(order.id);if(r.ok)setData(r.data);else setError(r.error);};
  useEffect(()=>{let active=true;void loadWorkOrderReport(order.id).then(r=>{if(!active)return;if(r.ok)setData(r.data);else setError(r.error);});return()=>{active=false;};},[order.id,order.version]);
  const summaryDirty=summary.trim().length>0;
  useEffect(()=>{onDraftChange?.(summaryDirty);},[onDraftChange,summaryDirty]);
  useEffect(()=>()=>onDraftChange?.(false),[onDraftChange]);
  const current=data?.versions[0];
  const submitReport=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(draftBlocked){setError("Sla de open rapportnotitie eerst op of annuleer die invoer.");return;}key.current??=crypto.randomUUID();startTransition(async()=>{const r=await submitWorkOrderReport({orderId:order.id,version:data!.orderVersion,summary,idempotencyKey:key.current!});if(!r.ok)setError(r.error);else{key.current=null;setError("");setSummary("");await load();}});};
  return <section className="staff-panel"><WorkOrderExceptions orderId={order.id} attachments={attachments} allowCustomerAbsent={false}/><h2>Gezamenlijk opleverrapport</h2>{error&&<p role="alert">{error}</p>}
  {draftBlocked&&<p className="auth-message error" role="status">Er staat nog een niet-opgeslagen rapportnotitie open. Sla die op of annuleer haar vóór je een definitieve rapportversie maakt.</p>}
  {data&&<><p>{reportStateLabels[data.state]??data.state}</p><ChecklistPanel orderId={order.id} checklists={data.checklists} editable={data.canCapture&&(!current||["correction","superseded"].includes(current.state))} attachments={attachments}/>{data.canSubmit&&(!current||["correction","superseded"].includes(current.state))&&<form onSubmit={submitReport}><label>Klantzichtbare samenvatting<textarea required minLength={3} maxLength={5000} value={summary} onChange={e=>{setSummary(e.target.value);key.current=null;setError("");}}/></label><p>Controleer de taakresultaten en klantzichtbare bijlagen. Iedere medewerker stopt eerst zijn eigen inzet.</p><button className="primary-button" disabled={pending||draftBlocked}>Rapportversie vastleggen</button></form>}
  {current&&<><ReportDocument report={current}/>{current.state==="waiting_signature"&&<p>De inzet is gestopt. Laat de klant de exacte klantweergave hieronder controleren. Is de klant er niet, meld dat dan met reden voor opvolging.</p>}{data.canCapture&&["waiting_signature","review"].includes(current.state)&&<>{current.policy.mode!=="none"&&!current.signatures.some(s=>s.kind==="customer")&&<><SignatureSection key={`customer-${current.id}-${current.contentHash}`} order={order} report={current} kind="customer" onSaved={load}/>{current.state==="waiting_signature"&&<CustomerAbsentSection report={current} onSaved={load}/>}</>} {current.policy.employeeRequired&&!current.employeeVerified&&!current.signatures.some(s=>s.kind==="employee")&&<SignatureSection key={`employee-${current.id}-${current.contentHash}`} order={order} report={current} kind="employee" onSaved={load}/>}</>}</>}
  </>}
 </section>;
}

function SignatureSection({ order, report, kind, onSaved }: { order: Order; report:ReportVersion;kind:"customer"|"employee";onSaved:()=>Promise<void> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [name, setName] = useState("");
  const [capacity,setCapacity]=useState(kind==="employee"?"Uitvoerend medewerker":"");
  const [confirmed,setConfirmed]=useState(false),[error,setError]=useState(""),[pending,startTransition]=useTransition();
  const [preview,setPreview]=useState<ReportVersion|null>(kind==="employee"?report:null);
  const [previewLoading,setPreviewLoading]=useState(kind==="customer");
  const [previewNonce,setPreviewNonce]=useState(0);
  const idempotencyKey=useRef<string|null>(null);
  useEffect(()=>{
    if(kind==="employee")return;
    let active=true;
    void loadStaffSignaturePreview({reportId:report.id,contentHash:report.contentHash}).then(result=>{if(!active)return;if(result.ok)setPreview(result.data);else setError(result.error);setPreviewLoading(false);});
    return()=>{active=false;};
  },[kind,report.id,report.contentHash,previewNonce]);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const node = canvas.current!; const box = node.getBoundingClientRect(); return { x: (event.clientX - box.left) * node.width / box.width, y: (event.clientY - box.top) * node.height / box.height }; };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => { idempotencyKey.current=null;setDrawing(true); event.currentTarget.setPointerCapture(event.pointerId); const p = point(event); const ctx = canvas.current!.getContext("2d")!; ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing) return; const p = point(event); const ctx = canvas.current!.getContext("2d")!; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#102f4d"; ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const clear = () => {idempotencyKey.current=null;canvas.current?.getContext("2d")?.clearRect(0, 0, canvas.current.width, canvas.current.height);};
  if(!preview)return <section className="signature-section"><span className="eyebrow">OPDRACHTGEVER</span><h2>Exact klantdocument laden</h2><p>{previewLoading?"De onveranderlijke klantweergave wordt gecontroleerd…":"De klantweergave kon niet veilig worden geladen."}</p>{error&&<p role="alert">{error}</p>}{!previewLoading&&<button type="button" className="secondary-button" onClick={()=>{setPreviewLoading(true);setError("");setPreviewNonce(value=>value+1);}}>Opnieuw laden</button>}</section>;
  const signatureReport=preview;
  return <section className="signature-section"><span className="eyebrow">{kind==="customer"?"OPDRACHTGEVER":"MEDEWERKER"}</span><h2>Handtekening vastleggen</h2><p>{order.work_order_number} · {signatureReport.snapshot.object.name} · rapportversie {signatureReport.version}.</p>{kind==="customer"&&<><p>Dit is de exacte, onveranderlijke klantweergave die bij inhoudskenmerk <code>{signatureReport.contentHash}</code> hoort. Open ook de opgenomen bijlagen vóór ondertekening.</p><ReportDocument report={signatureReport} signaturePreview/></>}<label>Naam ondertekenaar<input value={name} onChange={e=>{setName(e.target.value);idempotencyKey.current=null;}} maxLength={120}/></label><label>Hoedanigheid / contactfunctie<input value={capacity} onChange={e=>{setCapacity(e.target.value);idempotencyKey.current=null;}} maxLength={120}/></label><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Ik heb deze exacte rapportversie en de opgenomen bijlagen gezien.</label><canvas aria-label="Teken uw handtekening" ref={canvas} width={900} height={320} style={{touchAction:"none",maxWidth:"100%"}} onPointerDown={start} onPointerMove={move} onPointerUp={() => setDrawing(false)} onPointerCancel={() => setDrawing(false)}/>{error&&<p role="alert">{error}</p>}<div><button type="button" className="secondary-button" disabled={pending} onClick={clear}><RotateCcw size={16}/> Wissen</button><button type="button" className="primary-button" disabled={pending||!confirmed||name.trim().length<2||capacity.trim().length<2} onClick={()=>{const dataUrl=canvas.current?.toDataURL("image/png");if(!dataUrl)return;idempotencyKey.current??=crypto.randomUUID();startTransition(async()=>{const r=await captureSignature({workOrderId:order.id,reportId:signatureReport.id,contentHash:signatureReport.contentHash,signerName:name,signerCapacity:capacity,dataUrl,kind,idempotencyKey:idempotencyKey.current!});if(!r.ok)setError(r.error);else{setError("");await onSaved();}});}}><PenLine size={16}/>{pending?"Vastleggen…":"Handtekening vastleggen"}</button></div></section>;
}

function CustomerAbsentSection({report,onSaved}:{report:ReportVersion;onSaved:()=>Promise<void>}){
  const [open,setOpen]=useState(false),[reason,setReason]=useState(""),[error,setError]=useState(""),[reported,setReported]=useState(false),[pending,startTransition]=useTransition();
  const key=useRef<string|null>(null);
  const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();key.current??=crypto.randomUUID();startTransition(async()=>{const result=await reportStaffCustomerAbsent({reportId:report.id,contentHash:report.contentHash,reason,idempotencyKey:key.current!});if(!result.ok){setError(result.error);return;}setError("");setOpen(false);setReported(true);await onSaved();});};
  return <section className="customer-absent-section"><h3>Klant niet aanwezig?</h3><p>De rapportversie blijft ongewijzigd en wacht op ondertekening. De planning krijgt een rapportgebonden opvolgmelding.</p>{reported?<p className="auth-message" role="status">Afwezigheid gemeld voor rapportversie {report.version}.</p>:<button type="button" className="secondary-button" onClick={()=>setOpen(true)}>Klant niet aanwezig melden</button>}
    <Dialog open={open} onOpenChange={(next)=>{if(!next&&!pending){setOpen(false);setError("");}}}><StaffDialogContent className="form-dialog staff-order-dialog" showCloseButton={false} onKeyDown={(event)=>event.stopPropagation()}><DialogHeader><DialogTitle>Klant niet aanwezig</DialogTitle><DialogDescription>Leg concreet vast waarom ondertekening nu niet mogelijk is. Rapportversie {report.version} blijft in de wachtstand.</DialogDescription></DialogHeader><form className="form-grid" onSubmit={submit}><label className="field">Reden<textarea required minLength={3} maxLength={1000} rows={5} value={reason} onChange={(event)=>{setReason(event.target.value);setError("");key.current=null;}} placeholder="Bijvoorbeeld: contactpersoon was niet aanwezig op locatie."/></label>{error&&<p className="auth-message error" role="alert">{error}</p>}<DialogFooter><button type="button" className="secondary-button" disabled={pending} onClick={()=>setOpen(false)}>Annuleren</button><button className="primary-button" disabled={pending||reason.trim().length<3}>{pending?"Melden…":"Afwezigheid melden"}</button></DialogFooter></form></StaffDialogContent></Dialog>
  </section>;
}

function News({ data, onRead }: { data: StaffWorkspaceData; onRead: (id: string) => void }) { return <><section className="staff-intro"><span className="eyebrow">TEAM</span><h1>Nieuws</h1><p>Berichten van je organisatie</p></section><div className="staff-card-list">{data.announcements.filter((item) => item.published_at && !item.withdrawn_at).map((item) => { const read = data.announcementReads.some((entry) => entry.announcement_id === item.id); return <article className={`staff-news ${read ? "read" : ""}`} key={item.id}><span><Megaphone/><small>{new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(item.published_at!))}</small>{!read && <i/>}</span><h2>{item.title}</h2><p>{item.body}</p>{!read && <button onClick={() => onRead(item.id)}><Check/> Markeer als gelezen</button>}</article>; })}</div></>; }

function Hours({ data, personnelId, timezone, onCorrect }: { data: StaffWorkspaceData; personnelId: string; timezone: string; onCorrect: (id: string, duration: number, reason: string, version: number) => void }) { const entries = data.timeEntries.filter((item) => item.personnel_id === personnelId); return <><section className="staff-intro"><span className="eyebrow">REGISTRATIE</span><h1>Mijn uren</h1><p>Geregistreerd op basis van serverstatussen</p></section><div className="staff-card-list">{entries.map((entry) => { const requests=data.staffTimeCorrectionRequests.filter(item=>item.time_entry_id===entry.id).sort((left,right)=>Date.parse(right.created_at)-Date.parse(left.created_at));const request=requests.find(item=>item.status==="pending");const latest=requests[0];return <article className="hour-card" key={entry.id}><span><Clock3/><strong>{day(entry.starts_at, timezone)}</strong></span><h2>{time(entry.starts_at, timezone)}–{entry.ends_at ? time(entry.ends_at, timezone) : "loopt"}</h2><p>{entry.kind} · {entry.status}</p>{request?<p id={`time-correction-${request.id}`}>Correctie in behandeling · gewenst {request.requested_duration_minutes} minuten</p>:latest&&latest.status!=="withdrawn"?<p id={`time-correction-${latest.id}`}>{latest.status==="approved"?"Correctie goedgekeurd":"Correctie afgewezen"}{latest.review_note?` · ${latest.review_note}`:""}</p>:null}{entry.ends_at&&!request&&entry.status!=="correction_requested"&&<button onClick={() => { const current=Math.max(1,Math.round((Date.parse(entry.ends_at!)-Date.parse(entry.starts_at))/60000));const raw=window.prompt("Wat is de correcte duur in minuten?",String(current));const duration=raw?Number(raw):NaN;if(!Number.isInteger(duration)||duration<1||duration>600||duration===current)return;const reason=window.prompt("Waarom moet deze registratie worden gecorrigeerd?");if(reason?.trim())onCorrect(entry.id,duration,reason,entry.version); }}>Correctie aanvragen</button>}</article>;})}</div>{!entries.length && <div className="staff-empty"><Clock3/><h2>Nog geen uren</h2><p>Uren ontstaan automatisch wanneer je een werkbon start.</p></div>}</>; }

function More({ data, personnel, timezone, onInterest }: { data: StaffWorkspaceData; personnel: StaffWorkspaceData["personnel"][number]; timezone: string; onInterest: (id: string, interested: boolean) => void }) { return <><section className="staff-intro profile-intro"><span className="staff-profile-avatar">{initials(personnel.full_name)}</span><div><span className="eyebrow">PROFIEL</span><h1>{personnel.full_name}</h1><p>{personnel.employee_number}</p></div></section><section className="staff-panel"><NotificationNavigation workspace="staff" actorKey={personnel.id}/><NotificationPushControl workspace="staff"/></section><TicketNavigation workspace="staff" actorKey={personnel.id} card/><section className="staff-panel"><h2>Open diensten</h2>{data.openShifts.filter((item) => item.status === "open").map((shift) => { const interest = data.shiftInterests.find((item) => item.open_shift_id === shift.id && item.personnel_id === personnel.id); return <div className="open-shift" key={shift.id}><CalendarDays/><span><strong>{day(shift.starts_at, timezone)}</strong><small>{time(shift.starts_at, timezone)}–{time(shift.ends_at, timezone)}</small></span><button onClick={() => onInterest(shift.id, interest?.status !== "interested")}>{interest?.status === "interested" ? "Intrekken" : "Interesse"}</button></div>; })}{!data.openShifts.some((item) => item.status === "open") && <p className="muted-p">Er zijn geen open diensten.</p>}</section><section className="staff-panel"><h2>Mijn documenten</h2>{data.personnelDocuments.filter((item) => item.personnel_id === personnel.id && item.visible_to_employee).map((item) => <a className="document-row" href={`/api/files/personnel-document/${item.id}`} target="_blank" rel="noreferrer" key={item.id}><FileText/><span><strong>{item.title}</strong><small>{item.file_name ?? `Versie ${item.version}`}</small></span><ShieldCheck/></a>)}{!data.personnelDocuments.some((item) => item.personnel_id === personnel.id && item.visible_to_employee) && <p className="muted-p">Geen zichtbare documenten.</p>}</section><form method="post" action="/auth/signout"><button className="secondary-button full">Uitloggen</button></form></>; }
