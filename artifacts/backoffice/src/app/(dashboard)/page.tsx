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
import {
  DashboardPersonaFocus,
  DashboardResumePanel,
  type DashboardPersona,
} from "@/components/dashboard/DashboardExperience";
import { DashboardRefresher } from "@/components/dashboard/DashboardRefresher";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { ResolvedFeatureHelp } from "@/components/knowledgebase/ResolvedFeatureHelp";
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
  tone: NonNullable<FocusMetric["tone"]>;
};

type FocusMetric = {
  label: string;
  value: string;
  helper: string;
  href?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
};

const focusToneClass: Record<NonNullable<FocusMetric["tone"]>, string> = {
  neutral: "border-border text-foreground",
  success: "border-emerald-500 text-foreground",
  warning: "border-amber-500 text-foreground",
  danger: "border-red-500 text-foreground",
  info: "border-sky-500 text-foreground",
};

const summaryToneClass: Record<NonNullable<FocusMetric["tone"]>, string> = {
  neutral: "text-foreground",
  success: "text-emerald-700",
  warning: "text-amber-700",
  danger: "text-destructive",
  info: "text-sky-700",
};

const availabilityConfig: Record<string, { label: string; className: string }> =
  {
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
      label: "Niet inzetbaar",
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

function todayInAmsterdam(): { key: string; date: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const key = `${value.year}-${value.month}-${value.day}`;
  return { key, date: new Date(`${key}T12:00:00Z`) };
}

export default async function DashboardPage() {
  const canRead = await hasPermission("dashboard", "read");
  if (!canRead) return <ForbiddenPage resource="dashboard" action="read" />;

  const [
    canReadAssignments,
    canReadPersonnel,
    canReadSettings,
    canReadReleases,
    canReadPlanning,
    canReadInvoices,
  ] = await Promise.all([
    hasPermission("assignments", "read"),
    hasPermission("personnel", "read"),
    hasPermission("settings", "read"),
    hasPermission("releases", "view"),
    hasPermission("planning", "read"),
    hasPermission("invoices", "read"),
  ]);

  const { key: todayStr, date: today } = todayInAmsterdam();

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
    canReadAssignments
      ? getDashboardCounts().catch(() => emptyCounts)
      : Promise.resolve(emptyCounts),
    getDashboardFinancials().catch(() => null as DashboardFinancials | null),
    getDashboardPayments().catch(() => null as DashboardPayments | null),
    getDashboardActionItems().catch(() => null as DashboardActionItems | null),
    canReadPersonnel
      ? getDashboardStaffAvailability(todayStr).catch(
          () => [] as StaffAvailabilityEntry[],
        )
      : Promise.resolve([] as StaffAvailabilityEntry[]),
    canReadSettings
      ? getDashboardRecentActivity(10).catch(() => [] as ActivityEntry[])
      : Promise.resolve([] as ActivityEntry[]),
    canReadAssignments
      ? getDashboardWeekCounts().catch(() => [] as WeekDayCount[])
      : Promise.resolve([] as WeekDayCount[]),
    getManagementDashboardMetrics().catch(
      () => null as ManagementDashboardMetrics | null,
    ),
    getPlanningDashboardMetrics().catch(
      () => null as PlanningDashboardMetrics | null,
    ),
    getAdministrationDashboardMetrics().catch(
      () => null as AdministrationDashboardMetrics | null,
    ),
    canReadReleases
      ? listTenantReleases().catch(() => [])
      : Promise.resolve([]),
  ]);

  const totalStaff = staffAvailability.length;
  const availableCount = staffAvailability.filter(
    (member) => member.status === "beschikbaar",
  ).length;
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
  const weeklyAssignmentCount = weekCounts.reduce(
    (sum, day) => sum + day.count,
    0,
  );
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
      helper:
        actionCount === 0 ? "Geen urgente acties" : "Open acties in de inbox",
      href: actionCount > 0 ? "#actie-inbox" : undefined,
      tone: actionCount > 0 ? "danger" : "success",
    },
    {
      label: "Open opdrachten",
      value: canReadAssignments ? String(counts.open) : "-",
      helper: canReadAssignments
        ? `${counts.inProgress} in uitvoering`
        : "Geen toegang",
      href: canReadAssignments ? "/assignments" : undefined,
      tone: "info",
    },
    {
      label: "Planbaar",
      value: canReadAssignments ? String(counts.plannable) : "-",
      helper: `${todayWeekCount} vandaag, ${weeklyAssignmentCount} deze week`,
      href: canReadAssignments ? "/planning" : undefined,
      tone: "warning",
    },
    {
      label: "Openstaand",
      value: financials ? formatEuro(financials.outstandingAmount) : "-",
      helper: financials
        ? `${financials.outstandingCount} facturen`
        : "Geen finance-data",
      href: financials ? "/invoices?status=sent" : undefined,
      tone:
        financials && financials.outstandingAmount > 0 ? "danger" : "success",
    },
    {
      label: "Beschikbaar",
      value: totalStaff > 0 ? `${availableCount}/${totalStaff}` : "-",
      helper:
        totalStaff > 0
          ? `${unavailableCount} niet beschikbaar`
          : "Geen personeelsdata",
      href: totalStaff > 0 ? "/personnel" : undefined,
      tone: availableCount > unavailableCount ? "success" : "warning",
    },
  ];
  const defaultPersona: DashboardPersona =
    canReadPlanning
      ? "planner"
      : canReadInvoices
        ? "administration"
        : canReadSettings
          ? "management"
          : "all";

  return (
    <TenantPageShell size="wide" className="gap-5">
      <TenantPageHeader
        title="Dashboard"
        description={`Vandaag, ${todayDisplay} · prioriteiten en actuele werkcontext`}
        badges={
          <ResolvedFeatureHelp
            featureKey="tenant.dashboard"
            moduleKey="knowledgebase"
          />
        }
        actions={<DashboardRefresher />}
      />

      <DashboardSummaryStrip cards={dashboardSummaryCards} />

      <section
        id="actie-inbox"
        className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]"
      >
        {actionItems ? (
          <ActionItemsPanel items={actionItems} />
        ) : (
          <DashboardPanel
            title="Vandaag aandacht nodig"
            subtitle="Acties zijn nog niet beschikbaar voor deze rol."
          >
            <p className="text-sm text-muted-foreground">
              Er is geen inboxdata geladen.
            </p>
          </DashboardPanel>
        )}

        <DashboardPersonaFocus
          defaultPersona={defaultPersona}
          planning={
            <PlanningFocusPanel
              metrics={planningMetrics}
              counts={counts}
              weekCounts={weekCounts}
              canReadAssignments={canReadAssignments}
            />
          }
          administration={
            <FinanceFocusPanel
              financials={financials}
              payments={payments}
              administrationMetrics={administrationMetrics}
            />
          }
          management={
            <TicketFocusPanel
              managementMetrics={managementMetrics}
              actionItems={actionItems}
            />
          }
        />
      </section>

      <section className="space-y-4 border-t border-border pt-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            Recente signalen
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <DashboardPanel
            title="Doorgaan waar ik was"
            subtitle="Alleen in deze browser bewaarde, recent bekeken werkcontext."
            className="xl:col-span-3"
          >
            <DashboardResumePanel />
          </DashboardPanel>

          {weekCounts.length > 0 && (
            <WeekOverviewPanel weekCounts={weekCounts} />
          )}

          <DashboardPanel
            title="Recente opdrachten"
            subtitle={
              canReadAssignments
                ? "Laatste aangemaakte opdrachten."
                : "Geen toegang tot opdrachten."
            }
            href={canReadAssignments ? "/assignments" : undefined}
            linkLabel="Alle opdrachten"
            className="xl:col-span-2"
          >
            {canReadAssignments ? (
              <RecentAssignments />
            ) : (
              <p className="text-sm text-muted-foreground">
                Geen toegang tot opdrachten.
              </p>
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

          {canReadReleases && (
            <LatestReleasePanel releases={releases.slice(0, 3)} />
          )}

          {recentActivity.length > 0 && (
            <ActivityPanel entries={recentActivity} />
          )}
        </div>
      </section>
    </TenantPageShell>
  );
}

