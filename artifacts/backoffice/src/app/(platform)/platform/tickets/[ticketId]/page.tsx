import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, Link2, MessageSquarePlus, Ticket } from "lucide-react";
import {
  addPlatformTicketNote,
  getPlatformTicketDetail,
  updatePlatformTicket,
  type PlatformTicketDetail,
  type PlatformTicketLinkOption,
} from "@/app/actions/platform-tickets";

export const metadata = {
  title: "Ticketdetail",
};

type Props = {
  params: Promise<{ ticketId: string }>;
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

const TYPE_LABELS: Record<string, string> = {
  support: "Support",
  incident: "Incident",
  onboarding: "Onboarding",
  billing: "Billing",
  domain: "Domein",
  security: "Security",
};

async function updateTicketFormAction(formData: FormData): Promise<void> {
  "use server";
  await updatePlatformTicket(formData);
}

async function addNoteFormAction(formData: FormData): Promise<void> {
  "use server";
  await addPlatformTicketNote(formData);
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

function chipClass(kind: "status" | "priority", value: string, overdue = false): string {
  if (kind === "priority") {
    if (overdue || value === "urgent") return "border-rose-200 bg-rose-50 text-rose-700";
    if (value === "high") return "border-orange-200 bg-orange-50 text-orange-700";
    return "border-indigo-200 bg-indigo-50 text-indigo-700";
  }

  if (value === "resolved" || value === "closed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "waiting_customer" || value === "waiting_internal") return "border-amber-200 bg-amber-50 text-amber-700";
  if (value === "in_progress") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function LinkedItem({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string | null;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      {href && value ? (
        <Link href={href} className="mt-1 block break-words text-sm font-semibold text-slate-950 underline-offset-2 hover:underline">
          {value}
        </Link>
      ) : (
        <p className="mt-1 break-words text-sm font-semibold text-slate-950">{value ?? "-"}</p>
      )}
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

function UpdatePanel({ ticket }: { ticket: PlatformTicketDetail }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <Clock3 className="h-5 w-5 text-slate-400" />
        <h2 className="text-lg font-semibold tracking-normal text-slate-950">Opvolging</h2>
      </div>
      <form action={updateTicketFormAction} className="grid gap-3">
        <input type="hidden" name="ticketId" value={ticket.id} />
        <div className="grid gap-3 md:grid-cols-2">
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
              {ticket.linkOptions.platformUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.role} - {user.userId}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" className="h-10 rounded bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
          Ticket bijwerken
        </button>
      </form>
    </section>
  );
}

function LinkPanel({ ticket }: { ticket: PlatformTicketDetail }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <Link2 className="h-5 w-5 text-slate-400" />
        <h2 className="text-lg font-semibold tracking-normal text-slate-950">Koppelingen</h2>
      </div>
      <div className="grid gap-3">
        <LinkedItem
          label="Tenant"
          value={ticket.tenantName ?? ticket.tenantSlug ?? (ticket.tenantId ? ticket.tenantId : "Platform-only")}
          href={ticket.tenantId ? `/platform/tenants/${ticket.tenantId}` : null}
        />
        <LinkedItem label="Domein" value={ticket.domainLabel} />
        <LinkedItem label="Subscription" value={ticket.subscriptionLabel} />
        <LinkedItem label="Support grant" value={ticket.supportGrantLabel} />
        <LinkedItem label="Smoke run" value={ticket.smokeRunId} />
        <LinkedItem label="Audit event" value={ticket.auditLogLabel ?? ticket.auditLogId} />
      </div>

      <form action={updateTicketFormAction} className="mt-4 grid gap-3 border-t border-slate-200 pt-4">
        <input type="hidden" name="ticketId" value={ticket.id} />
        <input type="hidden" name="status" value={ticket.status} />
        <input type="hidden" name="priority" value={ticket.priority} />
        <input type="hidden" name="slaDueAt" value={dateTimeLocalValue(ticket.slaDueAt)} />
        <input type="hidden" name="assigneePlatformUserId" value={ticket.assigneePlatformUserId ?? "__none"} />
        <LinkSelect name="subscriptionId" label="Subscription" options={ticket.linkOptions.subscriptions} defaultValue={ticket.subscriptionId} />
        <LinkSelect name="domainId" label="Domein" options={ticket.linkOptions.domains} defaultValue={ticket.domainId} />
        <LinkSelect name="supportGrantId" label="Support grant" options={ticket.linkOptions.supportGrants} defaultValue={ticket.supportGrantId} />
        <LinkSelect name="auditLogId" label="Audit event" options={ticket.linkOptions.auditEvents} defaultValue={ticket.auditLogId} />
        <button type="submit" className="h-10 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-100">
          Koppelingen bewaren
        </button>
      </form>
    </section>
  );
}

function NotesPanel({ ticket }: { ticket: PlatformTicketDetail }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <MessageSquarePlus className="h-5 w-5 text-slate-400" />
        <h2 className="text-lg font-semibold tracking-normal text-slate-950">Interne notities</h2>
      </div>
      <form action={addNoteFormAction} className="grid gap-3">
        <input type="hidden" name="ticketId" value={ticket.id} />
        <textarea name="body" required minLength={2} maxLength={5000} rows={4} className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Nieuwe interne notitie" />
        <button type="submit" className="h-10 rounded bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
          Notitie toevoegen
        </button>
      </form>

      <div className="mt-5 grid gap-3">
        {ticket.notes.map((note) => (
          <article key={note.id} className="rounded border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-slate-950">{note.authorLabel}</p>
              <p className="text-xs text-slate-500">{formatDate(note.createdAt)} - {note.visibility}</p>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{note.body}</p>
          </article>
        ))}
        {ticket.notes.length === 0 && (
          <p className="rounded border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Nog geen interne notities.
          </p>
        )}
      </div>
    </section>
  );
}

export default async function PlatformTicketDetailPage({ params }: Props) {
  const { ticketId } = await params;
  const ticket = await getPlatformTicketDetail(ticketId);
  if (!ticket) notFound();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4">
        <Link href="/platform/tickets" className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 underline-offset-2 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Terug naar tickets
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded border px-2 py-1 text-xs font-medium ${chipClass("status", ticket.status)}`}>
                {STATUS_LABELS[ticket.status] ?? ticket.status}
              </span>
              <span className={`rounded border px-2 py-1 text-xs font-medium ${chipClass("priority", ticket.priority, ticket.isOverdue)}`}>
                {ticket.isOverdue ? "SLA verlopen" : PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
              </span>
              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
                {TYPE_LABELS[ticket.type] ?? ticket.type}
              </span>
            </div>
            <h1 className="mt-3 break-words text-3xl font-semibold tracking-normal text-slate-950">{ticket.title}</h1>
            <p className="mt-2 text-sm text-slate-500">
              Laatste activiteit {formatDate(ticket.lastActivityAt)} - SLA {formatDate(ticket.slaDueAt)}
            </p>
          </div>
          <div className="rounded border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 lg:min-w-[280px]">
            <div className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-slate-400" />
              <p className="font-semibold text-slate-950">{ticket.noteCount} interne notitie(s)</p>
            </div>
            <p className="mt-2">Aangemaakt {formatDate(ticket.createdAt)}</p>
            <p>Bijgewerkt {formatDate(ticket.updatedAt)}</p>
            <p>Toegewezen: {ticket.assigneeLabel ?? "niet toegewezen"}</p>
          </div>
        </div>
      </div>

      {ticket.description && (
        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Omschrijving</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{ticket.description}</p>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="grid gap-5">
          <NotesPanel ticket={ticket} />
        </div>
        <div className="grid gap-5 lg:self-start">
          <UpdatePanel ticket={ticket} />
          <LinkPanel ticket={ticket} />
        </div>
      </div>
    </main>
  );
}
