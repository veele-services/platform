export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  Headphones,
  PlusCircle,
} from "lucide-react";
import { getMyCustomerProfile } from "@/actions/customer";
import { getMyAssignments } from "@/actions/assignments";
import { getMyDocuments } from "@/actions/documents";
import { getMyInvoiceSummary } from "@/actions/invoices";
import { getMyPendingQuoteCount } from "@/actions/quotes";
import { getMyObjects } from "@/actions/objects";
import { getMyReports } from "@/actions/reports";
import { getMyCustomerNotifications } from "@/actions/notifications";
import { getMyCustomerTicketSummary } from "@/actions/tickets";
import { requireCurrentCustomerPortalTenantId } from "@/lib/auth/tenant";
import { getTenantBranding } from "@workspace/db";
import { getCustomerPortalFeatureFlags } from "@/lib/portal-features";
import { STATUS_COLOR, STATUS_LABEL } from "@/types/assignments";
import type { ReactNode } from "react";

type ActionTone = "accent" | "warning" | "danger" | "neutral";

type ActionInboxItem = {
  href: string;
  title: string;
  description: string;
  tone: ActionTone;
};

function formatAmount(amount: string): string {
  return Number.parseFloat(amount || "0").toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDate(value: string | null): string {
  if (!value) return "Nog niet gepland";
  return new Date(`${value}T00:00:00`).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
  });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
  });
}

function supportPrefillHref(params: Record<string, string>): string {
  return `/meldingen/tickets?${new URLSearchParams(params).toString()}`;
}

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Goedemorgen";
  if (hour < 18) return "Goedemiddag";
  return "Goedenavond";
}

function toneStyles(tone: ActionTone) {
  if (tone === "danger") {
    return { bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" };
  }
  if (tone === "warning") {
    return { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" };
  }
  if (tone === "accent") {
    return { bg: "#E8FBFA", color: "#087C79", border: "#BDEDEA" };
  }
  return {
    bg: "#F1F5F9",
    color: "var(--color-secondary)",
    border: "var(--color-border)",
  };
}

function SummaryStrip({
  items,
}: {
  items: Array<{
    label: string;
    value: string | number;
    href: string;
    hint: string;
  }>;
}) {
  return (
    <section
      className="grid grid-cols-2 gap-1 rounded-xl border bg-white p-1 lg:grid-cols-4"
      style={{ borderColor: "var(--color-border)" }}
    >
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="rounded-lg px-3 py-2.5 transition hover:bg-slate-50"
        >
          <span
            className="block text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--color-secondary)" }}
          >
            {item.label}
          </span>
          <span
            className="mt-1 block text-lg font-semibold leading-none"
            style={{ color: "var(--color-primary)" }}
          >
            {item.value}
          </span>
          <span
            className="mt-1 block text-xs font-semibold"
            style={{ color: "var(--color-accent-accessible)" }}
          >
            {item.hint}
          </span>
        </Link>
      ))}
    </section>
  );
}

function ActionInbox({ items }: { items: ActionInboxItem[] }) {
  return (
    <section
      className="rounded-xl border bg-white p-4"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            className="text-base font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            Actie nodig
          </h2>
          <p
            className="mt-0.5 text-sm font-semibold"
            style={{ color: "var(--color-secondary)" }}
          >
            Maximaal vijf punten die aandacht vragen.
          </p>
        </div>
        <span
          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          {items.length}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {items.length > 0 ? (
          items.map((item) => {
            const tone = toneStyles(item.tone);
            return (
              <Link
                key={`${item.href}-${item.title}`}
                href={item.href}
                className="flex items-start gap-3 rounded-lg border px-3 py-3 transition hover:bg-slate-50"
                style={{
                  borderColor: tone.border,
                  backgroundColor:
                    item.tone === "neutral" ? "#FFFFFF" : tone.bg,
                }}
              >
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: tone.bg, color: tone.color }}
                >
                  {item.tone === "danger" ? (
                    <AlertTriangle size={16} />
                  ) : item.tone === "warning" ? (
                    <Clock size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-sm font-semibold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {item.title}
                  </span>
                  <span
                    className="mt-0.5 block text-xs font-semibold leading-5"
                    style={{ color: "#475569" }}
                  >
                    {item.description}
                  </span>
                </span>
                <ArrowRight
                  size={16}
                  className="mt-2 shrink-0"
                  style={{ color: tone.color }}
                />
              </Link>
            );
          })
        ) : (
          <div
            className="rounded-lg bg-slate-50 px-4 py-4 text-sm"
            style={{ color: "var(--color-secondary)" }}
          >
            Geen open acties. Nieuwe berichten, offertes of facturen verschijnen
            hier.
          </div>
        )}
      </div>
    </section>
  );
}