function LatestReleasePanel({
  releases,
}: {
  releases: Awaited<ReturnType<typeof listTenantReleases>>;
}) {
  const latest = releases[0] ?? null;

  return (
    <DashboardPanel
      title="Release notes"
      subtitle="Laatste wijzigingen voor uw actieve modules."
      href="/releases"
      linkLabel="Alle releases"
    >
      {latest ? (
        <div className="space-y-3">
          <Link
            href={`/releases/${latest.slug}`}
            className="block rounded-lg border border-cyan-100 bg-cyan-50 p-3 transition hover:bg-cyan-100"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
              {latest.version}
            </p>
            <h3 className="mt-1 font-heading text-base font-semibold text-slate-950">
              {latest.title}
            </h3>
            {latest.summary && (
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {latest.summary}
              </p>
            )}
          </Link>
          {releases.slice(1).map((release) => (
            <Link
              key={release.id}
              href={`/releases/${release.slug}`}
              className="block text-sm font-medium text-slate-700 hover:underline"
            >
              {release.version} - {release.title}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nog geen release notes zichtbaar voor deze organisatie.
        </p>
      )}
    </DashboardPanel>
  );
}

function DashboardSummaryStrip({ cards }: { cards: SummaryCard[] }) {
  return (
    <div className="grid overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const content = (
          <>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {card.label}
            </span>
            <span
              className={`mt-2 block font-heading text-2xl font-bold ${summaryToneClass[card.tone]}`}
            >
              {card.value}
            </span>
            <span className="mt-1 block text-xs leading-snug text-muted-foreground">
              {card.helper}
            </span>
          </>
        );

        if (card.href) {
          return (
            <Link
              key={card.label}
              href={card.href}
              className="border-b border-border p-3.5 transition-colors hover:bg-muted/70 focus-visible:z-10 sm:border-r xl:border-b-0"
            >
              {content}
            </Link>
          );
        }

        return (
          <div
            key={card.label}
            className="border-b border-border p-3.5 sm:border-r xl:border-b-0"
          >
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
          <h2 className="font-heading text-base font-semibold text-foreground">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {href && (
          <Link
            href={href}
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
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
      helper: `${metrics.leaveOrSickImpactToday} afwezig of niet inzetbaar`,
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
    <DashboardPanel
      title="Planning"
      subtitle="Capaciteit, weekdruk en planbare opdrachten."
      href="/planning"
    >
      <FocusMetricGrid metrics={focusMetrics} />
      {metrics && metrics.capacityBySector.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Capaciteit per sector
          </p>
          {metrics.capacityBySector.slice(0, 3).map((row) => {
            const total = row.green + row.orange + row.red;
            return (
              <div key={row.sector}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-medium text-foreground">
                    {row.sector}
                  </span>
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
      helper: financials
        ? `${financials.outstandingCount} facturen`
        : "Geen finance-data",
      href: "/invoices?status=sent",
      tone:
        financials && financials.outstandingAmount > 0 ? "danger" : "success",
    },
    {
      label: "Achterstallig",
      value: payments ? formatEuro(payments.overdueAmount) : "-",
      helper: payments
        ? `${payments.overdueCount} vervallen`
        : "Geen betaaldata",
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
    <DashboardPanel
      title="Finance"
      subtitle="Facturatie, betaling en administratieve controle."
      href="/invoices"
    >
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
      value: managementMetrics?.canReadTickets
        ? String(managementMetrics.openTickets)
        : "-",
      helper: "Klant- en personeelsmeldingen",
      href: "/tickets",
      tone:
        managementMetrics && managementMetrics.openTickets > 0
          ? "warning"
          : "success",
    },
    {
      label: "Rapportcontrole",
      value: actionItems?.canReadReports
        ? String(actionItems.pendingReports)
        : "-",
      helper: "Rapporten wachten op beoordeling",
      href: "/reports?status=submitted",
      tone:
        actionItems && actionItems.pendingReports > 0 ? "warning" : "success",
    },
    {
      label: "Offertes",
      value: actionItems?.canReadQuotes
        ? String(actionItems.pendingQuotes)
        : "-",
      helper: "Wachten op goedkeuring",
      href: "/quotes?status=sent",
      tone: actionItems && actionItems.pendingQuotes > 0 ? "info" : "neutral",
    },
  ];

  return (
    <DashboardPanel
      title="Tickets en controles"
      subtitle="Meldingen, rapporten en klantreacties."
      href="/tickets"
    >
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
            <span className="text-[11px] font-semibold uppercase tracking-wide opacity-75">
              {metric.label}
            </span>
            <span className="mt-1 block font-heading text-xl font-bold">
              {metric.value}
            </span>
            <span className="mt-1 block text-xs leading-snug opacity-75">
              {metric.helper}
            </span>
          </>
        );

        if (metric.href) {
          return (
            <Link
              key={`${metric.label}-${metric.href}`}
              href={metric.href}
              className={`border-l-2 px-3 py-2.5 transition-colors hover:bg-muted/60 ${tone}`}
            >
              {content}
            </Link>
          );
        }

        return (
          <div key={metric.label} className={`border-l-2 px-3 py-2.5 ${tone}`}>
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
        owner: "Administratie",
        urgency: "Vandaag",
        tone: "danger" as const,
      },
    items.canReadInvoices &&
      items.invoicesToSend > 0 && {
        href: "/invoices?status=draft",
        label: `${items.invoicesToSend} factuur${items.invoicesToSend !== 1 ? "en" : ""} klaar om te verzenden`,
        helper: "Controleer concepten en verstuur waar nodig.",
        owner: "Administratie",
        urgency: "Vandaag",
        tone: "warning" as const,
      },
    items.canReadQuotes &&
      items.pendingQuotes > 0 && {
        href: "/quotes?status=sent",
        label: `${items.pendingQuotes} offerte${items.pendingQuotes !== 1 ? "s" : ""} wachten op goedkeuring`,
        helper: "Volg klantreacties en openstaande offertes.",
        owner: "Relatiebeheer",
        urgency: "Binnen 1 werkdag",
        tone: "info" as const,
      },
    items.canReadAssignments &&
      items.plannableNoPersonnel > 0 && {
        href: "/planning",
        label: `${items.plannableNoPersonnel} inplanbare opdracht${items.plannableNoPersonnel !== 1 ? "en" : ""} zonder personeel`,
        helper: "Koppel medewerkers voordat de planning vastloopt.",
        owner: "Planner",
        urgency: "Voor de startdatum",
        tone: "warning" as const,
      },
  ].filter(Boolean) as Array<{
    href: string;
    label: string;
    helper: string;
    owner: string;
    urgency: string;
    tone: NonNullable<FocusMetric["tone"]>;
  }>;

  return (
    <DashboardPanel
      title="Vandaag aandacht nodig"
      subtitle="Gesorteerd op urgentie en eigenaar."
    >
      {actionLinks.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/50 px-4 py-5 text-center text-foreground">
          <p className="font-medium">Alles bijgewerkt</p>
          <p className="mt-1 text-sm opacity-75">
            Geen openstaande actiepunten.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {actionLinks.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-start justify-between gap-3 border-l-2 px-3 py-3 transition-colors hover:bg-muted/60 ${
                  focusToneClass[item.tone]
                }`}
              >
                <span>
                  <span className="block text-sm font-semibold leading-snug">
                    {item.label}
                  </span>
                  <span className="mt-1 block text-xs leading-snug opacity-75">
                    {item.helper}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium opacity-80">
                    <span>Eigenaar: {item.owner}</span>
                    <span aria-hidden="true">·</span>
                    <span>Urgentie: {item.urgency}</span>
                  </span>
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
    <DashboardPanel
      title="Weekplanning"
      subtitle="Dagdruk voor de komende week."
      href="/planning"
      linkLabel="Planning"
    >
      <div className="grid grid-cols-7 gap-2">
        {weekCounts.map((day) => (
          <Link
            key={day.date}
            href={`/planning?day=${day.date}`}
            className={`rounded-lg border px-2 py-3 text-center transition-colors hover:bg-slate-50 ${
              day.isToday
                ? "border-sky-200 bg-sky-50"
                : "border-slate-100 bg-white"
            }`}
          >
            <span className="block text-[11px] font-medium text-muted-foreground">
              {day.dayLabel}
            </span>
            <span className="mt-1 block font-heading text-lg font-bold text-foreground">
              {day.count}
            </span>
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
          const config =
            availabilityConfig[member.status] ??
            availabilityConfig.niet_ingesteld;
          return (
            <div
              key={member.personnelId}
              className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
            >
              <span className="truncate text-sm font-medium text-foreground">
                {member.name}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
              >
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
    <DashboardPanel
      title="Activiteit"
      subtitle="Recente systeem- en gebruikersacties."
      href="/instellingen/activiteitslog"
      linkLabel="Alles"
    >
      <ol className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="flex gap-3">
            <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium leading-snug text-foreground">
                {entry.actionLabel}
              </p>
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
          <li
            key={assignment.id}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
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
                  ` - ${new Date(
                    `${assignment.scheduledDate}T00:00:00`,
                  ).toLocaleDateString("nl-NL", {
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
        Opdrachtgegevens nog niet beschikbaar. Voer eerst de databasemigratie
        uit.
      </p>
    );
  }
}
