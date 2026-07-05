import Link from "next/link";
import {
  AlertTriangle,
  Clock3,
  LifeBuoy,
  MessageSquareText,
  ShieldAlert,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import {
  createPlatformTicket,
  listPlatformTickets,
  updatePlatformTicket,
  type PlatformTicketDashboard,
  type PlatformTicketLinkOption,
  type PlatformTicketRow,
} from "@/app/actions/platform-tickets";

export const metadata = {
  title: "Tickets",
};

const TYPE_LABELS: Record<string, string> = {
  support: "Support",
  incident: "Incident",
  onboarding: "Onboarding",
  billing: "Billing",
  domain: "Domein",
  security: "Security",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In behandeling",
  waiting_customer: "Wacht op klant",
  waiting_internal: "Wacht op intern",
  resolved: "Opgelost",
  closed: "Gesloten",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Laag",
  normal: "Normaal",
  high: "Hoog",
  urgent: "Urgent",
};

async function createTicketFormAction(formData: FormData): Promise<void> {
  "use server";
  await createPlatformTicket(formData);
}

async function updateTicketFormAction(formData: FormData): Promise<void> {
  "use server";
  await updatePlatformTicket(formData);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function dateTimeLocalValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function statusChipClass(status: string): string {
  if (status === "resolved" || status === "closed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "waiting_customer" || status === "waiting_internal") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "in_progress") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function priorityChipClass(priority: string, overdue = false): string {
  if (overdue || priority === "urgent") return "border-rose-200 bg-rose-50 text-rose-700";
  if (priority === "high") return "border-orange-200 bg-orange-50 text-orange-700";
  if (priority === "low") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-indigo-200 bg-indigo-50 text-indigo-700";
}

function Stat({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: "default" | "warning" | "danger" | "good";
}) {
  const toneClass =
    tone === "danger"
      ? "text-rose-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "good"
          ? "text-emerald-600"
          : "text-slate-500";

  return (
    <div className="rounded border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">{value}</p>
    </div>
  );
}

function LinkSelect({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: PlatformTicketLinkOption[];
  defaultValue?: string | null;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <select name={name} defaultValue={defaultValue ?? "__none"} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
        <option value="__none">Geen koppeling</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label} ({option.helper})
          </option>
        ))}
      </select>
    </label>
  );
}

function CreateTicketForm({ dashboard }: { dashboard: PlatformTicketDashboard }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-normal text-slate-950">Nieuw platformticket</h2>
        <p className="mt-1 text-sm text-slate-500">Maak support-, incident-, onboarding-, billing-, domein- of securitytickets met interne opvolging.</p>
      </div>

      <form action={createTicketFormAction} className="grid gap-3">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_180px]">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Titel
            <input name="title" required minLength={3} maxLength={220} className="h-10 rounded border border-slate-300 px-3 text-sm" placeholder="Korte omschrijving" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Type
            <select name="type" defaultValue="support" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Prioriteit
            <select name="priority" defaultValue="normal" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            SLA
            <input name="slaDueAt" type="datetime-local" className="h-10 rounded border border-slate-300 px-3 text-sm" />
          </label>
        </div>

        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Interne omschrijving
          <textarea name="description" rows={3} maxLength={5000} className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Context, impact, vervolgstap of klantvraag" />
        </label>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Tenant
            <select name="tenantId" defaultValue="__none" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
              <option value="__none">Platform-only</option>
              {dashboard.tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.slug})
                </option>
              ))}
            </select>
          </label>
          <LinkSelect name="subscriptionId" label="Subscription" options={dashboard.subscriptions} />
          <LinkSelect name="domainId" label="Domein" options={dashboard.domains} />
          <LinkSelect name="supportGrantId" label="Support grant" options={dashboard.supportGrants} />
          <LinkSelect name="auditLogId" label="Audit event" options={dashboard.auditEvents} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Smoke run ID
            <input name="smokeRunId" className="h-10 rounded border border-slate-300 px-3 text-sm" placeholder="dashboard-snapshot / run-id" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Toegewezen aan
            <select name="assigneePlatformUserId" defaultValue="__none" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
              <option value="__none">Niet toegewezen</option>
              {dashboard.platformUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.role} - {user.userId}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="h-10 rounded bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
            Ticket aanmaken
          </button>
        </div>
      </form>
    </section>
  );
}

