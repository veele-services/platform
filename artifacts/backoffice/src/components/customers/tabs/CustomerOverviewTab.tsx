import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  Banknote,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  FolderOpen,
  Globe,
  History,
  Mail,
  MapPin,
  MessageSquareText,
  NotebookText,
  Phone,
  ShieldAlert,
  Tag,
  User,
  Users,
} from "lucide-react";
import { AssignmentStatusBadge } from "@/components/assignments/AssignmentStatusBadge";
import type {
  CustomerContactRow,
  CustomerDetail,
  CustomerHistoryEntry,
  CustomerKpis,
  CustomerNoteRow,
  CustomerPortalUserRow,
  CustomerTicketSummaryRow,
} from "@/app/actions/customers";
import type { AssignmentHistoryRow } from "@/app/actions/assignments";
import type { DocumentRow } from "@/app/actions/documents";
import type { InvoiceRow } from "@/app/actions/invoices";
import type { ObjectRow } from "@/app/actions/objects";
import type { CustomerPaymentRow } from "@/app/actions/payments";
import type { ReportRow } from "@/app/actions/reports";
import { ProcessStatusBadge } from "@/components/workflows/ProcessStatus";

const OPEN_ASSIGNMENT_STATUSES = new Set([
  "approved",
  "plannable",
  "scheduled",
  "seen",
  "en_route",
  "in_progress",
]);
const OPEN_REQUEST_STATUSES = new Set([
  "requested",
  "review",
  "quote_preparation",
  "awaiting_approval",
]);
const HISTORIC_ASSIGNMENT_STATUSES = new Set([
  "not_completed",
  "completed",
  "report_submitted",
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
]);

const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateFormatter.format(date);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateTimeFormatter.format(date);
}

function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (Number.isNaN(parsed)) return "-";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(parsed);
}

