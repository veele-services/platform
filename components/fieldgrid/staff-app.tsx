"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Bell, CalendarDays, Camera, Check, CheckCircle2,
  ChevronRight, Clock3, FileText, MapPin, Megaphone, MoreHorizontal,
  Navigation, PenLine, Play, Plus, RotateCcw, Send, ShieldCheck, UserRound, X,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import type { AuthContext } from "@/lib/auth/context";
import type { WorkspaceData } from "@/lib/data/workspace";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { FieldgridBrand } from "@/components/fieldgrid/brand";
import { brandThemeStyle } from "@/lib/branding/palette";
import { clientEnv } from "@/lib/env/client";
import {
  addExtraWork, addReportEntry, captureSignature, markAnnouncementRead, requestTimeCorrection,
  setTaskCompletion, toggleShiftInterest, transitionWorkOrder, updateReportEntry, deleteReportEntry,
} from "@/app/staff/actions";

type Order = Database["public"]["Tables"]["work_orders"]["Row"];
type Tab = "planning" | "nieuws" | "uren" | "meer";
const statusLabel: Record<string, string> = { released: "Klaar om te openen", seen: "Gezien", travelling: "Onderweg", in_progress: "Bezig", completed: "Ingediend", returned: "Teruggestuurd", correction_required: "Correctie gevraagd", approved: "Goedgekeurd", invoice_ready: "Goedgekeurd" };
const time = (value: string, timezone: string) => new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(value));
const day = (value: string, timezone: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: timezone }).format(new Date(value));
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const address = (value: unknown) => { const item = (value ?? {}) as Record<string, unknown>; return [item.street, item.postal_code, item.city].filter(Boolean).join(", "); };

export function StaffApp({ context, data, personnel }: { context: AuthContext & { tenant: NonNullable<AuthContext["tenant"]> }; data: WorkspaceData; personnel: WorkspaceData["personnel"][number] | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("planning");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tenant = context.tenant;
  const selected = data.workOrders.find((item) => item.id === selectedId) ?? null;
  const assignments = useMemo(() => personnel ? data.assignments.filter((item) => item.personnel_id === personnel.id) : [], [data.assignments, personnel]);
  const assignedIds = useMemo(() => new Set(assignments.map((item) => item.work_order_id)), [assignments]);
  const orders = data.workOrders.filter((item) => assignedIds.has(item.id)).sort((a, b) => new Date(b.projected_start_at).getTime() - new Date(a.projected_start_at).getTime());

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const supabase = createClient();
    const channel = supabase.channel(`staff-${tenant.id}`).on("postgres_changes", { event: "*", schema: "public", table: "work_orders", filter: `tenant_id=eq.${tenant.id}` }, () => router.refresh()).on("postgres_changes", { event: "*", schema: "public", table: "announcements", filter: `tenant_id=eq.${tenant.id}` }, () => router.refresh()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [router, tenant.id]);

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
    if (order.status === "released") run(() => transitionWorkOrder({ workOrderId: order.id, action: "open", version: order.version, idempotencyKey: `open-${order.id}-${order.version}` }), "Werkbon geopend");
  };

  if (!personnel) return <main className="staff-blocked"><span className="product-brand">Fieldgrid</span><UserRound size={36}/><h1>Personeelsprofiel ontbreekt</h1><p>Je account heeft een personeelsrol, maar is nog niet aan een personeelskaart gekoppeld. Vraag de tenantbeheerder dit te herstellen.</p><form method="post" action="/auth/signout"><button className="secondary-button">Uitloggen</button></form></main>;

  return <div className="staff-app" style={brandThemeStyle(tenant.primaryColor, tenant.accentColor)}>
    <header className="staff-header"><FieldgridBrand tenantName={tenant.name} logoUrl={data.brandingLogoUrl}/><button className="staff-avatar" onClick={() => setTab("meer")}>{initials(personnel.full_name)}</button></header>
    <main className="staff-content">
      {tab === "planning" && <Schedule orders={orders} data={data} timezone={tenant.timezone} onOpen={openOrder}/>}
      {tab === "nieuws" && <News data={data} userId={context.user.id} onRead={(id) => run(() => markAnnouncementRead(id), "Gemarkeerd als gelezen")}/>}
      {tab === "uren" && <Hours data={data} personnelId={personnel.id} timezone={tenant.timezone} onCorrect={(id, reason) => run(() => requestTimeCorrection({ timeEntryId: id, reason }), "Correctieverzoek verstuurd")}/>}
      {tab === "meer" && <More data={data} personnel={personnel} timezone={tenant.timezone} onInterest={(shiftId, interested) => run(() => toggleShiftInterest({ shiftId, personnelId: personnel.id, interested }), interested ? "Interesse doorgegeven" : "Interesse ingetrokken")}/>}
    </main>
    <nav className="staff-bottom-nav">{([{ id: "planning", label: "Planning", icon: CalendarDays }, { id: "nieuws", label: "Nieuws", icon: Megaphone }, { id: "uren", label: "Uren", icon: Clock3 }, { id: "meer", label: "Meer", icon: MoreHorizontal }] as const).map((item) => <button className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)}><item.icon size={20}/><span>{item.label}</span>{item.id === "nieuws" && data.announcements.some((announcement) => !data.announcementReads.some((read) => read.announcement_id === announcement.id && read.user_id === context.user.id)) && <i/>}</button>)}</nav>
    {selected && <OrderSheet order={selected} data={data} userId={context.user.id} timezone={tenant.timezone} pending={pending} close={() => setSelectedId(null)} run={run}/>}<Toaster richColors position="top-center"/>
  </div>;
}

