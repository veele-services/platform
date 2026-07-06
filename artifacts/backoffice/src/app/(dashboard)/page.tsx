import type { Metadata } from "next";
import Link from "next/link";

import { getDashboardCounts, listAssignments } from "@/app/actions/assignments";
import {
  getAdministrationDashboardMetrics,
  getDashboardActionItems,
  getDashboardFinancials,
  getDashboardPayments,
  getDashboardRecentActivity,
  getDashboardStaffAvailability,
  getDashboardWeekCounts,
  getManagementDashboardMetrics,
  getPlanningDashboardMetrics,
  type ActivityEntry,
  type AdministrationDashboardMetrics,
  type DashboardActionItems,
  type DashboardFinancials,
  type DashboardPayments,
  type ManagementDashboardMetrics,
  type PlanningDashboardMetrics,
  type StaffAvailabilityEntry,
  type WeekDayCount,
} from "@/app/actions/dashboard";
import { listTenantReleases } from "@/app/actions/releases";
import { AssignmentStatusBadge } from "@/components/assignments/AssignmentStatusBadge";
import { DashboardRefresher } from "@/components/dashboard/DashboardRefresher";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Dashboard",
};

type DashboardCounts = {
  requested: number;
  plannable: number;
  inProgress: number;
  completedToday: number;
  open: number;
};

type SummaryCard = {
  label: string;
  value: string;
  helper: string;
  href?: string;
  accent: string;
};

type FocusMetric = {
  label: string;
  value: string;
  helper: string;
  href?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
};

const focusToneClass: Record<NonNullable<FocusMetric["tone"]>, string> = {
  neutral: "border-slate-100 bg-slate-50 text-slate-700",
  success: "border-emerald-100 bg-emerald-50 text-emerald-800",
  warning: "border-amber-100 bg-amber-50 text-amber-800",
  danger: "border-red-100 bg-red-50 text-red-800",
  info: "border-sky-100 bg-sky-50 text-sky-800",
};

const availabilityConfig: Record<string, { label: string; className: string }> = {
  beschikbaar: {
    label: "Beschikbaar",
    className: "bg-emerald-50 text-emerald-700",
  },
  niet_beschikbaar: {
    label: "Niet beschikbaar",
    className: "bg-red-50 text-red-700",
  },
  op_verlof: {
    label: "Op verlof",
    className: "bg-amber-50 text-amber-700",
  },
  ziek: {
    label: "Ziek",
    className: "bg-violet-50 text-violet-700",
  },
  niet_ingesteld: {
    label: "Niet ingesteld",
    className: "bg-slate-100 text-slate-600",
  },
};

