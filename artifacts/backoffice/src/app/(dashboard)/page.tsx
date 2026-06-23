import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getDashboardCounts, listAssignments } from "@/app/actions/assignments";
import { AssignmentStatusBadge } from "@/components/assignments/AssignmentStatusBadge";
import {
  getDashboardFinancials,
  getDashboardPayments,
  getDashboardActionItems,
  getDashboardStaffAvailability,
  getDashboardRecentActivity,
  getDashboardWeekCounts,
  getManagementDashboardMetrics,
  getPlanningDashboardMetrics,
  getAdministrationDashboardMetrics,
  type DashboardFinancials,
  type DashboardPayments,
  type DashboardActionItems,
  type StaffAvailabilityEntry,
  type ActivityEntry,
  type WeekDayCount,
  type ManagementDashboardMetrics,
  type PlanningDashboardMetrics,
  type AdministrationDashboardMetrics,
} from "@/app/actions/dashboard";
import { DashboardRefresher } from "@/components/dashboard/DashboardRefresher";

export const metadata: Metadata = {
  title: "Dashboard",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const AVAILABILITY_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  beschikbaar: { label: "Beschikbaar", color: "#16A34A", bg: "#DCFCE7" },
  niet_beschikbaar: {
    label: "Niet beschikbaar",
    color: "#DC2626",
    bg: "#FEE2E2",
  },
  op_verlof: { label: "Op verlof", color: "#D97706", bg: "#FEF3C7" },
  ziek: { label: "Ziek", color: "#7C3AED", bg: "#EDE9FE" },
  niet_ingesteld: { label: "Niet ingesteld", color: "#64748B", bg: "#F1F5F9" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const canRead = await hasPermission("dashboard", "read");
  if (!canRead) return <ForbiddenPage resource="dashboard" action="read" />;

  const canReadAssignments = await hasPermission("assignments", "read");
  const canReadPersonnel = await hasPermission("personnel", "read");
  const canReadSettings = await hasPermission("settings", "read");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  // Fetch all data in parallel
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
  ] = await Promise.all([
    canReadAssignments
      ? getDashboardCounts().catch(() => ({
          requested: 0,
          plannable: 0,
          inProgress: 0,
          completedToday: 0,
          open: 0,
        }))
      : Promise.resolve({
          requested: 0,
          plannable: 0,
          inProgress: 0,
          completedToday: 0,
          open: 0,
        }),

    getDashboardFinancials().catch(() => null),
    getDashboardPayments().catch(() => null),
    getDashboardActionItems().catch(() => null),
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
  ]);

  const STAT_CARDS = [
    {
      label: "Nieuwe aanvragen",
      value: canReadAssignments ? String(counts.requested) : "—",
      accent: "#3B82F6",
      href: "/assignments?status=requested",
    },
    {
      label: "Planbaar",
      value: canReadAssignments ? String(counts.plannable) : "—",
      accent: "#F59E0B",
      href: "/assignments?status=plannable",
    },
    {
      label: "In uitvoering",
      value: canReadAssignments ? String(counts.inProgress) : "—",
      accent: "#8B5CF6",
      href: "/assignments?status=in_progress",
    },
    {
      label: "Vandaag afgerond",
      value: canReadAssignments ? String(counts.completedToday) : "—",
      accent: "#22C55E",
      href: "/assignments?status=completed",
    },
    {
      label: "Open opdrachten",
      value: canReadAssignments ? String(counts.open) : "—",
      accent: "#0EA5E9",
      href: "/assignments",
    },
  ];

  const totalStaff = staffAvailability.length;
  const availableCount = staffAvailability.filter(
    (s) => s.status === "beschikbaar",
  ).length;
  const unavailableCount = staffAvailability.filter(
    (s) =>
      s.status === "niet_beschikbaar" ||
      s.status === "op_verlof" ||
      s.status === "ziek",
  ).length;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 px-3 py-4 sm:space-y-6 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div>
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            Operationeel overzicht —{" "}
            {today.toLocaleDateString("nl-NL", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <DashboardRefresher />
      </div>

      {/* ── Row 1: Stat cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-5 md:grid-cols-3 xl:grid-cols-5">
        {STAT_CARDS.map(({ label, value, accent, href }) => (
          <Link
            key={label}
            href={canReadAssignments ? href : "#"}
            className="veele-card flex min-h-[112px] flex-col justify-between gap-2 p-4 transition-shadow hover:shadow-md sm:min-h-0 sm:p-6"
          >
            <span
              className="text-[11px] font-medium uppercase tracking-wider sm:text-xs"
              style={{ color: "#64748B" }}
            >
              {label}
            </span>
            <span
              className="font-heading mt-1 text-2xl font-bold sm:text-3xl"
              style={{ color: accent }}
            >
              {value}
            </span>
          </Link>
        ))}
      </div>

      {/* ── Row 2: Financieel widget (gated: invoices:read) ── */}
      {financials && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-5">
          <div className="veele-card p-4 sm:p-6">
            <p
              className="text-xs font-medium uppercase tracking-wider mb-2"
              style={{ color: "#64748B" }}
            >
              Omzet deze maand
            </p>
            <p
              className="font-heading text-xl font-bold sm:text-2xl"
              style={{ color: "#081D3A" }}
            >
              {formatEuro(financials.revenueThisMonth)}
            </p>
            {financials.deltaPercent !== null && (
              <p
                className="text-xs mt-1 font-medium"
                style={{
                  color: financials.deltaPercent >= 0 ? "#16A34A" : "#DC2626",
                }}
              >
                {financials.deltaPercent >= 0 ? "▲" : "▼"}{" "}
                {Math.abs(financials.deltaPercent)}% vs vorige maand
              </p>
            )}
            {financials.deltaPercent === null &&
              financials.revenueLastMonth === 0 && (
                <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>
                  Geen data vorige maand
                </p>
              )}
          </div>

          <div className="veele-card p-4 sm:p-6">
            <p
              className="text-xs font-medium uppercase tracking-wider mb-2"
              style={{ color: "#64748B" }}
            >
              Vorige maand
            </p>
            <p
              className="font-heading text-xl font-bold sm:text-2xl"
              style={{ color: "#64748B" }}
            >
              {formatEuro(financials.revenueLastMonth)}
            </p>
          </div>

          <div className="veele-card p-4 sm:p-6">
            <p
              className="text-xs font-medium uppercase tracking-wider mb-2"
              style={{ color: "#64748B" }}
            >
              Openstaand
            </p>
            <p
              className="font-heading text-xl font-bold sm:text-2xl"
              style={{
                color: financials.outstandingAmount > 0 ? "#F59E0B" : "#081D3A",
              }}
            >
              {formatEuro(financials.outstandingAmount)}
            </p>
            {financials.outstandingCount > 0 && (
              <Link
                href="/invoices?status=sent"
                className="text-xs mt-1 hover:underline block"
                style={{ color: "#00B7B3" }}
              >
                {financials.outstandingCount} factuur
                {financials.outstandingCount !== 1 ? "en" : ""} openstaand →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Row 2b: Betalingenoverzicht-widget ── */}
      {payments && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-5">
          <Link
            href="/invoices?status=paid"
            className="veele-card p-4 transition-shadow hover:shadow-md sm:p-6"
          >
            <p
              className="text-xs font-medium uppercase tracking-wider mb-2"
              style={{ color: "#64748B" }}
            >
              Ontvangen dit jaar
            </p>
            <p
              className="font-heading text-xl font-bold sm:text-2xl"
              style={{ color: "#16A34A" }}
            >
              {formatEuro(payments.paidThisYearAmount)}
            </p>
            <p
              className="text-xs mt-1 font-medium"
              style={{ color: "#64748B" }}
            >
              {payments.paidThisMonthCount} factuur
              {payments.paidThisMonthCount !== 1 ? "en" : ""} deze maand
            </p>
          </Link>

          <Link
            href="/invoices?status=sent"
            className="veele-card p-4 transition-shadow hover:shadow-md sm:p-6"
          >
            <p
              className="text-xs font-medium uppercase tracking-wider mb-2"
              style={{ color: "#64748B" }}
            >
              Openstaand
            </p>
            <p
              className="font-heading text-xl font-bold sm:text-2xl"
              style={{
                color: financials
                  ? financials.outstandingAmount > 0
                    ? "#F59E0B"
                    : "#081D3A"
                  : "#081D3A",
              }}
            >
              {financials ? formatEuro(financials.outstandingAmount) : "—"}
            </p>
            {financials && financials.outstandingCount > 0 && (
              <p
                className="text-xs mt-1 font-medium"
                style={{ color: "#64748B" }}
              >
                {financials.outstandingCount} factuur
                {financials.outstandingCount !== 1 ? "en" : ""}
              </p>
            )}
          </Link>

          <Link
            href="/invoices?status=sent"
            className="veele-card p-4 transition-shadow hover:shadow-md sm:p-6"
          >
            <p
              className="text-xs font-medium uppercase tracking-wider mb-2"
              style={{ color: "#64748B" }}
            >
              Achterstallig
            </p>
            <p
              className="font-heading text-xl font-bold sm:text-2xl"
              style={{
                color: payments.overdueCount > 0 ? "#DC2626" : "#081D3A",
              }}
            >
              {formatEuro(payments.overdueAmount)}
            </p>
            {payments.overdueCount > 0 ? (
              <p
                className="text-xs mt-1 font-medium"
                style={{ color: "#DC2626" }}
              >
                {payments.overdueCount} factuur
                {payments.overdueCount !== 1 ? "en" : ""} vervallen
              </p>
            ) : (
              <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>
                Geen achterstallige facturen
              </p>
            )}
          </Link>
        </div>
      )}

      {(managementMetrics || planningMetrics || administrationMetrics) && (
        <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-3">
          {managementMetrics && (
            <ManagementSignalPanel metrics={managementMetrics} />
          )}
          {planningMetrics && <PlanningSignalPanel metrics={planningMetrics} />}
          {administrationMetrics && (
            <AdministrationSignalPanel metrics={administrationMetrics} />
          )}
        </div>
      )}

      {/* ── Row 3: Weekoverzicht ── */}
      {weekCounts.length > 0 && (
        <div className="veele-card p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2
              className="font-heading text-base font-semibold"
              style={{ color: "#081D3A" }}
            >
              Opdrachten deze week
            </h2>
            <Link
              href="/planning"
              className="text-xs font-medium hover:underline"
              style={{ color: "#00B7B3" }}
            >
              Planning →
            </Link>
          </div>
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="grid min-w-[620px] grid-cols-7 gap-2">
              {weekCounts.map((day) => (
                <Link
                  key={day.date}
                  href={`/planning?day=${day.date}`}
                  className="flex flex-col items-center rounded-lg px-2 py-3 text-center transition-colors hover:bg-slate-50"
                  style={{
                    backgroundColor: day.isToday ? "#EFF6FF" : undefined,
                    border: day.isToday
                      ? "1px solid #BFDBFE"
                      : "1px solid transparent",
                  }}
                >
                  <span
                    className="text-xs font-medium mb-1"
                    style={{ color: day.isToday ? "#2563EB" : "#64748B" }}
                  >
                    {day.dayLabel}
                  </span>
                  <span
                    className="font-heading text-xl font-bold"
                    style={{ color: day.count > 0 ? "#081D3A" : "#CBD5E1" }}
                  >
                    {day.count}
                  </span>
                  <span className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
                    {new Date(day.date + "T00:00:00").toLocaleDateString(
                      "nl-NL",
                      { day: "numeric", month: "numeric" },
                    )}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Row 4: Recente opdrachten + Actiepunten ── */}
      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        {/* Recente opdrachten */}
        <div className="veele-card p-4 sm:p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2
              className="font-heading text-base font-semibold"
              style={{ color: "#081D3A" }}
            >
              Recente opdrachten
            </h2>
            {canReadAssignments && (
              <Link
                href="/assignments"
                className="text-xs font-medium hover:underline"
                style={{ color: "#00B7B3" }}
              >
                Alle opdrachten →
              </Link>
            )}
          </div>
          {canReadAssignments ? (
            <RecentAssignments />
          ) : (
            <p className="text-sm" style={{ color: "#64748B" }}>
              Geen toegang tot opdrachten.
            </p>
          )}
        </div>

        {/* Actiepunten panel */}
        {actionItems && <ActionItemsPanel items={actionItems} />}
      </div>

      {/* ── Row 5: Personeelsbeschikbaarheid + Activiteitenfeed ── */}
      {(totalStaff > 0 || recentActivity.length > 0) && (
        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
          {/* Personeelsbeschikbaarheid */}
          {totalStaff > 0 && (
            <div className="veele-card p-4 sm:p-6 lg:col-span-2">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2
                    className="font-heading text-base font-semibold"
                    style={{ color: "#081D3A" }}
                  >
                    Personeelsbeschikbaarheid vandaag
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
                    {availableCount} beschikbaar · {unavailableCount} niet
                    beschikbaar · {totalStaff} totaal
                  </p>
                </div>
                <Link
                  href="/personnel"
                  className="text-xs font-medium hover:underline"
                  style={{ color: "#00B7B3" }}
                >
                  Personeel →
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
                {staffAvailability.map((member) => {
                  const cfg =
                    AVAILABILITY_CONFIG[member.status] ??
                    AVAILABILITY_CONFIG["niet_ingesteld"];
                  return (
                    <div
                      key={member.personnelId}
                      className="flex items-center justify-between px-3 py-2 rounded-md"
                      style={{ backgroundColor: "#F8FAFC" }}
                    >
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: "#081D3A" }}
                      >
                        {member.name}
                      </span>
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full ml-2 shrink-0"
                        style={{ backgroundColor: cfg.bg, color: cfg.color }}
                      >
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Activiteitenfeed */}
          {recentActivity.length > 0 && (
            <div className="veele-card p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2
                  className="font-heading text-base font-semibold"
                  style={{ color: "#081D3A" }}
                >
                  Activiteit
                </h2>
                <Link
                  href="/instellingen/activiteitslog"
                  className="text-xs font-medium hover:underline"
                  style={{ color: "#00B7B3" }}
                >
                  Alles →
                </Link>
              </div>
              <ol className="space-y-3">
                {recentActivity.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <div
                      className="mt-0.5 h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: "#00B7B3" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-xs font-medium leading-snug"
                        style={{ color: "#1E293B" }}
                      >
                        {entry.actionLabel}
                      </p>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: "#94A3B8" }}
                      >
                        {entry.userName} · {timeSince(entry.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Actiepunten panel ────────────────────────────────────────────────────────

type SignalItem = {
  label: string;
  value: string;
  helper: string;
  href?: string;
  accent: string;
  bg: string;
};

function ManagementSignalPanel({
  metrics,
}: {
  metrics: ManagementDashboardMetrics;
}) {
  const staffRatio =
    metrics.staffTotal > 0
      ? Math.round((metrics.staffAvailableToday / metrics.staffTotal) * 100)
      : 0;
  const items: SignalItem[] = [];

  if (metrics.canReadInvoices) {
    items.push({
      label: "Omzet",
      value: formatEuro(metrics.revenueThisMonth),
      helper: `${metrics.openInvoices} open facturen (${formatEuro(metrics.openInvoiceAmount)})`,
      href: "/invoices",
      accent: "#16A34A",
      bg: "#ECFDF5",
    });
  }

  if (metrics.canReadAssignments) {
    items.push({
      label: "Open opdrachten",
      value: String(metrics.openAssignments),
      helper: `${metrics.urgentAssignments} spoed, ${metrics.notCompletedAssignments} afgemeld`,
      href: "/assignments",
      accent: metrics.urgentAssignments > 0 ? "#DC2626" : "#0EA5E9",
      bg: metrics.urgentAssignments > 0 ? "#FEF2F2" : "#EFF6FF",
    });
  }

  if (metrics.canReadReports) {
    items.push({
      label: "Rapportages",
      value: String(metrics.reportsInReview),
      helper: "Wachten op controle",
      href: "/reports?status=submitted",
      accent: metrics.reportsInReview > 0 ? "#D97706" : "#16A34A",
      bg: metrics.reportsInReview > 0 ? "#FFFBEB" : "#ECFDF5",
    });
  }

  if (metrics.canReadPersonnel) {
    items.push({
      label: "Personeelscapaciteit",
      value: `${staffRatio}%`,
      helper: `${metrics.staffAvailableToday} van ${metrics.staffTotal} vandaag beschikbaar`,
      href: "/personnel",
      accent: staffRatio >= 50 ? "#16A34A" : "#D97706",
      bg: staffRatio >= 50 ? "#ECFDF5" : "#FFFBEB",
    });

    items.push({
      label: "Certificaten",
      value: String(metrics.expiringCertificates),
      helper: "Verlopen binnen 45 dagen",
      href: "/personnel",
      accent: metrics.expiringCertificates > 0 ? "#D97706" : "#16A34A",
      bg: metrics.expiringCertificates > 0 ? "#FFFBEB" : "#ECFDF5",
    });
  }

  if (metrics.canReadTickets) {
    items.push({
      label: "Tickets / incidenten",
      value: String(metrics.openTickets),
      helper: "Open klant- en personeelsmeldingen",
      href: "/tickets",
      accent: metrics.openTickets > 0 ? "#7C3AED" : "#16A34A",
      bg: metrics.openTickets > 0 ? "#F5F3FF" : "#ECFDF5",
    });
  }

  return (
    <SignalPanel
      title="Management"
      subtitle="Stuurinformatie voor risico, omzet en operatie."
      items={items}
    />
  );
}

function PlanningSignalPanel({
  metrics,
}: {
  metrics: PlanningDashboardMetrics;
}) {
  const items: SignalItem[] = [
    {
      label: "Planbaar",
      value: String(metrics.plannableAssignments),
      helper: `${metrics.openServices} open diensten / aanvragen`,
      href: "/planning",
      accent: metrics.plannableAssignments > 0 ? "#0EA5E9" : "#64748B",
      bg: "#EFF6FF",
    },
  ];

  if (metrics.canReadPersonnel) {
    items.push({
      label: "Beschikbaar vandaag",
      value: String(metrics.availablePersonnelToday),
      helper: `${metrics.leaveOrSickImpactToday} verlof/ziekte-impact`,
      href: "/personnel",
      accent: metrics.leaveOrSickImpactToday > 0 ? "#D97706" : "#16A34A",
      bg: metrics.leaveOrSickImpactToday > 0 ? "#FFFBEB" : "#ECFDF5",
    });
  }

  items.push({
    label: "Interessepeilingen",
    value: String(metrics.activeInterestRounds),
    helper: `${metrics.interestedResponses} reacties met interesse/reserve`,
    href: "/planning",
    accent: metrics.activeInterestRounds > 0 ? "#7C3AED" : "#64748B",
    bg: metrics.activeInterestRounds > 0 ? "#F5F3FF" : "#F8FAFC",
  });

  return (
    <div className="veele-card p-4 sm:p-6">
      <PanelHeader
        title="Planning"
        subtitle="Capaciteit, diensten en interessepeilingen."
        href="/planning"
      />
      <SignalList items={items} />
      <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
        <p
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "#64748B" }}
        >
          Capaciteit per sector
        </p>
        {metrics.capacityBySector.length > 0 ? (
          <div className="mt-3 space-y-2">
            {metrics.capacityBySector.slice(0, 4).map((row) => {
              const total = row.green + row.orange + row.red;
              return (
                <div key={row.sector}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span
                      className="font-medium truncate"
                      style={{ color: "#081D3A" }}
                    >
                      {row.sector}
                    </span>
                    <span style={{ color: "#64748B" }}>
                      {row.green} groen / {row.orange} oranje / {row.red} rood
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
        ) : (
          <p className="mt-2 text-sm" style={{ color: "#94A3B8" }}>
            Nog geen capaciteitschecks beschikbaar.
          </p>
        )}
      </div>
    </div>
  );
}

function AdministrationSignalPanel({
  metrics,
}: {
  metrics: AdministrationDashboardMetrics;
}) {
  const items: SignalItem[] = [
    {
      label: "Factuurvoorstellen",
      value: String(metrics.invoiceProposals),
      helper: `${metrics.draftInvoices} conceptfacturen klaar voor controle`,
      href: "/invoices?status=draft",
      accent: metrics.invoiceProposals > 0 ? "#D97706" : "#64748B",
      bg: metrics.invoiceProposals > 0 ? "#FFFBEB" : "#F8FAFC",
    },
    {
      label: "Openstaande posten",
      value: formatEuro(metrics.outstandingAmount),
      helper: `${metrics.outstandingCount} open facturen`,
      href: "/invoices?status=sent",
      accent: metrics.outstandingAmount > 0 ? "#DC2626" : "#16A34A",
      bg: metrics.outstandingAmount > 0 ? "#FEF2F2" : "#ECFDF5",
    },
    {
      label: "Verzamelfacturen",
      value: String(metrics.openBatches),
      helper: "Open batches voor controle",
      href: "/invoices",
      accent: metrics.openBatches > 0 ? "#0EA5E9" : "#64748B",
      bg: metrics.openBatches > 0 ? "#EFF6FF" : "#F8FAFC",
    },
    {
      label: "Mollie",
      value: String(metrics.openMolliePayments),
      helper: `${metrics.failedMolliePayments} mislukte/verlopen betalingen`,
      href: "/invoices",
      accent: metrics.failedMolliePayments > 0 ? "#DC2626" : "#16A34A",
      bg: metrics.failedMolliePayments > 0 ? "#FEF2F2" : "#ECFDF5",
    },
    {
      label: "Meerwerk / verbruik",
      value: String(
        metrics.extraWorkLinesToReview + metrics.materialLinesToReview,
      ),
      helper: `${metrics.extraWorkLinesToReview} meerwerk, ${metrics.materialLinesToReview} materiaalregels`,
      href: "/reports",
      accent:
        metrics.extraWorkLinesToReview + metrics.materialLinesToReview > 0
          ? "#7C3AED"
          : "#64748B",
      bg:
        metrics.extraWorkLinesToReview + metrics.materialLinesToReview > 0
          ? "#F5F3FF"
          : "#F8FAFC",
    },
  ];

  return (
    <SignalPanel
      title="Administratie"
      subtitle="Financiele controle, betalingen en factureerbaarheid."
      items={items}
      href="/invoices"
    />
  );
}

function SignalPanel({
  title,
  subtitle,
  items,
  href,
}: {
  title: string;
  subtitle: string;
  items: SignalItem[];
  href?: string;
}) {
  return (
    <div className="veele-card p-4 sm:p-6">
      <PanelHeader title={title} subtitle={subtitle} href={href} />
      <SignalList items={items} />
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
  href,
}: {
  title: string;
  subtitle: string;
  href?: string;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div>
        <h2
          className="font-heading text-base font-semibold"
          style={{ color: "#081D3A" }}
        >
          {title}
        </h2>
        <p className="mt-0.5 text-xs leading-snug" style={{ color: "#64748B" }}>
          {subtitle}
        </p>
      </div>
      {href && (
        <Link
          href={href}
          className="shrink-0 text-xs font-medium hover:underline"
          style={{ color: "#00B7B3" }}
        >
          Open
        </Link>
      )}
    </div>
  );
}

function SignalList({ items }: { items: SignalItem[] }) {
  if (items.length === 0) {
    return (
      <p
        className="rounded-lg bg-slate-50 px-3 py-4 text-sm"
        style={{ color: "#64748B" }}
      >
        Geen stuurinformatie beschikbaar voor je huidige rol.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2">
      {items.map((item) => {
        const content = (
          <>
            <span
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: "#64748B" }}
            >
              {item.label}
            </span>
            <span
              className="mt-1 block font-heading text-xl font-bold sm:text-2xl"
              style={{ color: item.accent }}
            >
              {item.value}
            </span>
            <span
              className="mt-1 block text-xs leading-snug"
              style={{ color: "#64748B" }}
            >
              {item.helper}
            </span>
          </>
        );

        if (item.href) {
          return (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              className="rounded-lg border border-transparent px-3 py-2.5 transition-shadow hover:shadow-sm"
              style={{ backgroundColor: item.bg }}
            >
              {content}
            </Link>
          );
        }

        return (
          <div
            key={item.label}
            className="rounded-lg px-3 py-2.5"
            style={{ backgroundColor: item.bg }}
          >
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
        color: "#DC2626",
        bg: "#FEF2F2",
      },
    items.canReadInvoices &&
      items.invoicesToSend > 0 && {
        href: "/invoices?status=draft",
        label: `${items.invoicesToSend} factuur${items.invoicesToSend !== 1 ? "en" : ""} klaar om te verzenden`,
        color: "#D97706",
        bg: "#FFFBEB",
      },
    items.canReadQuotes &&
      items.pendingQuotes > 0 && {
        href: "/quotes?status=sent",
        label: `${items.pendingQuotes} offerte${items.pendingQuotes !== 1 ? "s" : ""} wachten op goedkeuring`,
        color: "#7C3AED",
        bg: "#F5F3FF",
      },
    items.canReadAssignments &&
      items.plannableNoPersonnel > 0 && {
        href: "/planning",
        label: `${items.plannableNoPersonnel} inplanbare opdracht${items.plannableNoPersonnel !== 1 ? "en" : ""} zonder personeel`,
        color: "#F59E0B",
        bg: "#FFFBEB",
      },
  ].filter(Boolean) as Array<{
    href: string;
    label: string;
    color: string;
    bg: string;
  }>;

  return (
    <div className="veele-card p-4 sm:p-6">
      <h2
        className="font-heading text-base font-semibold mb-4"
        style={{ color: "#081D3A" }}
      >
        Actiepunten
      </h2>
      {actionLinks.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <span className="text-2xl mb-2">✓</span>
          <p className="text-sm font-medium" style={{ color: "#16A34A" }}>
            Alles bijgewerkt
          </p>
          <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>
            Geen openstaande actiepunten.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {actionLinks.map(({ href, label, color, bg }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-opacity hover:opacity-80"
                style={{ backgroundColor: bg, color }}
              >
                <span className="leading-snug">{label}</span>
                <span className="ml-2 shrink-0">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Quick nav below action items */}
      <div className="mt-4 pt-4" style={{ borderTop: "1px solid #F1F5F9" }}>
        <p
          className="text-xs font-medium uppercase tracking-wider mb-2"
          style={{ color: "#94A3B8" }}
        >
          Navigatie
        </p>
        <nav className="flex flex-col gap-0.5">
          {[
            { href: "/assignments", label: "Opdrachten" },
            { href: "/planning", label: "Planning" },
            { href: "/customers", label: "Klanten" },
            { href: "/personnel", label: "Personeel" },
            { href: "/invoices", label: "Facturen" },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors hover:bg-slate-50"
              style={{ color: "#374151" }}
            >
              {label}
              <span style={{ color: "#94A3B8" }}>→</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

// ─── Recent assignments ───────────────────────────────────────────────────────

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
        <p className="text-sm" style={{ color: "#64748B" }}>
          Nog geen opdrachten aangemaakt. Maak een{" "}
          <Link
            href="/assignments"
            className="underline"
            style={{ color: "#00B7B3" }}
          >
            eerste opdracht
          </Link>{" "}
          aan om te beginnen.
        </p>
      );
    }

    return (
      <ul className="divide-y" style={{ borderColor: "#F1F5F9" }}>
        {recent.map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-2.5"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/assignments/${a.id}`}
                className="text-sm font-medium hover:underline truncate block"
                style={{ color: "#081D3A" }}
              >
                {a.title}
              </Link>
              <p
                className="text-xs mt-0.5 truncate"
                style={{ color: "#94A3B8" }}
              >
                {a.customerName}
                {a.scheduledDate &&
                  ` · ${new Date(a.scheduledDate + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}`}
              </p>
            </div>
            <div className="sm:shrink-0">
              <AssignmentStatusBadge status={a.status} />
            </div>
          </li>
        ))}
      </ul>
    );
  } catch {
    return (
      <p className="text-sm" style={{ color: "#64748B" }}>
        Opdrachtgegevens nog niet beschikbaar. Voer eerst de databasemigratie
        uit.
      </p>
    );
  }
}