function Schedule({ orders, data, timezone, onOpen }: { orders: Order[]; data: WorkspaceData; timezone: string; onOpen: (order: Order) => void }) {
  const objects = new Map(data.objects.map((item) => [item.id, item]));
  const customers = new Map(data.customers.map((item) => [item.id, item]));
  const grouped = orders.reduce<Map<string, Order[]>>((map, item) => { const key = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeZone: timezone }).format(new Date(item.projected_start_at)); map.set(key, [...(map.get(key) ?? []), item]); return map; }, new Map());
  return <><section className="staff-intro"><span className="eyebrow">MIJN WERK</span><h1>Planning</h1><p>{orders.length} toegewezen werkbonnen</p></section>{orders.length ? Array.from(grouped.entries()).map(([key, items]) => <section className="schedule-day" key={key}><h2>{day(items[0].projected_start_at, timezone)}</h2>{items.map((order) => <button className="schedule-card" key={order.id} onClick={() => onOpen(order)}><span className="schedule-time"><strong>{time(order.projected_start_at, timezone)}</strong><small>{time(order.projected_end_at, timezone)}</small></span><span className="schedule-line"/><span className="schedule-copy"><small>{order.work_order_number} · {order.discipline}</small><strong>{objects.get(order.object_id)?.name}</strong><span>{customers.get(order.customer_id)?.name} · {address(objects.get(order.object_id)?.address)}</span><em>{statusLabel[order.status] ?? order.status}</em></span><ChevronRight size={18}/></button>)}</section>) : <div className="staff-empty"><CalendarDays size={35}/><h2>Geen werkbonnen</h2><p>Nieuwe vrijgegeven opdrachten verschijnen hier automatisch.</p></div>}</>;
}