function formatEuro(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "zojuist";
  if (minutes < 60) return `${minutes}m geleden`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}u geleden`;

  const days = Math.floor(hours / 24);
  return `${days}d geleden`;
}

export default async function DashboardPage() {
  const canRead = await hasPermission("dashboard", "read");
  if (!canRead) return <ForbiddenPage resource="dashboard" action="read" />;

  const canReadAssignments = await hasPermission("assignments", "read");
  const canReadPersonnel = await hasPermission("personnel", "read");
  const canReadSettings = await hasPermission("settings", "read");
  const canReadReleases = await hasPermission("releases", "view");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  const emptyCounts: DashboardCounts = {
    requested: 0,
    plannable: 0,
    inProgress: 0,
    completedToday: 0,
    open: 0,
  };

  const [
    counts,
    financials,
    payments,
    actionItems,
    staffAvailability,
    recentActivity,
    weekCounts,
    managementMetrics,
    planningMetrics,
    administrationMetrics,
    releases,
  ] = await Promise.all([
    canReadAssignments ? getDashboardCounts().catch(() => emptyCounts) : Promise.resolve(emptyCounts),
    getDashboardFinancials().catch(() => null as DashboardFinancials | null),
    getDashboardPayments().catch(() => null as DashboardPayments | null),
    getDashboardActionItems().catch(() => null as DashboardActionItems | null),
    canReadPersonnel
      ? getDashboardStaffAvailability(todayStr).catch(() => [] as StaffAvailabilityEntry[])
      : Promise.resolve([] as StaffAvailabilityEntry[]),
    canReadSettings
      ? getDashboardRecentActivity(10).catch(() => [] as ActivityEntry[])
      : Promise.resolve([] as ActivityEntry[]),
    canReadAssignments
      ? getDashboardWeekCounts().catch(() => [] as WeekDayCount[])
      : Promise.resolve([] as WeekDayCount[]),
    getManagementDashboardMetrics().catch(() => null as ManagementDashboardMetrics | null),
    getPlanningDashboardMetrics().catch(() => null as PlanningDashboardMetrics | null),
    getAdministrationDashboardMetrics().catch(() => null as AdministrationDashboardMetrics | null),
    canReadReleases ? listTenantReleases().catch(() => []) : Promise.resolve([]),
  ]);

  const totalStaff = staffAvailability.length;
  const availableCount = staffAvailability.filter((member) => member.status === "beschikbaar").length;
  const unavailableCount = staffAvailability.filter(
    (member) =>
      member.status === "niet_beschikbaar" ||
      member.status === "op_verlof" ||
      member.status === "ziek",
  ).length;
  const actionCount = actionItems
    ? [
        actionItems.canReadReports ? actionItems.pendingReports : 0,
        actionItems.canReadInvoices ? actionItems.invoicesToSend : 0,
        actionItems.canReadQuotes ? actionItems.pendingQuotes : 0,
        actionItems.canReadAssignments ? actionItems.plannableNoPersonnel : 0,
      ].reduce((sum, value) => sum + value, 0)
    : 0;
  const weeklyAssignmentCount = weekCounts.reduce((sum, day) => sum + day.count, 0);
  const todayWeekCount = weekCounts.find((day) => day.isToday)?.count ?? 0;
  const todayDisplay = today.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dashboardSummaryCards: SummaryCard[] = [
    {
      label: "Aandacht nodig",
      value: String(actionCount),
      helper: actionCount === 0 ? "Geen urgente acties" : "Open acties in de inbox",
      href: actionCount > 0 ? "#actie-inbox" : undefined,
      accent: actionCount > 0 ? "#DC2626" : "#16A34A",
    },
    {
      label: "Open opdrachten",
      value: canReadAssignments ? String(counts.open) : "-",
      helper: canReadAssignments ? `${counts.inProgress} in uitvoering` : "Geen toegang",
      href: canReadAssignments ? "/assignments" : undefined,
      accent: "#0EA5E9",
    },
    {
      label: "Planbaar",
      value: canReadAssignments ? String(counts.plannable) : "-",
      helper: `${todayWeekCount} vandaag, ${weeklyAssignmentCount} deze week`,
      href: canReadAssignments ? "/planning" : undefined,
      accent: "#D97706",
    },
    {
      label: "Openstaand",
      value: financials ? formatEuro(financials.outstandingAmount) : "-",
      helper: financials ? `${financials.outstandingCount} facturen` : "Geen finance-data",
      href: financials ? "/invoices?status=sent" : undefined,
      accent: financials && financials.outstandingAmount > 0 ? "#DC2626" : "#16A34A",
    },
    {
      label: "Beschikbaar",
      value: totalStaff > 0 ? `${availableCount}/${totalStaff}` : "-",
      helper: totalStaff > 0 ? `${unavailableCount} niet beschikbaar` : "Geen personeelsdata",
      href: totalStaff > 0 ? "/personnel" : undefined,
      accent: availableCount > unavailableCount ? "#16A34A" : "#D97706",
    },
  ];

  return (
    <TenantPageShell size="wide" className="gap-5">
      <TenantPageHeader
        title="Dashboard"
        eyebrow="Tenant command center"
        description={`Rustig operationeel overzicht voor ${todayDisplay}. Begin bij de inbox en stuur daarna op planning, finance en tickets.`}
        actions={<DashboardRefresher />}
      />

      <DashboardSummaryStrip cards={dashboardSummaryCards} />

      <section
        id="actie-inbox"
        className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]"
      >
        {actionItems ? (
          <ActionItemsPanel items={actionItems} />
        ) : (
          <DashboardPanel title="Vandaag aandacht nodig" subtitle="Acties zijn nog niet beschikbaar voor deze rol.">
            <p className="text-sm text-muted-foreground">Er is geen inboxdata geladen.</p>
          </DashboardPanel>
        )}

        <div className="grid grid-cols-1 gap-4">
          <PlanningFocusPanel
            metrics={planningMetrics}
            counts={counts}
            weekCounts={weekCounts}
            canReadAssignments={canReadAssignments}
          />
          <FinanceFocusPanel
            financials={financials}
            payments={payments}
            administrationMetrics={administrationMetrics}
          />
          <TicketFocusPanel managementMetrics={managementMetrics} actionItems={actionItems} />
        </div>
      </section>

      <section className="space-y-4 pt-2">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-semibold text-foreground">Secundair overzicht</h2>
          <p className="text-sm text-muted-foreground">
            Context en recente signalen staan lager op de pagina zodat de eerste viewport rustig blijft.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {weekCounts.length > 0 && <WeekOverviewPanel weekCounts={weekCounts} />}

          <DashboardPanel
            title="Recente opdrachten"
            subtitle={canReadAssignments ? "Laatste aangemaakte opdrachten." : "Geen toegang tot opdrachten."}
            href={canReadAssignments ? "/assignments" : undefined}
            linkLabel="Alle opdrachten"
            className="xl:col-span-2"
          >
            {canReadAssignments ? (
              <RecentAssignments />
            ) : (
              <p className="text-sm text-muted-foreground">Geen toegang tot opdrachten.</p>
            )}
          </DashboardPanel>

          {totalStaff > 0 && (
            <StaffAvailabilityPanel
              staffAvailability={staffAvailability}
              availableCount={availableCount}
              unavailableCount={unavailableCount}
              totalStaff={totalStaff}
            />
          )}

          {canReadReleases && <LatestReleasePanel releases={releases.slice(0, 3)} />}

          {recentActivity.length > 0 && <ActivityPanel entries={recentActivity} />}
        </div>
      </section>
    </TenantPageShell>
  );
}

function LatestReleasePanel({ releases }: { releases: Awaited<ReturnType<typeof listTenantReleases>> }) {
  const latest = releases[0] ?? null;

  return (
    <DashboardPanel title="Release notes" subtitle="Laatste wijzigingen voor uw actieve modules." href="/releases" linkLabel="Alle releases">
      {latest ? (
        <div className="space-y-3">
          <Link href={`/releases/${latest.slug}`} className="block rounded-lg border border-cyan-100 bg-cyan-50 p-3 transition hover:bg-cyan-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">{latest.version}</p>
            <h3 className="mt-1 font-heading text-base font-semibold text-slate-950">{latest.title}</h3>
            {latest.summary && <p className="mt-1 text-sm leading-6 text-slate-600">{latest.summary}</p>}
          </Link>
          {releases.slice(1).map((release) => (
            <Link key={release.id} href={`/releases/${release.slug}`} className="block text-sm font-medium text-slate-700 hover:underline">
              {release.version} - {release.title}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nog geen release notes zichtbaar voor deze tenant.</p>
      )}
    </DashboardPanel>
  );
}

function DashboardSummaryStrip({ cards }: { cards: SummaryCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const content = (
          <>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {card.label}
            </span>
            <span className="mt-2 block font-heading text-2xl font-bold" style={{ color: card.accent }}>
              {card.value}
            </span>
            <span className="mt-1 block text-xs leading-snug text-muted-foreground">{card.helper}</span>
          </>
        );

        if (card.href) {
          return (
            <Link
              key={card.label}
              href={card.href}
              className="rounded-lg border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-md"
            >
              {content}
            </Link>
          );
        }

        return (
          <div key={card.label} className="rounded-lg border border-border bg-card p-4 shadow-card">
            {content}
          </div>
        );
      })}
    </div>
  );
}

function DashboardPanel({
  title,
  subtitle,
  href,
  linkLabel = "Open",
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`veele-card p-4 sm:p-6 ${className}`}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="shrink-0 text-xs font-medium text-primary hover:underline">
            {linkLabel}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function PlanningFocusPanel({
  metrics,
  counts,
  weekCounts,
  canReadAssignments,
}: {
  metrics: PlanningDashboardMetrics | null;
  counts: DashboardCounts;
  weekCounts: WeekDayCount[];
  canReadAssignments: boolean;
}) {
  const weekTotal = weekCounts.reduce((sum, day) => sum + day.count, 0);
  const focusMetrics: FocusMetric[] = [
    {
      label: "Planbaar",
      value: canReadAssignments ? String(counts.plannable) : "-",
      helper: "Opdrachten klaar voor planning",
      href: canReadAssignments ? "/planning" : undefined,
      tone: counts.plannable > 0 ? "warning" : "neutral",
    },
    {
      label: "Deze week",
      value: String(weekTotal),
      helper: "Opdrachten in weekplanning",
      href: "/planning",
      tone: "info",
    },
  ];

  if (metrics?.canReadPersonnel) {
    focusMetrics.push({
      label: "Beschikbaar",
      value: String(metrics.availablePersonnelToday),
      helper: `${metrics.leaveOrSickImpactToday} verlof/ziekte-impact`,
      href: "/personnel",
      tone: metrics.leaveOrSickImpactToday > 0 ? "warning" : "success",
    });
  }

  if (metrics) {
    focusMetrics.push({
      label: "Interesse",
      value: String(metrics.activeInterestRounds),
      helper: `${metrics.interestedResponses} reacties`,
      href: "/planning",
      tone: metrics.activeInterestRounds > 0 ? "info" : "neutral",
    });
  }

  return (
    <DashboardPanel title="Planning" subtitle="Capaciteit, weekdruk en planbare opdrachten." href="/planning">
      <FocusMetricGrid metrics={focusMetrics} />
      {metrics && metrics.capacityBySector.length > 0 && (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Capaciteit per sector
          </p>
          {metrics.capacityBySector.slice(0, 3).map((row) => {
            const total = row.green + row.orange + row.red;
            return (
              <div key={row.sector}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-medium text-foreground">{row.sector}</span>
                  <span className="text-muted-foreground">
                    {row.green}/{row.orange}/{row.red}
                  </span>
                </div>
                <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-white">
                  <div
                    style={{
                      width: `${total ? (row.green / total) * 100 : 0}%`,
                      backgroundColor: "#16A34A",
                    }}
                  />
                  <div
                    style={{
                      width: `${total ? (row.orange / total) * 100 : 0}%`,
                      backgroundColor: "#F59E0B",
                    }}
                  />
                  <div
                    style={{
                      width: `${total ? (row.red / total) * 100 : 0}%`,
                      backgroundColor: "#DC2626",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardPanel>
  );
}

function FinanceFocusPanel({
  financials,
  payments,
  administrationMetrics,
}: {
  financials: DashboardFinancials | null;
  payments: DashboardPayments | null;
  administrationMetrics: AdministrationDashboardMetrics | null;
}) {
  const focusMetrics: FocusMetric[] = [
    {
      label: "Omzet maand",
      value: financials ? formatEuro(financials.revenueThisMonth) : "-",
      helper:
        financials && financials.deltaPercent !== null
          ? `${financials.deltaPercent >= 0 ? "+" : ""}${financials.deltaPercent}% vs vorige maand`
          : "Geen vergelijkingsdata",
      href: "/invoices",
      tone: "success",
    },
    {
      label: "Openstaand",
      value: financials ? formatEuro(financials.outstandingAmount) : "-",
      helper: financials ? `${financials.outstandingCount} facturen` : "Geen finance-data",
      href: "/invoices?status=sent",
      tone: financials && financials.outstandingAmount > 0 ? "danger" : "success",
    },
    {
      label: "Achterstallig",
      value: payments ? formatEuro(payments.overdueAmount) : "-",
      helper: payments ? `${payments.overdueCount} vervallen` : "Geen betaaldata",
      href: "/invoices?status=sent",
      tone: payments && payments.overdueCount > 0 ? "danger" : "success",
    },
  ];

  if (administrationMetrics) {
    focusMetrics.push({
      label: "Factuurvoorstellen",
      value: String(administrationMetrics.invoiceProposals),
      helper: `${administrationMetrics.draftInvoices} conceptfacturen`,
      href: "/invoices?status=draft",
      tone: administrationMetrics.invoiceProposals > 0 ? "warning" : "neutral",
    });
  }

  return (
    <DashboardPanel title="Finance" subtitle="Facturatie, betaling en administratieve controle." href="/invoices">
      <FocusMetricGrid metrics={focusMetrics} />
    </DashboardPanel>
  );
}

function TicketFocusPanel({
  managementMetrics,
  actionItems,
}: {
  managementMetrics: ManagementDashboardMetrics | null;
  actionItems: DashboardActionItems | null;
}) {
  const focusMetrics: FocusMetric[] = [
    {
      label: "Open tickets",
      value: managementMetrics?.canReadTickets ? String(managementMetrics.openTickets) : "-",
      helper: "Klant- en personeelsmeldingen",
      href: "/tickets",
      tone: managementMetrics && managementMetrics.openTickets > 0 ? "warning" : "success",
    },
    {
      label: "Rapportcontrole",
      value: actionItems?.canReadReports ? String(actionItems.pendingReports) : "-",
      helper: "Rapporten wachten op beoordeling",
      href: "/reports?status=submitted",
      tone: actionItems && actionItems.pendingReports > 0 ? "warning" : "success",
    },
    {
      label: "Offertes",
      value: actionItems?.canReadQuotes ? String(actionItems.pendingQuotes) : "-",
      helper: "Wachten op goedkeuring",
      href: "/quotes?status=sent",
      tone: actionItems && actionItems.pendingQuotes > 0 ? "info" : "neutral",
    },
  ];

  return (
    <DashboardPanel title="Tickets en controles" subtitle="Meldingen, rapporten en klantreacties." href="/tickets">
      <FocusMetricGrid metrics={focusMetrics} />
    </DashboardPanel>
  );
}

function FocusMetricGrid({ metrics }: { metrics: FocusMetric[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {metrics.map((metric) => {
        const tone = focusToneClass[metric.tone ?? "neutral"];
        const content = (
          <>
            <span className="text-[11px] font-semibold uppercase tracking-wide opacity-75">{metric.label}</span>
            <span className="mt-1 block font-heading text-xl font-bold">{metric.value}</span>
            <span className="mt-1 block text-xs leading-snug opacity-75">{metric.helper}</span>
          </>
        );

        if (metric.href) {
          return (
            <Link key={`${metric.label}-${metric.href}`} href={metric.href} className={`rounded-lg border p-3 ${tone}`}>
              {content}
            </Link>
          );
        }

        return (
          <div key={metric.label} className={`rounded-lg border p-3 ${tone}`}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

function ActionItemsPanel({ items }: { items: DashboardActionItems }) {
  const actionLinks = [
    items.canReadReports &&
      items.pendingReports > 0 && {
        href: "/reports?status=submitted",
        label: `${items.pendingReports} rapport${items.pendingReports !== 1 ? "en" : ""} te beoordelen`,
        helper: "Controleer rapportage en materiaalregels.",
        tone: "danger" as const,
      },
    items.canReadInvoices &&
      items.invoicesToSend > 0 && {
        href: "/invoices?status=draft",
        label: `${items.invoicesToSend} factuur${items.invoicesToSend !== 1 ? "en" : ""} klaar om te verzenden`,
        helper: "Controleer concepten en verstuur waar nodig.",
        tone: "warning" as const,
      },
    items.canReadQuotes &&
      items.pendingQuotes > 0 && {
        href: "/quotes?status=sent",
        label: `${items.pendingQuotes} offerte${items.pendingQuotes !== 1 ? "s" : ""} wachten op goedkeuring`,
        helper: "Volg klantreacties en openstaande offertes.",
        tone: "info" as const,
      },
    items.canReadAssignments &&
      items.plannableNoPersonnel > 0 && {
        href: "/planning",
        label: `${items.plannableNoPersonnel} inplanbare opdracht${items.plannableNoPersonnel !== 1 ? "en" : ""} zonder personeel`,
        helper: "Koppel medewerkers voordat de planning vastloopt.",
        tone: "warning" as const,
      },
  ].filter(Boolean) as Array<{
    href: string;
    label: string;
    helper: string;
    tone: NonNullable<FocusMetric["tone"]>;
  }>;

  return (
    <DashboardPanel
      title="Vandaag aandacht nodig"
      subtitle="De belangrijkste acties staan bovenaan; de rest van het dashboard is context."
    >
      {actionLinks.length === 0 ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-5 text-center text-emerald-800">
          <p className="font-medium">Alles bijgewerkt</p>
          <p className="mt-1 text-sm opacity-75">Geen openstaande actiepunten.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {actionLinks.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-start justify-between gap-3 rounded-lg border p-3 transition-shadow hover:shadow-sm ${
                  focusToneClass[item.tone]
                }`}
              >
                <span>
                  <span className="block text-sm font-semibold leading-snug">{item.label}</span>
                  <span className="mt-1 block text-xs leading-snug opacity-75">{item.helper}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold">Open</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}