function TicketCard({
  ticket,
  dashboard,
}: {
  ticket: PlatformTicketRow;
  dashboard: PlatformTicketDashboard;
}) {
  return (
    <article className="rounded border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded border px-2 py-1 text-xs font-medium ${statusChipClass(ticket.status)}`}>
              {STATUS_LABELS[ticket.status] ?? ticket.status}
            </span>
            <span className={`rounded border px-2 py-1 text-xs font-medium ${priorityChipClass(ticket.priority, ticket.isOverdue)}`}>
              {ticket.isOverdue ? "SLA verlopen" : PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
              {TYPE_LABELS[ticket.type] ?? ticket.type}
            </span>
          </div>
          <Link href={`/platform/tickets/${ticket.id}`} className="mt-2 block break-words text-lg font-semibold text-slate-950 underline-offset-2 hover:underline">
            {ticket.title}
          </Link>
          <p className="mt-1 text-sm text-slate-500">
            Laatste activiteit {formatDate(ticket.lastActivityAt)} - aangemaakt {formatDate(ticket.createdAt)}
          </p>
        </div>
        <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 lg:min-w-[430px]">
          <div className="rounded bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase text-slate-500">Tenant</p>
            {ticket.tenantId ? (
              <Link href={`/platform/tenants/${ticket.tenantId}`} className="mt-1 block truncate font-medium text-slate-950 underline-offset-2 hover:underline">
                {ticket.tenantName ?? ticket.tenantSlug ?? ticket.tenantId}
              </Link>
            ) : (
              <p className="mt-1 font-medium text-slate-950">Platform-only</p>
            )}
          </div>
          <div className="rounded bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase text-slate-500">Koppelingen</p>
            <p className="mt-1 truncate font-medium text-slate-950">
              {[ticket.domainLabel, ticket.subscriptionLabel, ticket.supportGrantLabel, ticket.smokeRunId, ticket.auditLogLabel].filter(Boolean).join(" / ") || "-"}
            </p>
          </div>
          <div className="rounded bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase text-slate-500">Interne notities</p>
            <p className="mt-1 font-medium text-slate-950">{ticket.noteCount} notitie(s)</p>
          </div>
          <div className="rounded bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase text-slate-500">SLA</p>
            <p className="mt-1 font-medium text-slate-950">{formatDate(ticket.slaDueAt)}</p>
          </div>
        </div>
      </div>

      <form action={updateTicketFormAction} className="mt-4 grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 md:grid-cols-[170px_150px_190px_minmax(0,1fr)_auto] md:items-end">
        <input type="hidden" name="ticketId" value={ticket.id} />
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Status
          <select name="status" defaultValue={ticket.status} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Prioriteit
          <select name="priority" defaultValue={ticket.priority} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          SLA
          <input name="slaDueAt" type="datetime-local" defaultValue={dateTimeLocalValue(ticket.slaDueAt)} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Toegewezen aan
          <select name="assigneePlatformUserId" defaultValue={ticket.assigneePlatformUserId ?? "__none"} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
            <option value="__none">Niet toegewezen</option>
            {dashboard.platformUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.role} - {user.userId}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-10 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-100">
          Opslaan
        </button>
      </form>
    </article>
  );
}

export default async function PlatformTicketsPage() {
  const dashboard = await listPlatformTickets();

  return (
    <main className="platform-page mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
        <Link href="/platform" className="text-sm text-slate-500 underline-offset-2 hover:underline">
          Platformbeheer
        </Link>
        <div>
          <p className="text-sm font-medium text-slate-500">Fieldgrid operations</p>
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Platformtickets</h1>
          <p className="mt-1 text-sm text-slate-500">
            Supportvragen, incidenten, onboarding, billing, domeinen en security-opvolging voor platformbeheer.
          </p>
          <p className="mt-2 text-xs text-slate-400">Gegenereerd: {formatDate(dashboard.generatedAt)}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open" value={dashboard.stats.open} icon={Ticket} />
        <Stat label="In behandeling" value={dashboard.stats.inProgress} icon={LifeBuoy} />
        <Stat label="Wachtend" value={dashboard.stats.waiting} icon={Clock3} tone="warning" />
        <Stat label="SLA verlopen" value={dashboard.stats.overdue} icon={AlertTriangle} tone={dashboard.stats.overdue > 0 ? "danger" : "good"} />
        <Stat label="Hoog/urgent" value={dashboard.stats.highPriority} icon={ShieldAlert} tone={dashboard.stats.highPriority > 0 ? "danger" : "default"} />
        <Stat label="Opgelost" value={dashboard.stats.resolved} icon={MessageSquareText} tone="good" />
        <Stat label="Gesloten" value={dashboard.stats.closed} icon={Ticket} />
        <Stat label="Totaal" value={dashboard.stats.total} icon={Ticket} />
      </div>

      <CreateTicketForm dashboard={dashboard} />

      <section className="grid gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Ticketlijst</h2>
            <p className="mt-1 text-sm text-slate-500">Maximaal 250 recent actieve tickets, inclusief platform-only tickets en tenantkoppelingen.</p>
          </div>
          <span className="w-fit rounded border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600">
            {dashboard.tickets.length} tickets
          </span>
        </div>

        {dashboard.tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} dashboard={dashboard} />
        ))}

        {dashboard.tickets.length === 0 && (
        <p className="platform-empty-state text-sm">
            Nog geen platformtickets.
          </p>
        )}
      </section>
    </main>
  );
}