function formatCents(value: number | null | undefined): string {
  if (typeof value !== "number") return "-";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(value / 100);
}

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex-shrink-0 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <div className="text-sm text-slate-700 break-words">{value}</div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  caption,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  caption?: string;
  tone?: "neutral" | "blue" | "teal" | "amber" | "red";
}) {
  const toneClass = {
    neutral: "bg-white border-slate-200",
    blue: "bg-blue-50/70 border-blue-100",
    teal: "bg-teal-50/70 border-teal-100",
    amber: "bg-amber-50/70 border-amber-100",
    red: "bg-red-50/70 border-red-100",
  }[tone];

  return (
    <div className={cx("rounded-lg border p-4", toneClass)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
      {caption && <p className="mt-1 text-xs text-slate-500">{caption}</p>}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  icon,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("veele-card", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {icon && (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              {icon}
            </span>
          )}
          <div>
            <h2 className="font-heading text-base font-semibold text-slate-950">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function GenericBadge({
  value,
  tone = "neutral",
}: {
  value: string;
  tone?: "neutral" | "green" | "blue" | "amber" | "red" | "purple" | "teal";
}) {
  const classes = {
    neutral: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    purple: "bg-violet-50 text-violet-700",
    teal: "bg-teal-50 text-teal-700",
  }[tone];

  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", classes)}>
      {value}
    </span>
  );
}

function TimelineItem({
  title,
  meta,
  href,
}: {
  title: string;
  meta: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 transition-colors hover:bg-slate-50">
      <p className="line-clamp-1 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-0.5 text-xs text-slate-500">{meta}</p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

interface Props {
  customer: CustomerDetail;
  canWrite: boolean;
  kpis: CustomerKpis;
  contacts: CustomerContactRow[];
  portalUsers: CustomerPortalUserRow[];
  objects: ObjectRow[];
  assignments: AssignmentHistoryRow[];
  invoices: InvoiceRow[];
  payments: CustomerPaymentRow[];
  reports: ReportRow[];
  documents: DocumentRow[];
  tickets: CustomerTicketSummaryRow[];
  notes: CustomerNoteRow[];
  history: CustomerHistoryEntry[];
}

export function CustomerOverviewTab({
  customer,
  canWrite,
  kpis,
  contacts,
  portalUsers,
  objects,
  assignments,
  invoices,
  payments,
  reports,
  documents,
  tickets,
  notes,
  history,
}: Props) {
  const activeAssignments = assignments.filter((row) => OPEN_ASSIGNMENT_STATUSES.has(row.status));
  const openRequests = assignments.filter((row) => OPEN_REQUEST_STATUSES.has(row.status));
  const historicAssignments = assignments.filter((row) => HISTORIC_ASSIGNMENT_STATUSES.has(row.status));
  const openTickets = tickets.filter((row) => row.status !== "closed");
  const openInvoices = invoices.filter((row) => row.status !== "paid" && row.status !== "cancelled");
  const reportsInReview = reports.filter((row) => row.status === "submitted");
  const activeObjects = objects.filter((row) => row.isActive);
  const latestPayment = payments[0];

  const actions = [
    ...openRequests.slice(0, 3).map((row) => ({
      label: `Aanvraag behandelen: ${row.code}`,
      detail: row.title,
      tone: "blue" as const,
      href: `/assignments/${row.id}`,
    })),
    ...reportsInReview.slice(0, 3).map((row) => ({
      label: `Rapportage controleren: ${row.assignmentCode}`,
      detail: row.assignmentTitle,
      tone: "amber" as const,
      href: `/reports/${row.id}`,
    })),
    ...openInvoices.slice(0, 3).map((row) => ({
      label: `Factuur opvolgen: ${row.invoiceNumber}`,
      detail: `${formatMoney(row.totalAmount)} - vervalt ${formatDate(row.dueDate)}`,
      tone: "red" as const,
      href: `/invoices/${row.id}`,
    })),
    ...openTickets.slice(0, 3).map((row) => ({
      label: `Ticket opvolgen: ${row.subject}`,
      detail: `${titleCase(row.department)} - ${titleCase(row.status)}`,
      tone: row.status === "waiting_backoffice" ? ("red" as const) : ("amber" as const),
      href: `/tickets/customer/${row.id}`,
    })),
  ].slice(0, 8);

  const timeline = [
    ...history.map((row) => ({
      time: row.createdAt,
      title: `${row.action} door ${row.actorName}`,
      meta: `Historie - ${formatDateTime(row.createdAt)}`,
      href: undefined,
    })),
    ...assignments.slice(0, 8).map((row) => ({
      time: row.scheduledDate ?? "",
      title: `${row.code} - ${row.title}`,
      meta: `Opdracht - ${formatDate(row.scheduledDate)} - ${titleCase(row.status)}`,
      href: `/assignments/${row.id}`,
    })),
    ...reports.slice(0, 6).map((row) => ({
      time: row.submittedAt,
      title: `Rapportage ${row.assignmentCode}`,
      meta: `${titleCase(row.status)} - ${formatDateTime(row.submittedAt)}`,
      href: `/reports/${row.id}`,
    })),
    ...tickets.slice(0, 6).map((row) => ({
      time: row.lastMessageAt,
      title: row.subject,
      meta: `Ticket - ${formatDateTime(row.lastMessageAt)}`,
      href: `/tickets/customer/${row.id}`,
    })),
    ...invoices.slice(0, 6).map((row) => ({
      time: row.createdAt,
      title: `Factuur ${row.invoiceNumber}`,
      meta: `${titleCase(row.status)} - ${formatMoney(row.totalAmount)}`,
      href: `/invoices/${row.id}`,
    })),
  ]
    .filter((row) => row.time)
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Actieve objecten"
          value={kpis.activeObjects}
          caption={`${objects.length} objecten totaal`}
          tone="teal"
        />
        <MetricCard
          label="Open opdrachten"
          value={kpis.openAssignments}
          caption={`${openRequests.length} open aanvraag/aanvragen`}
          tone={kpis.openAssignments > 0 ? "blue" : "neutral"}
        />
        <MetricCard
          label="Open facturen"
          value={kpis.openInvoices}
          caption={formatMoney(kpis.outstandingBalance)}
          tone={kpis.openInvoices > 0 ? "amber" : "neutral"}
        />
        <MetricCard
          label="Laatste activiteit"
          value={kpis.lastActivityDate ? formatDate(kpis.lastActivityDate) : "-"}
          caption={`Maandomzet ${formatMoney(kpis.monthlyRevenue)}`}
          tone="neutral"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,0.85fr)]">
        <div className="space-y-6">
          <SectionCard
            title="Klantprofiel"
            subtitle="Wie is de klant, wie is verantwoordelijk en welke basisgegevens zijn bekend."
            icon={<Building2 className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="space-y-3">
                <InfoRow icon={<Tag className="h-4 w-4" />} label="Klantcode" value={customer.code} />
                <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Klanttype" value={customer.customerTypeName ?? "-"} />
                <InfoRow icon={<ShieldAlert className="h-4 w-4" />} label="Status" value={titleCase(customer.status)} />
                <InfoRow icon={<User className="h-4 w-4" />} label="Accountmanager" value={customer.accountManagerName ?? "-"} />
              </div>
              <div className="space-y-3">
                <InfoRow icon={<User className="h-4 w-4" />} label="Hoofdcontact" value={customer.contactName ?? "-"} />
                <InfoRow
                  icon={<Mail className="h-4 w-4" />}
                  label="E-mail"
                  value={customer.contactEmail ? <a className="text-teal-600 hover:underline" href={`mailto:${customer.contactEmail}`}>{customer.contactEmail}</a> : "-"}
                />
                <InfoRow
                  icon={<Phone className="h-4 w-4" />}
                  label="Telefoon"
                  value={customer.contactPhone ? <a className="text-teal-600 hover:underline" href={`tel:${customer.contactPhone}`}>{customer.contactPhone}</a> : "-"}
                />
                <InfoRow icon={<Globe className="h-4 w-4" />} label="Website" value={customer.website ?? "-"} />
              </div>
              <div className="space-y-3">
                <InfoRow icon={<MapPin className="h-4 w-4" />} label="Adres" value={[customer.address, customer.postalCode, customer.city].filter(Boolean).join(", ") || "-"} />
                <InfoRow icon={<Building2 className="h-4 w-4" />} label="Sector" value={customer.sectorName ?? "-"} />
                <InfoRow icon={<FileText className="h-4 w-4" />} label="BTW / KVK" value={[customer.vatNumber, customer.chamberOfCommerceNumber].filter(Boolean).join(" / ") || "-"} />
                <InfoRow icon={<Calendar className="h-4 w-4" />} label="Aangemaakt" value={formatDate(customer.createdAt)} />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Wat leveren we"
            subtitle="Objecten, actieve opdrachten en recente dienstverlening in een operationeel overzicht."
            icon={<Briefcase className="h-5 w-5" />}
            action={<Link className="text-xs font-semibold text-teal-600 hover:underline" href={`/objects?customerId=${customer.id}`}>Objecten beheren</Link>}
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-950">Objecten</h3>
                  <GenericBadge value={`${activeObjects.length} actief`} tone="green" />
                </div>
                <div className="divide-y divide-slate-100">
                  {objects.slice(0, 5).map((object) => (
                    <Link
                      key={object.id}
                      href={`/objects/${object.id}`}
                      className="block px-4 py-3 transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{object.name}</p>
                          <p className="truncate text-xs text-slate-500">
                            {[object.address, object.city].filter(Boolean).join(" - ") || "Geen adres"}
                          </p>
                        </div>
                        <GenericBadge value={object.isActive ? "Actief" : "Inactief"} tone={object.isActive ? "green" : "neutral"} />
                      </div>
                    </Link>
                  ))}
                  {objects.length === 0 && <div className="p-4"><EmptyState text="Nog geen objecten gekoppeld." /></div>}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-950">Actieve opdrachten</h3>
                  <GenericBadge value={`${activeAssignments.length} actief`} tone={activeAssignments.length > 0 ? "blue" : "neutral"} />
                </div>
                <div className="divide-y divide-slate-100">
                  {activeAssignments.slice(0, 6).map((assignment) => (
                    <Link
                      key={assignment.id}
                      href={`/assignments/${assignment.id}`}
                      className="block px-4 py-3 transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {assignment.code} - {assignment.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            {assignment.objectName ?? "Geen object"} - {formatDate(assignment.scheduledDate)}
                          </p>
                        </div>
                        <AssignmentStatusBadge status={assignment.status} />
                      </div>
                    </Link>
                  ))}
                  {activeAssignments.length === 0 && <div className="p-4"><EmptyState text="Geen actieve opdrachten." /></div>}
                </div>
              </div>
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SectionCard
              title="Contactpersonen"
              subtitle={`${contacts.length} contactpersoon/contactpersonen`}
              icon={<Users className="h-5 w-5" />}
            >
              <div className="space-y-3">
                {contacts.slice(0, 4).map((contact) => (
                  <div key={contact.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{contact.firstName} {contact.lastName}</p>
                        <p className="text-xs text-slate-500">{contact.function ?? "Geen functie"}</p>
                      </div>
                      {contact.isPrimary && <GenericBadge value="Primair" tone="teal" />}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-1 text-xs text-slate-600">
                      {contact.email && <span>{contact.email}</span>}
                      {contact.phone && <span>{contact.phone}</span>}
                      {contact.mobile && <span>{contact.mobile}</span>}
                    </div>
                  </div>
                ))}
                {contacts.length === 0 && <EmptyState text="Nog geen contactpersonen." />}
              </div>
            </SectionCard>

            <SectionCard
              title="Gekoppelde gebruikers"
              subtitle={`${portalUsers.length} klantportaalgebruiker(s)`}
              icon={<User className="h-5 w-5" />}
            >
              <div className="space-y-3">
                {portalUsers.slice(0, 5).map((user) => (
                  <div key={user.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{user.name}</p>
                        <p className="truncate text-xs text-slate-500">{user.email}</p>
                      </div>
                      <GenericBadge value={titleCase(user.status)} tone={user.status === "active" ? "green" : "amber"} />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Rol: {titleCase(user.role)} - Laatste login: {formatDateTime(user.lastLoginAt)}
                    </p>
                  </div>
                ))}
                {portalUsers.length === 0 && <EmptyState text="Nog geen klantportaalgebruikers gekoppeld." />}
              </div>
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SectionCard
              title="Rapportages"
              subtitle={`${reports.length} recente rapportage(s)`}
              icon={<NotebookText className="h-5 w-5" />}
            >
              <div className="space-y-3">
                {reports.slice(0, 5).map((report) => (
                  <Link key={report.id} href={`/reports/${report.id}`} className="block rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{report.assignmentCode} - {report.assignmentTitle}</p>
                        <p className="text-xs text-slate-500">Ingediend {formatDateTime(report.submittedAt)}</p>
                      </div>
                      <ProcessStatusBadge kind="report" status={report.status} />
                    </div>
                  </Link>
                ))}
                {reports.length === 0 && <EmptyState text="Nog geen rapportages." />}
              </div>
            </SectionCard>

            <SectionCard
              title="Tickets"
              subtitle={`${openTickets.length} open ticket(s)`}
              icon={<MessageSquareText className="h-5 w-5" />}
            >
              <div className="space-y-3">
                {tickets.slice(0, 5).map((ticket) => (
                  <Link key={ticket.id} href={`/tickets/customer/${ticket.id}`} className="block rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{ticket.subject}</p>
                        <p className="text-xs text-slate-500">
                          {titleCase(ticket.department)} - {formatDateTime(ticket.lastMessageAt)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                      <ProcessStatusBadge kind="ticket" status={ticket.status} />
                        {ticket.unreadCount > 0 && <span className="text-xs font-semibold text-red-600">{ticket.unreadCount} ongelezen</span>}
                      </div>
                    </div>
                  </Link>
                ))}
                {tickets.length === 0 && <EmptyState text="Geen tickets voor deze klant." />}
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Financieel"
            subtitle="Facturen, betalingen en openstaande posten."
            icon={<Banknote className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-950">Facturen</h3>
                  <GenericBadge value={`${openInvoices.length} open`} tone={openInvoices.length > 0 ? "amber" : "green"} />
                </div>
                <div className="divide-y divide-slate-100">
                  {invoices.slice(0, 5).map((invoice) => (
                    <Link key={invoice.id} href={`/invoices/${invoice.id}`} className="block px-4 py-3 hover:bg-slate-50">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{invoice.invoiceNumber}</p>
                          <p className="text-xs text-slate-500">Vervalt {formatDate(invoice.dueDate)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-950">{formatMoney(invoice.totalAmount)}</p>
                          <ProcessStatusBadge kind="invoice" status={invoice.status} />
                        </div>
                      </div>
                    </Link>
                  ))}
                  {invoices.length === 0 && <div className="p-4"><EmptyState text="Nog geen facturen." /></div>}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-950">Betalingen</h3>
                <div className="mt-4 grid grid-cols-1 gap-3">
                  <InfoRow icon={<CreditCard className="h-4 w-4" />} label="Laatste betaling" value={latestPayment ? `${formatCents(latestPayment.amountCents)} - ${formatDateTime(latestPayment.createdAt)}` : "-"} />
                  <InfoRow icon={<Clock className="h-4 w-4" />} label="Openstaand" value={formatMoney(kpis.outstandingBalance)} />
                  <InfoRow icon={<CheckCircle2 className="h-4 w-4" />} label="Betalingen getoond" value={payments.length} />
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        <aside className="space-y-6">
          <SectionCard
            title="Openstaande acties"
            subtitle="Wat moet management, planning of administratie opvolgen?"
            icon={<Bell className="h-5 w-5" />}
          >
            <div className="space-y-3">
              {actions.map((action) => (
                <Link key={`${action.label}-${action.href}`} href={action.href} className="block rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-start gap-3">
                    <span className={cx(
                      "mt-1 h-2.5 w-2.5 rounded-full",
                      action.tone === "red" && "bg-red-500",
                      action.tone === "amber" && "bg-amber-500",
                      action.tone === "blue" && "bg-blue-500",
                    )} />
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold text-slate-900">{action.label}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{action.detail}</p>
                    </div>
                  </div>
                </Link>
              ))}
              {actions.length === 0 && <EmptyState text="Geen openstaande acties gevonden." />}
            </div>
          </SectionCard>

          <SectionCard
            title="Open aanvragen"
            subtitle={`${openRequests.length} aanvraag/aanvragen in behandeling`}
            icon={<AlertTriangle className="h-5 w-5" />}
          >
            <div className="space-y-3">
              {openRequests.slice(0, 5).map((assignment) => (
                <Link key={assignment.id} href={`/assignments/${assignment.id}`} className="block rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{assignment.code}</p>
                      <p className="line-clamp-1 text-xs text-slate-500">{assignment.title}</p>
                    </div>
                    <AssignmentStatusBadge status={assignment.status} />
                  </div>
                </Link>
              ))}
              {openRequests.length === 0 && <EmptyState text="Geen open aanvragen." />}
            </div>
          </SectionCard>

          <SectionCard
            title="Interne informatie"
            subtitle="Alleen zichtbaar voor backoffice en management."
            icon={<ShieldAlert className="h-5 w-5" />}
          >
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Interne klantnotitie - niet klantzichtbaar</p>
                {canWrite && customer.notes ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{customer.notes}</p>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">Geen interne hoofdnotitie vastgelegd.</p>
                )}
              </div>
              <div className="space-y-2">
                {notes.slice(0, 3).map((note) => (
                  <div key={note.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <p className="line-clamp-3 text-sm text-slate-700">{note.content}</p>
                    <p className="mt-2 text-xs text-slate-500">{note.authorName ?? note.authorEmail} - {formatDateTime(note.createdAt)}</p>
                  </div>
                ))}
                {notes.length === 0 && <EmptyState text="Geen losse interne notities." />}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Klantzichtbare informatie"
            subtitle="Informatie die veilig in klantportaal of klantdocumenten gebruikt kan worden."
            icon={<CheckCircle2 className="h-5 w-5" />}
          >
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-800">Klant ziet uw organisatienaam als uitvoerder</p>
                <p className="mt-1 text-xs text-emerald-700">
                  Personeelsnamen en interne rapportagecontrole blijven buiten klantgerichte schermen.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">Klantzichtbare notities</p>
                <p className="mt-1 text-sm text-slate-500">
                  Nog geen aparte klantzichtbare notities vastgelegd. Gebruik hiervoor rapportages, tickets of documenten die expliciet klantgericht zijn.
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Documenten"
            subtitle={`${documents.length} document(en) op klantniveau`}
            icon={<FolderOpen className="h-5 w-5" />}
          >
            <div className="space-y-3">
              {documents.slice(0, 5).map((document) => (
                <div key={document.id} className="rounded-lg border border-slate-200 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-slate-900">{document.name}</p>
                  <p className="text-xs text-slate-500">{document.filename} - {formatDateTime(document.createdAt)}</p>
                </div>
              ))}
              {documents.length === 0 && <EmptyState text="Geen klantdocumenten." />}
            </div>
          </SectionCard>
        </aside>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.7fr)]">
        <SectionCard
          title="Historische opdrachten"
          subtitle={`${historicAssignments.length} historische opdracht(en) in laatste selectie`}
          icon={<Archive className="h-5 w-5" />}
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {historicAssignments.slice(0, 8).map((assignment) => (
              <Link key={assignment.id} href={`/assignments/${assignment.id}`} className="rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{assignment.code} - {assignment.title}</p>
                    <p className="text-xs text-slate-500">{assignment.objectName ?? "Geen object"} - {formatDate(assignment.scheduledDate)}</p>
                  </div>
                  <AssignmentStatusBadge status={assignment.status} />
                </div>
              </Link>
            ))}
            {historicAssignments.length === 0 && <EmptyState text="Nog geen historische opdrachten in deze selectie." />}
          </div>
        </SectionCard>

        <SectionCard
          title="Timeline"
          subtitle="Laatste klantgebeurtenissen uit historie, opdrachten, rapportages, tickets en facturen."
          icon={<History className="h-5 w-5" />}
        >
          <div className="space-y-3">
            {timeline.map((item) => (
              <TimelineItem key={`${item.title}-${item.meta}`} title={item.title} meta={item.meta} href={item.href} />
            ))}
            {timeline.length === 0 && <EmptyState text="Nog geen timeline beschikbaar." />}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