function WeekOverviewPanel({ weekCounts }: { weekCounts: WeekDayCount[] }) {
  return (
    <DashboardPanel title="Weekplanning" subtitle="Dagdruk voor de komende week." href="/planning" linkLabel="Planning">
      <div className="grid grid-cols-7 gap-2">
        {weekCounts.map((day) => (
          <Link
            key={day.date}
            href={`/planning?day=${day.date}`}
            className={`rounded-lg border px-2 py-3 text-center transition-colors hover:bg-slate-50 ${
              day.isToday ? "border-sky-200 bg-sky-50" : "border-slate-100 bg-white"
            }`}
          >
            <span className="block text-[11px] font-medium text-muted-foreground">{day.dayLabel}</span>
            <span className="mt-1 block font-heading text-lg font-bold text-foreground">{day.count}</span>
          </Link>
        ))}
      </div>
    </DashboardPanel>
  );
}

function StaffAvailabilityPanel({
  staffAvailability,
  availableCount,
  unavailableCount,
  totalStaff,
}: {
  staffAvailability: StaffAvailabilityEntry[];
  availableCount: number;
  unavailableCount: number;
  totalStaff: number;
}) {
  return (
    <DashboardPanel
      title="Personeelsbeschikbaarheid"
      subtitle={`${availableCount} beschikbaar, ${unavailableCount} niet beschikbaar, ${totalStaff} totaal.`}
      href="/personnel"
      linkLabel="Personeel"
      className="xl:col-span-2"
    >
      <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
        {staffAvailability.map((member) => {
          const config = availabilityConfig[member.status] ?? availabilityConfig.niet_ingesteld;
          return (
            <div key={member.personnelId} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <span className="truncate text-sm font-medium text-foreground">{member.name}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
                {config.label}
              </span>
            </div>
          );
        })}
      </div>
    </DashboardPanel>
  );
}