function OrderSheet({ order, data, userId, timezone, pending, close, run }: { order: Order; data: WorkspaceData; userId: string; timezone: string; pending: boolean; close: () => void; run: (task: () => Promise<{ ok: boolean; error?: string }>, success: string) => void }) {
  const [section, setSection] = useState<"overzicht" | "taken" | "tijd" | "rapport">("overzicht");
  const object = data.objects.find((item) => item.id === order.object_id);
  const customer = data.customers.find((item) => item.id === order.customer_id);
  const tasks = data.workOrderTasks.filter((item) => item.work_order_id === order.id);
  const reports = data.reports.filter((item) => item.work_order_id === order.id);
  const assignment = data.assignments.find((item) => item.work_order_id === order.id);
  const next = order.status === "released" ? { action: "open" as const, label: "Open werkbon", icon: FileText } : order.status === "seen" ? { action: "travel" as const, label: "Vertrek", icon: Navigation } : order.status === "travelling" ? { action: "start" as const, label: "Start werk", icon: Play } : order.status === "in_progress" || order.status === "correction_required" ? { action: order.status === "in_progress" ? "complete" as const : "resubmit" as const, label: order.status === "in_progress" ? "Dien in" : "Opnieuw indienen", icon: Send } : null;
  const transition = () => next && run(() => transitionWorkOrder({ workOrderId: order.id, action: next.action, version: order.version, idempotencyKey: `${next.action}-${order.id}-${order.version}` }), ["complete", "resubmit"].includes(next.action) ? "Werkbon ingediend" : "Status bijgewerkt");
  const allowed = data.allowedExtraWork.filter((item) => item.work_order_id === order.id).flatMap((item) => { const rule = data.extraWorkRules.find((candidate) => candidate.id === item.extra_work_rule_id); const revision = rule ? data.taskRevisions.find((candidate) => candidate.id === rule.task_revision_id) : null; const task = revision ? data.tasks.find((candidate) => candidate.id === revision.task_id) : null; return rule && revision && task ? [{ rule, revision, task }] : []; });
  const returnOrder = () => { const reason = window.prompt("Waarom meld je deze werkbon terug?"); if (reason?.trim()) run(() => transitionWorkOrder({ workOrderId: order.id, action: "return", version: order.version, reason: reason.trim(), note: reason.trim(), idempotencyKey: `return-${order.id}-${order.version}` }), "Werkbon teruggemeld"); };
  const canReturn = ["seen", "travelling", "in_progress", "correction_required"].includes(order.status);
  return <section className="order-sheet"><header><button onClick={close} aria-label="Sluiten"><ArrowLeft size={21}/></button><span><small>Werkbon · {order.work_order_number}</small><strong>{object?.name}</strong></span><button onClick={canReturn ? returnOrder : close} aria-label={canReturn ? "Werkbon terugmelden" : "Sluiten"} title={canReturn ? "Werkbon terugmelden" : "Sluiten"}><X size={21}/></button></header><div className="order-tabs"><button className={section === "overzicht" ? "active" : ""} onClick={() => setSection("overzicht")}>Overzicht</button><button className={section === "taken" ? "active" : ""} onClick={() => setSection("taken")}>Taken</button><button className={section === "tijd" ? "active" : ""} onClick={() => setSection("tijd")}>Tijd</button><button className={section === "rapport" ? "active" : ""} onClick={() => setSection("rapport")}>Rapport</button></div><div className="order-body">
    {section === "overzicht" && <><div className="order-hero"><span className="pill pill-teal">{statusLabel[order.status] ?? order.status}</span><h1>{customer?.name}</h1><p>{order.discipline}</p></div><div className="order-facts"><div><Clock3/><span><small>Gepland</small><strong>{time(order.projected_start_at, timezone)}–{time(order.projected_end_at, timezone)}</strong></span></div><div><MapPin/><span><small>Adres</small><strong>{address(object?.address)}</strong></span></div></div></>}
    {section === "taken" && <><section className="staff-panel"><h2>Checklist</h2>{tasks.map((task) => <label className={`task-check ${task.completed_at ? "done" : ""}`} key={task.id}><input type="checkbox" checked={Boolean(task.completed_at)} disabled={pending || order.status !== "in_progress"} onChange={(event) => run(() => setTaskCompletion({ taskId: task.id, completed: event.target.checked }), "Checklist bijgewerkt")}/><span><strong>{task.task_name}</strong><small>{task.duration_minutes} min{task.is_extra_work ? " · meerwerk" : ""}</small></span><CheckCircle2/></label>)}</section>{order.status === "in_progress" && allowed.length > 0 && <section className="staff-panel"><h2>Toegestaan meerwerk</h2>{allowed.map(({ rule, revision, task }) => <button className="extra-work-button" key={rule.id} onClick={() => run(() => addExtraWork({ workOrderId: order.id, ruleId: rule.id, idempotencyKey: `extra-${order.id}-${rule.id}-${crypto.randomUUID()}` }), "Meerwerk toegevoegd")}><Plus/><span><strong>{task.name}</strong><small>{revision.duration_minutes} min</small></span></button>)}</section>}</>}
    {section === "tijd" && <section className="staff-panel"><h2>Werk en reis</h2>{data.timeEntries.filter((entry) => entry.assignment_id === assignment?.id).map((entry) => <div className="time-detail" key={entry.id}><Clock3/><span><strong>{entry.kind}</strong><small>{time(entry.starts_at, timezone)}–{entry.ends_at ? time(entry.ends_at, timezone) : "loopt"} · {entry.status}</small></span></div>)}{data.travelLegs.filter((leg) => leg.assignment_id === assignment?.id).map((leg) => <div className="time-detail" key={leg.id}><Navigation/><span><strong>{leg.direction === "before" ? "Heenreis" : "Terugreis"}</strong><small>{leg.estimated_minutes ? `${leg.estimated_minutes} min · ${leg.travel_mode}` : "Reistijd onbekend"}</small></span></div>)}{!data.timeEntries.some((entry) => entry.assignment_id === assignment?.id) && !data.travelLegs.some((leg) => leg.assignment_id === assignment?.id) && <p className="muted-p">Nog geen tijdregistratie of reisberekening.</p>}</section>}
    {section === "rapport" && <><ReportSection order={order} reports={reports} data={data} userId={userId} run={run}/>{order.signature_required && !data.signatures.some((item) => item.work_order_id === order.id && item.report_version === order.report_version) && ["seen", "travelling", "in_progress", "correction_required"].includes(order.status) && <SignatureSection order={order} run={run}/>} {data.signatures.some((item) => item.work_order_id === order.id && item.report_version === order.report_version) && <p className="signature-confirmed"><ShieldCheck size={17}/> Rapportversie ondertekend</p>}</>}
  </div>{next && <footer className="order-action"><button className="primary-button" disabled={pending} onClick={transition}><next.icon size={18}/>{pending ? "Bezig…" : next.label}</button></footer>}</section>;
}