function FocusPanel({
  href,
  title,
  eyebrow,
  description,
  Icon,
  children,
}: {
  href: string;
  title: string;
  eyebrow: string;
  description: string;
  Icon: typeof CalendarDays;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-xl border bg-white p-4"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_10%,white)] text-[var(--color-accent-accessible)]">
            <Icon size={21} strokeWidth={2.35} />
          </span>
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: "var(--color-accent-accessible)" }}
            >
              {eyebrow}
            </p>
            <h2
              className="text-base font-semibold"
              style={{ color: "var(--color-primary)" }}
            >
              {title}
            </h2>
            <p
              className="mt-1 text-sm font-semibold leading-5"
              style={{ color: "var(--color-secondary)" }}
            >
              {description}
            </p>
          </div>
        </div>
        <Link
          href={href}
          className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-xs font-medium"
          style={{ color: "var(--color-accent-accessible)" }}
        >
          Open
        </Link>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SecondaryCard({
  title,
  href,
  actionLabel,
  children,
}: {
  title: string;
  href: string;
  actionLabel: string;
  children: ReactNode;
}) {
  return (
    <section
      className="min-w-0 rounded-xl border bg-white p-4"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <h2
          className="min-w-0 text-base font-semibold"
          style={{ color: "var(--color-primary)" }}
        >
          {title}
        </h2>
        <Link
          href={href}
          className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-1 text-xs font-semibold"
          style={{ color: "var(--color-accent-accessible)" }}
        >
          {actionLabel}
        </Link>
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage() {
  const tenantId = await requireCurrentCustomerPortalTenantId();
  if (!tenantId) {
    redirect(
      "/login?error=" +
        encodeURIComponent(
          "Het klantportaal is niet beschikbaar voor deze organisatie.",
        ),
    );
  }
  const featureFlags = await getCustomerPortalFeatureFlags(tenantId);

  const [
    branding,
    profile,
    assignments,
    invoiceSummary,
    pendingQuoteCount,
    objects,
    reports,
    notifications,
    ticketSummary,
    documents,
  ] = await Promise.all([
    getTenantBranding(tenantId),
    getMyCustomerProfile(),
    getMyAssignments(),
    featureFlags.finance
      ? getMyInvoiceSummary()
      : Promise.resolve({ openCount: 0, openTotal: "0" }),
    featureFlags.finance ? getMyPendingQuoteCount() : Promise.resolve(0),
    getMyObjects(),
    featureFlags.reporting ? getMyReports() : Promise.resolve([]),
    featureFlags.notifications
      ? getMyCustomerNotifications()
      : Promise.resolve([]),
    getMyCustomerTicketSummary(),
    featureFlags.documents ? getMyDocuments() : Promise.resolve([]),
  ]);

  if (!profile) {
    redirect(
      "/login?error=" +
        encodeURIComponent("Geen klantprofiel gevonden voor dit account."),
    );
  }

  const openAssignments = assignments.filter((a) =>
    [
      "requested",
      "review",
      "quote_preparation",
      "awaiting_approval",
      "approved",
      "plannable",
      "scheduled",
      "seen",
      "en_route",
      "in_progress",
    ].includes(a.status),
  );
  const activeAssignment =
    openAssignments.find((assignment) => assignment.status === "in_progress") ??
    openAssignments.find((assignment) => assignment.status === "en_route") ??
    openAssignments.find((assignment) => assignment.status === "scheduled") ??
    openAssignments[0] ??
    null;
  const recentAssignments = assignments.slice(0, 3);
  const recentObjects = objects.slice(0, 3);
  const recentReports = reports.slice(0, 3);
  const recentDocuments = documents.slice(0, 3);
  const recentNotifications = notifications
    .filter(
      (item) => item.kind === "communication" && item.category !== "system",
    )
    .slice(0, 3);
  const generalSupportHref = supportPrefillHref({
    context: "general",
    department: "support",
    subject: "Algemene vraag",
    body: "Vraag:",
  });

  const actionItems: ActionInboxItem[] = [];
  if (pendingQuoteCount > 0) {
    actionItems.push({
      href: "/offertes",
      title: `${pendingQuoteCount} offerte${pendingQuoteCount === 1 ? "" : "s"} wacht${pendingQuoteCount === 1 ? "" : "en"} op akkoord`,
      description:
        "Controleer de offerte en geef digitaal akkoord of afwijzing.",
      tone: "warning",
    });
  }
  if (invoiceSummary.openCount > 0) {
    actionItems.push({
      href: "/financieel",
      title: `${invoiceSummary.openCount} ${invoiceSummary.openCount === 1 ? "factuur" : "facturen"} open`,
      description: `${formatAmount(invoiceSummary.openTotal)} staat klaar voor betaling.`,
      tone: "danger",
    });
  }
  if (ticketSummary.unreadCount > 0) {
    actionItems.push({
      href: "/meldingen/tickets",
      title: `${ticketSummary.unreadCount} nieuw supportbericht${ticketSummary.unreadCount === 1 ? "" : "en"}`,
      description: "Bekijk de laatste reactie in Support.",
      tone: "accent",
    });
  }
  if (openAssignments.length > 0) {
    actionItems.push({
      href: "/opdrachten",
      title: `${openAssignments.length} lopende opdracht${openAssignments.length === 1 ? "" : "en"}`,
      description: "Bekijk status, planning en eventuele vervolgstappen.",
      tone: "neutral",
    });
  }

  const visibleActionItems = actionItems.slice(0, 5);
  const contactName = profile.contactName ?? profile.name;
  const tenantName = branding.displayName;
  const summaryItems = [
    {
      label: "Opdrachten",
      value: openAssignments.length,
      href: "/opdrachten",
      hint: "lopend",
    },
    ...(featureFlags.finance
      ? [
          {
            label: "Openstaand",
            value: formatAmount(invoiceSummary.openTotal),
            href: "/financieel",
            hint: `${invoiceSummary.openCount} ${invoiceSummary.openCount === 1 ? "factuur" : "facturen"}`,
          },
        ]
      : []),
    {
      label: "Contact & tickets",
      value: ticketSummary.openCount,
      href: "/meldingen/tickets",
      hint: `${ticketSummary.unreadCount} ongelezen`,
    },
    ...(featureFlags.documents
      ? [
          {
            label: "Documenten",
            value: documents.length,
            href: "/documenten",
            hint: "beschikbaar",
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-4 px-3.5 pb-[calc(6.4rem+var(--safe-bottom))] pt-4 md:px-1 md:pb-0 md:pt-1">
      <section
        className="rounded-xl border bg-white p-4 md:px-5"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p
              className="text-sm font-bold"
              style={{ color: "var(--color-secondary)" }}
            >
              {greetingForNow()}, {contactName}
            </p>
            <h1
              className="mt-1 text-[26px] font-semibold leading-tight md:text-[30px]"
              style={{ color: "var(--color-primary)" }}
            >
              {tenantName} klantportaal
            </h1>
            <p
              className="mt-1 max-w-3xl text-sm font-medium leading-6"
              style={{ color: "var(--color-secondary)" }}
            >
              Status, acties en documenten voor {profile.name}. De belangrijkste
              vervolgstappen staan bovenaan.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/opdrachten/aanvragen"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-accent-accessible)" }}
            >
              <PlusCircle size={16} />
              Opdracht aanvragen
            </Link>
            <Link
              href="/opdrachten/aanvragen?prioriteit=urgent"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-primary)",
              }}
            >
              <AlertTriangle size={16} />
              Urgente opdracht
            </Link>
          </div>
        </div>
      </section>

      <SummaryStrip items={summaryItems} />

      <section className="grid gap-4 xl:grid-cols-[0.92fr_1.55fr]">
        <ActionInbox items={visibleActionItems} />

        <div className="grid gap-4 lg:grid-cols-2">
          <FocusPanel
            href="/opdrachten"
            title="Opdrachten"
            eyebrow="Planning"
            description={
              activeAssignment
                ? "Volg de eerstvolgende lopende opdracht."
                : "Vraag een opdracht aan of bekijk historie."
            }
            Icon={CalendarDays}
          >
            {activeAssignment ? (
              <Link
                href={`/opdrachten/${activeAssignment.id}`}
                className="block rounded-2xl border px-3 py-3"
                style={{ borderColor: "var(--color-border)" }}
              >
                <span
                  className="block font-mono text-xs font-semibold"
                  style={{ color: "var(--color-secondary)" }}
                >
                  {activeAssignment.code}
                </span>
                <span
                  className="mt-1 block line-clamp-1 text-sm font-semibold"
                  style={{ color: "var(--color-primary)" }}
                >
                  {activeAssignment.title}
                </span>
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{
                      backgroundColor: (
                        STATUS_COLOR[activeAssignment.status] ?? {
                          bg: "#F1F5F9",
                        }
                      ).bg,
                      color: (
                        STATUS_COLOR[activeAssignment.status] ?? {
                          color: "#64748B",
                        }
                      ).color,
                    }}
                  >
                    {STATUS_LABEL[activeAssignment.status] ??
                      activeAssignment.status}
                  </span>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    {formatDate(activeAssignment.scheduledDate)}
                  </span>
                </span>
              </Link>
            ) : (
              <Link
                href="/opdrachten/aanvragen"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-[#E8FBFA] px-4 py-3 text-sm font-semibold text-[#087C79]"
              >
                Nieuwe opdracht aanvragen
              </Link>
            )}
          </FocusPanel>

          <FocusPanel
            href="/meldingen/tickets"
            title="Support"
            eyebrow="Tickets"
            description="Vragen en reacties richting uw dienstverlener."
            Icon={Headphones}
          >
            <div
              className="rounded-2xl border px-3 py-3"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span
                className="block text-xs font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--color-secondary)" }}
              >
                Open tickets
              </span>
              <span
                className="mt-1 block text-xl font-semibold"
                style={{ color: "var(--color-primary)" }}
              >
                {ticketSummary.openCount}
              </span>
              <span
                className="mt-1 block text-xs font-semibold"
                style={{ color: "var(--color-secondary)" }}
              >
                {ticketSummary.unreadCount} ongelezen bericht
                {ticketSummary.unreadCount === 1 ? "" : "en"}
              </span>
            </div>
            <Link
              href={generalSupportHref}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#E8FBFA] px-4 py-3 text-sm font-semibold text-[#087C79]"
            >
              <PlusCircle size={16} />
              Nieuw ticket
            </Link>
          </FocusPanel>
        </div>
      </section>

      <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        <SecondaryCard
          title="Recente opdrachten"
          href="/opdrachten"
          actionLabel="Alle opdrachten"
        >
          <div className="space-y-2.5">
            {recentAssignments.length > 0 ? (
              recentAssignments.map((assignment) => {
                const cfg = STATUS_COLOR[assignment.status] ?? {
                  bg: "#F1F5F9",
                  color: "#64748B",
                };
                return (
                  <Link
                    key={assignment.id}
                    href={`/opdrachten/${assignment.id}`}
                    className="flex items-center gap-3 rounded-2xl border px-3 py-3"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <FileText
                      size={17}
                      style={{ color: "var(--color-secondary)" }}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block font-mono text-xs font-semibold"
                        style={{ color: "var(--color-primary)" }}
                      >
                        {assignment.code}
                      </span>
                      <span
                        className="block truncate text-xs font-semibold"
                        style={{ color: "var(--color-secondary)" }}
                      >
                        {assignment.title} -{" "}
                        {formatDate(assignment.scheduledDate)}
                      </span>
                    </span>
                    <span
                      className="rounded-full px-2 py-1 text-[10px] font-semibold"
                      style={{ backgroundColor: cfg.bg, color: cfg.color }}
                    >
                      {STATUS_LABEL[assignment.status] ?? assignment.status}
                    </span>
                  </Link>
                );
              })
            ) : (
              <p
                className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold"
                style={{ color: "var(--color-secondary)" }}
              >
                Er zijn nog geen opdrachten.
              </p>
            )}
          </div>
        </SecondaryCard>

        {featureFlags.documents || featureFlags.reporting ? (
          <SecondaryCard
            title={
              featureFlags.documents && featureFlags.reporting
                ? "Documenten en rapportages"
                : featureFlags.documents
                  ? "Documenten"
                  : "Rapportages"
            }
            href={featureFlags.documents ? "/documenten" : "/rapporten"}
            actionLabel={featureFlags.documents ? "Documenten" : "Rapportages"}
          >
            <div className="space-y-2.5">
              {recentDocuments.length > 0 ? (
                recentDocuments.map((document) => (
                  <Link
                    key={document.id}
                    href="/documenten"
                    className="flex items-center gap-3 rounded-2xl border px-3 py-3"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <FileText
                      size={17}
                      style={{ color: "var(--color-secondary)" }}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-sm font-semibold"
                        style={{ color: "var(--color-primary)" }}
                      >
                        {document.name}
                      </span>
                      <span
                        className="block text-xs font-semibold"
                        style={{ color: "var(--color-secondary)" }}
                      >
                        {formatDateTime(document.createdAt)}
                      </span>
                    </span>
                  </Link>
                ))
              ) : recentReports.length > 0 ? (
                recentReports.map((report) => (
                  <Link
                    key={report.id}
                    href="/rapporten"
                    className="flex items-center gap-3 rounded-2xl border px-3 py-3"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <FileCheck2
                      size={17}
                      style={{ color: "var(--color-secondary)" }}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-sm font-semibold"
                        style={{ color: "var(--color-primary)" }}
                      >
                        {report.assignmentTitle}
                      </span>
                      <span
                        className="block text-xs font-semibold"
                        style={{ color: "var(--color-secondary)" }}
                      >
                        Rapportage - {formatDateTime(report.submittedAt)}
                      </span>
                    </span>
                  </Link>
                ))
              ) : (
                <p
                  className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold"
                  style={{ color: "var(--color-secondary)" }}
                >
                  Documenten en rapportages verschijnen hier zodra ze gedeeld
                  zijn.
                </p>
              )}
            </div>
          </SecondaryCard>
        ) : null}

        <SecondaryCard
          title="Objecten en activiteit"
          href="/objecten"
          actionLabel="Objecten"
        >
          <div className="space-y-2.5">
            {recentObjects.length > 0 ? (
              recentObjects.map((object, index) => (
                <Link
                  key={object.id}
                  href={`/objecten/${object.id}`}
                  className="flex items-center gap-3 rounded-2xl border p-2.5"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <span
                    className="flex h-12 w-14 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white"
                    style={{
                      background: ["#0E7490", "#155E75", "#0369A1"][index % 3],
                    }}
                  >
                    {object.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-sm font-semibold"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {object.name}
                    </span>
                    <span
                      className="block truncate text-xs font-semibold"
                      style={{ color: "var(--color-secondary)" }}
                    >
                      {[object.address, object.city]
                        .filter(Boolean)
                        .join(", ") || "Geen adres bekend"}
                    </span>
                  </span>
                </Link>
              ))
            ) : (
              <p
                className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold"
                style={{ color: "var(--color-secondary)" }}
              >
                Er zijn nog geen objecten gekoppeld.
              </p>
            )}

            {recentNotifications.length > 0 ? (
              <Link
                href="/meldingen"
                className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3"
              >
                <Bell size={16} style={{ color: "var(--color-secondary)" }} />
                <span className="min-w-0 flex-1">
                  <span
                    className="block line-clamp-1 text-sm font-semibold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {recentNotifications[0]?.title}
                  </span>
                  <span
                    className="block text-xs font-semibold"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    Laatste melding
                  </span>
                </span>
              </Link>
            ) : null}
          </div>
        </SecondaryCard>
      </section>
    </div>
  );
}