function ActivityPanel({ entries }: { entries: ActivityEntry[] }) {
  return (
    <DashboardPanel title="Activiteit" subtitle="Recente systeem- en gebruikersacties." href="/instellingen/activiteitslog" linkLabel="Alles">
      <ol className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="flex gap-3">
            <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium leading-snug text-foreground">{entry.actionLabel}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {entry.userName} - {timeSince(entry.createdAt)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </DashboardPanel>
  );
}

async function RecentAssignments() {
  try {
    const { rows } = await listAssignments({
      page: 1,
      sort: "createdAt",
      dir: "desc",
    });
    const recent = rows.slice(0, 6);

    if (recent.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          Nog geen opdrachten aangemaakt. Maak een{" "}
          <Link href="/assignments" className="text-primary underline">
            eerste opdracht
          </Link>{" "}
          aan om te beginnen.
        </p>
      );
    }

    return (
      <ul className="divide-y divide-slate-100">
        {recent.map((assignment) => (
          <li key={assignment.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <Link
                href={`/assignments/${assignment.id}`}
                className="block truncate text-sm font-medium text-foreground hover:underline"
              >
                {assignment.title}
              </Link>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {assignment.customerName}
                {assignment.scheduledDate &&
                  ` - ${new Date(`${assignment.scheduledDate}T00:00:00`).toLocaleDateString("nl-NL", {
                    day: "numeric",
                    month: "short",
                  })}`}
              </p>
            </div>
            <div className="sm:shrink-0">
              <AssignmentStatusBadge status={assignment.status} />
            </div>
          </li>
        ))}
      </ul>
    );
  } catch {
    return (
      <p className="text-sm text-muted-foreground">
        Opdrachtgegevens nog niet beschikbaar. Voer eerst de databasemigratie uit.
      </p>
    );
  }
}