function PrivateAttachment({ id, name }: { id: string; name: string }) {
  return <a className="report-photo" href={`/api/files/attachment/${id}`} target="_blank" rel="noreferrer">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/api/files/attachment/${id}`} alt={name}/>
  </a>;
}

function ReportSection({ order, reports, data, userId, run }: { order: Order; reports: WorkspaceData["reports"]; data: WorkspaceData; userId: string; run: (task: () => Promise<{ ok: boolean; error?: string }>, success: string) => void }) {
  const [adding, setAdding] = useState(false);
  const canEdit = ["seen", "travelling", "in_progress", "correction_required"].includes(order.status);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const formData = new FormData(form); formData.set("workOrderId", order.id); run(() => addReportEntry(formData), "Rapportregel toegevoegd"); form.reset(); setAdding(false); };
  return <><div className="report-heading"><div><span className="eyebrow">TIJDLIJN</span><h2>Werkrapport <span>{reports.length}</span></h2></div>{canEdit && <button onClick={() => setAdding((value) => !value)}><Plus/> Notitie</button>}</div>{adding && <form className="staff-report-form" onSubmit={submit}><textarea name="body" required rows={5} placeholder="Beschrijf wat je hebt uitgevoerd…"/><select name="severity" defaultValue=""><option value="">Normale notitie</option><option value="low">Incident · laag</option><option value="medium">Incident · middel</option><option value="high">Incident · hoog</option><option value="critical">Incident · kritiek</option></select><label><Camera/> Foto’s toevoegen<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple/></label><button className="primary-button">Opslaan</button></form>}<ol className="staff-report-list">{reports.map((entry) => { const attachments = data.attachments.filter((item) => item.report_entry_id === entry.id); return <li key={entry.id}><i/><article><header><strong>{entry.is_incident ? `Incident · ${entry.incident_severity}` : "Rapportnotitie"}</strong><small>{new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.created_at))}</small></header><p>{entry.body}</p>{attachments.length > 0 && <div className="report-photos">{attachments.map((attachment) => <PrivateAttachment key={attachment.id} id={attachment.id} name={attachment.file_name}/>)}</div>}{canEdit && entry.author_user_id === userId && <div className="report-entry-actions"><button onClick={() => { const body = window.prompt("Bewerk rapportregel", entry.body); if (body && body !== entry.body) run(() => updateReportEntry({ entryId: entry.id, body }), "Rapportregel bijgewerkt"); }}><PenLine size={14}/> Bewerken</button><button onClick={() => { if (window.confirm("Rapportregel verwijderen?")) run(() => deleteReportEntry(entry.id), "Rapportregel verwijderd"); }}><X size={14}/> Verwijderen</button></div>}</article></li>; })}</ol>{!reports.length && <div className="staff-empty"><FileText/><h2>Nog geen rapportregels</h2></div>}</>;
}

function SignatureSection({ order, run }: { order: Order; run: (task: () => Promise<{ ok: boolean; error?: string }>, success: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [name, setName] = useState("");
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const node = canvas.current!; const box = node.getBoundingClientRect(); return { x: (event.clientX - box.left) * node.width / box.width, y: (event.clientY - box.top) * node.height / box.height }; };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => { setDrawing(true); event.currentTarget.setPointerCapture(event.pointerId); const p = point(event); const ctx = canvas.current!.getContext("2d")!; ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing) return; const p = point(event); const ctx = canvas.current!.getContext("2d")!; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#102f4d"; ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const clear = () => canvas.current?.getContext("2d")?.clearRect(0, 0, canvas.current.width, canvas.current.height);
  return <section className="signature-section"><span className="eyebrow">OPDRACHTGEVER</span><h2>Handtekening vastleggen</h2><p>Laat de opdrachtgever naam en handtekening plaatsen voor rapportversie {order.report_version}.</p><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Naam ondertekenaar"/><canvas ref={canvas} width={900} height={320} onPointerDown={start} onPointerMove={move} onPointerUp={() => setDrawing(false)} onPointerCancel={() => setDrawing(false)}/><div><button className="secondary-button" onClick={clear}><RotateCcw size={16}/> Wissen</button><button className="primary-button" disabled={name.trim().length < 2} onClick={() => { const dataUrl = canvas.current?.toDataURL("image/png"); if (dataUrl) run(() => captureSignature({ workOrderId: order.id, signerName: name, dataUrl, reportVersion: order.report_version }), "Handtekening opgeslagen"); }}><PenLine size={16}/> Opslaan</button></div></section>;
}

function News({ data, userId, onRead }: { data: WorkspaceData; userId: string; onRead: (id: string) => void }) { return <><section className="staff-intro"><span className="eyebrow">TEAM</span><h1>Nieuws</h1><p>Berichten van je organisatie</p></section><div className="staff-card-list">{data.announcements.filter((item) => item.published_at && !item.withdrawn_at).map((item) => { const read = data.announcementReads.some((entry) => entry.announcement_id === item.id && entry.user_id === userId); return <article className={`staff-news ${read ? "read" : ""}`} key={item.id}><span><Megaphone/><small>{new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(item.published_at!))}</small>{!read && <i/>}</span><h2>{item.title}</h2><p>{item.body}</p>{!read && <button onClick={() => onRead(item.id)}><Check/> Markeer als gelezen</button>}</article>; })}</div></>; }

function Hours({ data, personnelId, timezone, onCorrect }: { data: WorkspaceData; personnelId: string; timezone: string; onCorrect: (id: string, reason: string) => void }) { const entries = data.timeEntries.filter((item) => item.personnel_id === personnelId); return <><section className="staff-intro"><span className="eyebrow">REGISTRATIE</span><h1>Mijn uren</h1><p>Geregistreerd op basis van serverstatussen</p></section><div className="staff-card-list">{entries.map((entry) => <article className="hour-card" key={entry.id}><span><Clock3/><strong>{day(entry.starts_at, timezone)}</strong></span><h2>{time(entry.starts_at, timezone)}–{entry.ends_at ? time(entry.ends_at, timezone) : "loopt"}</h2><p>{entry.kind} · {entry.status}</p>{entry.status !== "correction_requested" && <button onClick={() => { const reason = window.prompt("Wat moet er worden gecorrigeerd?"); if (reason) onCorrect(entry.id, reason); }}>Correctie aanvragen</button>}</article>)}</div>{!entries.length && <div className="staff-empty"><Clock3/><h2>Nog geen uren</h2><p>Uren ontstaan automatisch wanneer je een werkbon start.</p></div>}</>; }

function More({ data, personnel, timezone, onInterest }: { data: WorkspaceData; personnel: WorkspaceData["personnel"][number]; timezone: string; onInterest: (id: string, interested: boolean) => void }) { return <><section className="staff-intro profile-intro"><span className="staff-profile-avatar">{initials(personnel.full_name)}</span><div><span className="eyebrow">PROFIEL</span><h1>{personnel.full_name}</h1><p>{personnel.employee_number}</p></div></section><PushControl/><section className="staff-panel"><h2>Open diensten</h2>{data.openShifts.filter((item) => item.status === "open").map((shift) => { const interest = data.shiftInterests.find((item) => item.open_shift_id === shift.id && item.personnel_id === personnel.id); return <div className="open-shift" key={shift.id}><CalendarDays/><span><strong>{day(shift.starts_at, timezone)}</strong><small>{time(shift.starts_at, timezone)}–{time(shift.ends_at, timezone)}</small></span><button onClick={() => onInterest(shift.id, interest?.status !== "interested")}>{interest?.status === "interested" ? "Intrekken" : "Interesse"}</button></div>; })}{!data.openShifts.some((item) => item.status === "open") && <p className="muted-p">Er zijn geen open diensten.</p>}</section><section className="staff-panel"><h2>Mijn documenten</h2>{data.personnelDocuments.filter((item) => item.personnel_id === personnel.id && item.visible_to_employee).map((item) => <a className="document-row" href={`/api/files/personnel-document/${item.id}`} target="_blank" rel="noreferrer" key={item.id}><FileText/><span><strong>{item.title}</strong><small>{item.file_name ?? `Versie ${item.version}`}</small></span><ShieldCheck/></a>)}{!data.personnelDocuments.some((item) => item.personnel_id === personnel.id && item.visible_to_employee) && <p className="muted-p">Geen zichtbare documenten.</p>}</section><form method="post" action="/auth/signout"><button className="secondary-button full">Uitloggen</button></form></>; }

function base64UrlBytes(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function PushControl() {
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
  const enabled = supported && Notification.permission === "granted";
  const subscribe = async () => {
    try {
      setBusy(true);
      if (!clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY) throw new Error("Push is nog niet geconfigureerd voor deze omgeving");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notificatietoestemming is niet verleend");
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlBytes(clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY) });
      const response = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      if (!response.ok) throw new Error((await response.json()).error ?? "Pushabonnement mislukt");
      toast.success("Pushmeldingen zijn ingeschakeld");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Pushabonnement mislukt"); }
    finally { setBusy(false); }
  };
  return <button className="push-control" onClick={subscribe} disabled={!supported || busy}><Bell/><span><strong>{enabled ? "Pushmeldingen actief" : "Pushmeldingen inschakelen"}</strong><small>{supported ? "Nieuwe bonnen en correcties" : "Niet ondersteund door deze browser"}</small></span><ChevronRight/></button>;
}
