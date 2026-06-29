"use server";

import { db } from "@workspace/db";
import {
  assignmentsTable,
  assignmentCapacityChecksTable,
  assignmentExtraWorkTable,
  assignmentInterestResponsesTable,
  assignmentInterestRoundsTable,
  assignmentMaterialUsageTable,
  assignmentPersonnelTable,
  assignmentTasksTable,
  availabilityDayEntriesTable,
  customerMessageThreadsTable,
  customerPaymentBatchesTable,
  customersTable,
  DEFAULT_TENANT_ID,
  invoicesTable,
  leavePeriodsTable,
  paymentsTable,
  personnelMessageThreadsTable,
  personnelQualificationsTable,
  reportsTable,
  quotesTable,
  personnelTable,
  auditLogTable,
  sectorsTable,
  taskCodesTable,
  tenantUsersTable,
} from "@workspace/db";
import {
  eq,
  and,
  gte,
  lte,
  sql,
  inArray,
  desc,
  notExists,
  ne,
  isNotNull,
} from "drizzle-orm";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getBatchAvailabilityStatus } from "./availability";
import type { AvailabilityStatus } from "./availability";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DashboardPayments = {
  paidThisMonthCount: number;
  paidThisMonthAmount: number;
  paidThisYearAmount: number;
  overdueCount: number;
  overdueAmount: number;
  mollieOpenCount: number;
  mollieOpenAmountEur: number;
};

export type DashboardFinancials = {
  revenueThisMonth: number;
  revenueLastMonth: number;
  outstandingAmount: number;
  outstandingCount: number;
  deltaPercent: number | null;
};

export type DashboardActionItems = {
  pendingReports: number;
  invoicesToSend: number;
  pendingQuotes: number;
  plannableNoPersonnel: number;
  canReadReports: boolean;
  canReadInvoices: boolean;
  canReadQuotes: boolean;
  canReadAssignments: boolean;
};

export type StaffAvailabilityEntry = {
  personnelId: string;
  name: string;
  status: AvailabilityStatus;
};

export type ActivityEntry = {
  id: string;
  action: string;
  actionLabel: string;
  resource: string;
  resourceId: string | null;
  userName: string;
  createdAt: string;
};

export type WeekDayCount = {
  date: string;
  dayLabel: string;
  count: number;
  isToday: boolean;
};

export type ManagementDashboardMetrics = {
  revenueThisMonth: number;
  openAssignments: number;
  urgentAssignments: number;
  notCompletedAssignments: number;
  reportsInReview: number;
  openInvoices: number;
  openInvoiceAmount: number;
  paymentOpen: number;
  paymentPaidThisMonth: number;
  paymentFailed: number;
  staffTotal: number;
  staffAvailableToday: number;
  expiringCertificates: number;
  openTickets: number;
  canReadAssignments: boolean;
  canReadReports: boolean;
  canReadInvoices: boolean;
  canReadPersonnel: boolean;
  canReadTickets: boolean;
};

export type PlanningSectorCapacity = {
  sector: string;
  green: number;
  orange: number;
  red: number;
};

export type PlanningDashboardMetrics = {
  plannableAssignments: number;
  openServices: number;
  capacityBySector: PlanningSectorCapacity[];
  availablePersonnelToday: number;
  activeInterestRounds: number;
  interestedResponses: number;
  leaveOrSickImpactToday: number;
  canReadPlanning: boolean;
  canReadPersonnel: boolean;
};

export type AdministrationDashboardMetrics = {
  invoiceProposals: number;
  draftInvoices: number;
  outstandingAmount: number;
  outstandingCount: number;
  openBatches: number;
  openMolliePayments: number;
  failedMolliePayments: number;
  extraWorkLinesToReview: number;
  materialLinesToReview: number;
  canReadInvoices: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getMondayOfWeek(ref: Date): Date {
  const d = new Date(ref);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getCurrentTenantId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_TENANT_ID;

  const [tenantUser] = await db
    .select({ tenantId: tenantUsersTable.tenantId })
    .from(tenantUsersTable)
    .where(
      and(
        eq(tenantUsersTable.userId, user.id),
        eq(tenantUsersTable.status, "active"),
      ),
    )
    .limit(1);

  return tenantUser?.tenantId ?? DEFAULT_TENANT_ID;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseFloat(value) || 0;
  return 0;
}

const ACTION_LABELS: Record<string, string> = {
  create_invoice: "Factuur aangemaakt",
  mark_invoice_sent: "Factuur verzonden",
  mark_invoice_paid: "Factuur als betaald gemarkeerd",
  cancel_invoice: "Factuur geannuleerd",
  create_mollie_payment: "Betaallink aangemaakt",
  mollie_payment_received: "Betaling ontvangen (Mollie)",
  create_quote: "Offerte aangemaakt",
  send_quote: "Offerte verzonden",
  approve_quote: "Offerte goedgekeurd",
  reject_quote: "Offerte afgewezen",
  submit_report: "Rapport ingediend",
  approve_report: "Rapport goedgekeurd",
  reject_report: "Rapport afgekeurd",
  create: "Record aangemaakt",
  update: "Record bijgewerkt",
  delete: "Record verwijderd",
  invite: "Gebruiker uitgenodigd",
  deactivate: "Gebruiker gedeactiveerd",
  grant_permission: "Recht verleend",
  revoke_permission: "Recht ingetrokken",
  update_permissions: "Rechten bijgewerkt",
  login: "Ingelogd",
  logout: "Uitgelogd",
};

const RESOURCE_LABELS: Record<string, string> = {
  invoices: "Facturen",
  payments: "Betalingen",
  quotes: "Offertes",
  reports: "Rapporten",
  assignments: "Opdrachten",
  customers: "Klanten",
  objects: "Objecten",
  personnel: "Personeel",
  roles: "Rollen",
  users: "Gebruikers",
  settings: "Instellingen",
};

// ─── Betalingen-widget ────────────────────────────────────────────────────────

export async function getDashboardPayments(): Promise<DashboardPayments | null> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return null;

  const tenantId = await getCurrentTenantId();
  const now = new Date();
  const startOfMonth = toDateString(
    new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const startOfYear = toDateString(new Date(now.getFullYear(), 0, 1));
  const todayStr = toDateString(now);

  const [invoiceRow] = await db
    .select({
      paidThisMonthCount: sql<number>`count(*) FILTER (WHERE ${invoicesTable.status} = 'paid' AND ${invoicesTable.paidDate} >= ${startOfMonth})::int`,
      paidThisMonthAmount: sql<string>`coalesce(sum(${invoicesTable.totalAmount}) FILTER (WHERE ${invoicesTable.status} = 'paid' AND ${invoicesTable.paidDate} >= ${startOfMonth}), 0)::text`,
      paidThisYearAmount: sql<string>`coalesce(sum(${invoicesTable.totalAmount}) FILTER (WHERE ${invoicesTable.status} = 'paid' AND ${invoicesTable.paidDate} >= ${startOfYear}), 0)::text`,
      overdueCount: sql<number>`count(*) FILTER (WHERE ${invoicesTable.status} = 'sent' AND ${invoicesTable.dueDate} < ${todayStr})::int`,
      overdueAmount: sql<string>`coalesce(sum(${invoicesTable.totalAmount}) FILTER (WHERE ${invoicesTable.status} = 'sent' AND ${invoicesTable.dueDate} < ${todayStr}), 0)::text`,
    })
    .from(invoicesTable)
    .innerJoin(
      assignmentsTable,
      eq(invoicesTable.assignmentId, assignmentsTable.id),
    )
    .where(eq(assignmentsTable.tenantId, tenantId));

  const [paymentRow] = await db
    .select({
      mollieOpenCount: sql<number>`count(*)::int`,
      mollieOpenAmountCents: sql<string>`coalesce(sum(amount_cents), 0)::text`,
    })
    .from(paymentsTable)
    .innerJoin(invoicesTable, eq(paymentsTable.invoiceId, invoicesTable.id))
    .innerJoin(
      assignmentsTable,
      eq(invoicesTable.assignmentId, assignmentsTable.id),
    )
    .where(
      and(
        eq(assignmentsTable.tenantId, tenantId),
        eq(paymentsTable.status, "open"),
      ),
    );

  return {
    paidThisMonthCount: invoiceRow?.paidThisMonthCount ?? 0,
    paidThisMonthAmount: parseFloat(invoiceRow?.paidThisMonthAmount ?? "0"),
    paidThisYearAmount: parseFloat(invoiceRow?.paidThisYearAmount ?? "0"),
    overdueCount: invoiceRow?.overdueCount ?? 0,
    overdueAmount: parseFloat(invoiceRow?.overdueAmount ?? "0"),
    mollieOpenCount: paymentRow?.mollieOpenCount ?? 0,
    mollieOpenAmountEur: Math.round(
      parseInt(paymentRow?.mollieOpenAmountCents ?? "0", 10) / 100,
    ),
  };
}

export async function getManagementDashboardMetrics(): Promise<ManagementDashboardMetrics> {
  const tenantId = await getCurrentTenantId();
  const todayStr = toDateString(new Date());
  const startOfMonth = toDateString(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const certLimit = new Date();
  certLimit.setDate(certLimit.getDate() + 45);
  const certLimitStr = toDateString(certLimit);

  const [
    canReadAssignments,
    canReadReports,
    canReadInvoices,
    canReadPersonnel,
    canReadTickets,
  ] = await Promise.all([
    hasPermission("assignments", "read"),
    hasPermission("reports", "read"),
    hasPermission("invoices", "read"),
    hasPermission("personnel", "read"),
    hasPermission("tickets", "read"),
  ]);

  const [
    assignmentRow,
    reportRow,
    invoiceRow,
    paymentRow,
    staffRow,
    availabilityRow,
    certRow,
    customerTicketRow,
    personnelTicketRow,
  ] = await Promise.all([
    canReadAssignments
      ? db
          .select({
            openAssignments: sql<number>`count(*) filter (where ${assignmentsTable.status} not in ('paid','closed','invoiced'))::int`,
            urgentAssignments: sql<number>`count(*) filter (where ${assignmentsTable.priority} = 'urgent' and ${assignmentsTable.status} not in ('paid','closed'))::int`,
            notCompletedAssignments: sql<number>`count(*) filter (where ${assignmentsTable.status} = 'not_completed')::int`,
          })
          .from(assignmentsTable)
          .where(eq(assignmentsTable.tenantId, tenantId))
          .then(
            ([row]) =>
              row ?? {
                openAssignments: 0,
                urgentAssignments: 0,
                notCompletedAssignments: 0,
              },
          )
      : Promise.resolve({
          openAssignments: 0,
          urgentAssignments: 0,
          notCompletedAssignments: 0,
        }),

    canReadReports
      ? db
          .select({ reportsInReview: sql<number>`count(*)::int` })
          .from(reportsTable)
          .innerJoin(
            assignmentsTable,
            eq(reportsTable.assignmentId, assignmentsTable.id),
          )
          .where(
            and(
              eq(assignmentsTable.tenantId, tenantId),
              eq(reportsTable.status, "submitted"),
            ),
          )
          .then(([row]) => row ?? { reportsInReview: 0 })
      : Promise.resolve({ reportsInReview: 0 }),

    canReadInvoices
      ? db
          .select({
            revenueThisMonth: sql<string>`coalesce(sum(${invoicesTable.totalAmount}) filter (where ${invoicesTable.status} = 'paid' and ${invoicesTable.paidDate} >= ${startOfMonth}), 0)::text`,
            openInvoices: sql<number>`count(*) filter (where ${invoicesTable.status} = 'sent')::int`,
            openInvoiceAmount: sql<string>`coalesce(sum(${invoicesTable.totalAmount}) filter (where ${invoicesTable.status} = 'sent'), 0)::text`,
          })
          .from(invoicesTable)
          .innerJoin(
            assignmentsTable,
            eq(invoicesTable.assignmentId, assignmentsTable.id),
          )
          .where(eq(assignmentsTable.tenantId, tenantId))
          .then(
            ([row]) =>
              row ?? {
                revenueThisMonth: "0",
                openInvoices: 0,
                openInvoiceAmount: "0",
              },
          )
      : Promise.resolve({
          revenueThisMonth: "0",
          openInvoices: 0,
          openInvoiceAmount: "0",
        }),

    canReadInvoices
      ? db
          .select({
            paymentOpen: sql<number>`count(*) filter (where ${paymentsTable.status} = 'open')::int`,
            paymentPaidThisMonth: sql<number>`count(*) filter (where ${paymentsTable.status} = 'paid' and ${paymentsTable.paidAt} >= ${startOfMonth})::int`,
            paymentFailed: sql<number>`count(*) filter (where ${paymentsTable.status} in ('failed','expired','canceled'))::int`,
          })
          .from(paymentsTable)
          .innerJoin(
            invoicesTable,
            eq(paymentsTable.invoiceId, invoicesTable.id),
          )
          .innerJoin(
            assignmentsTable,
            eq(invoicesTable.assignmentId, assignmentsTable.id),
          )
          .where(eq(assignmentsTable.tenantId, tenantId))
          .then(
            ([row]) =>
              row ?? {
                paymentOpen: 0,
                paymentPaidThisMonth: 0,
                paymentFailed: 0,
              },
          )
      : Promise.resolve({
          paymentOpen: 0,
          paymentPaidThisMonth: 0,
          paymentFailed: 0,
        }),

    canReadPersonnel
      ? db
          .select({ staffTotal: sql<number>`count(*)::int` })
          .from(personnelTable)
          .where(
            and(
              eq(personnelTable.tenantId, tenantId),
              eq(personnelTable.isActive, true),
            ),
          )
          .then(([row]) => row ?? { staffTotal: 0 })
      : Promise.resolve({ staffTotal: 0 }),

    canReadPersonnel
      ? db
          .select({
            staffAvailableToday: sql<number>`count(distinct ${availabilityDayEntriesTable.personnelId})::int`,
          })
          .from(availabilityDayEntriesTable)
          .innerJoin(
            personnelTable,
            eq(availabilityDayEntriesTable.personnelId, personnelTable.id),
          )
          .where(
            and(
              eq(personnelTable.tenantId, tenantId),
              eq(personnelTable.isActive, true),
              eq(availabilityDayEntriesTable.date, todayStr),
            ),
          )
          .then(([row]) => row ?? { staffAvailableToday: 0 })
      : Promise.resolve({ staffAvailableToday: 0 }),

    canReadPersonnel
      ? db
          .select({ expiringCertificates: sql<number>`count(*)::int` })
          .from(personnelQualificationsTable)
          .innerJoin(
            personnelTable,
            eq(personnelQualificationsTable.personnelId, personnelTable.id),
          )
          .where(
            and(
              eq(personnelQualificationsTable.tenantId, tenantId),
              eq(personnelTable.isActive, true),
              isNotNull(personnelQualificationsTable.expiresAt),
              lte(personnelQualificationsTable.expiresAt, certLimitStr),
            ),
          )
          .then(([row]) => row ?? { expiringCertificates: 0 })
      : Promise.resolve({ expiringCertificates: 0 }),

    canReadTickets
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(customerMessageThreadsTable)
          .where(
            and(
              eq(customerMessageThreadsTable.tenantId, tenantId),
              ne(customerMessageThreadsTable.status, "closed"),
            ),
          )
          .then(([row]) => row?.count ?? 0)
      : Promise.resolve(0),

    canReadTickets
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(personnelMessageThreadsTable)
          .where(
            and(
              eq(personnelMessageThreadsTable.tenantId, tenantId),
              ne(personnelMessageThreadsTable.status, "closed"),
            ),
          )
          .then(([row]) => row?.count ?? 0)
      : Promise.resolve(0),
  ]);

  return {
    revenueThisMonth: toNumber(invoiceRow.revenueThisMonth),
    openAssignments: assignmentRow.openAssignments,
    urgentAssignments: assignmentRow.urgentAssignments,
    notCompletedAssignments: assignmentRow.notCompletedAssignments,
    reportsInReview: reportRow.reportsInReview,
    openInvoices: invoiceRow.openInvoices,
    openInvoiceAmount: toNumber(invoiceRow.openInvoiceAmount),
    paymentOpen: paymentRow.paymentOpen,
    paymentPaidThisMonth: paymentRow.paymentPaidThisMonth,
    paymentFailed: paymentRow.paymentFailed,
    staffTotal: staffRow.staffTotal,
    staffAvailableToday: availabilityRow.staffAvailableToday,
    expiringCertificates: certRow.expiringCertificates,
    openTickets: customerTicketRow + personnelTicketRow,
    canReadAssignments,
    canReadReports,
    canReadInvoices,
    canReadPersonnel,
    canReadTickets,
  };
}

export async function getPlanningDashboardMetrics(): Promise<PlanningDashboardMetrics> {
  const tenantId = await getCurrentTenantId();
  const todayStr = toDateString(new Date());
  const [canReadPlanning, canReadPersonnel] = await Promise.all([
    hasPermission("planning", "read"),
    hasPermission("personnel", "read"),
  ]);

  if (!canReadPlanning) {
    return {
      plannableAssignments: 0,
      openServices: 0,
      capacityBySector: [],
      availablePersonnelToday: 0,
      activeInterestRounds: 0,
      interestedResponses: 0,
      leaveOrSickImpactToday: 0,
      canReadPlanning,
      canReadPersonnel,
    };
  }

  const [assignmentRow, capacityRows, availableRow, interestRow, leaveRow] =
    await Promise.all([
      db
        .select({
          plannableAssignments: sql<number>`count(*) filter (where ${assignmentsTable.status} = 'plannable')::int`,
          openServices: sql<number>`count(*) filter (where ${assignmentsTable.status} in ('requested','review','approved','plannable'))::int`,
        })
        .from(assignmentsTable)
        .where(eq(assignmentsTable.tenantId, tenantId))
        .then(([row]) => row ?? { plannableAssignments: 0, openServices: 0 }),

      db
        .select({
          sector: sectorsTable.name,
          green: sql<number>`count(distinct ${assignmentCapacityChecksTable.id}) filter (where ${assignmentCapacityChecksTable.capacityStatus} = 'green')::int`,
          orange: sql<number>`count(distinct ${assignmentCapacityChecksTable.id}) filter (where ${assignmentCapacityChecksTable.capacityStatus} = 'orange')::int`,
          red: sql<number>`count(distinct ${assignmentCapacityChecksTable.id}) filter (where ${assignmentCapacityChecksTable.capacityStatus} = 'red')::int`,
        })
        .from(assignmentCapacityChecksTable)
        .innerJoin(
          assignmentsTable,
          eq(assignmentCapacityChecksTable.assignmentId, assignmentsTable.id),
        )
        .leftJoin(
          assignmentTasksTable,
          eq(assignmentTasksTable.assignmentId, assignmentsTable.id),
        )
        .leftJoin(
          taskCodesTable,
          eq(assignmentTasksTable.taskCodeId, taskCodesTable.id),
        )
        .leftJoin(sectorsTable, eq(taskCodesTable.sectorId, sectorsTable.id))
        .where(
          and(
            eq(assignmentCapacityChecksTable.tenantId, tenantId),
            eq(assignmentCapacityChecksTable.isLatest, true),
          ),
        )
        .groupBy(sectorsTable.name)
        .then((rows) =>
          rows.map((row) => ({
            sector: row.sector ?? "Nog zonder sector",
            green: row.green,
            orange: row.orange,
            red: row.red,
          })),
        ),

      canReadPersonnel
        ? db
            .select({
              availablePersonnelToday: sql<number>`count(distinct ${availabilityDayEntriesTable.personnelId})::int`,
            })
            .from(availabilityDayEntriesTable)
            .innerJoin(
              personnelTable,
              eq(availabilityDayEntriesTable.personnelId, personnelTable.id),
            )
            .where(
              and(
                eq(personnelTable.tenantId, tenantId),
                eq(personnelTable.isActive, true),
                eq(availabilityDayEntriesTable.date, todayStr),
              ),
            )
            .then(([row]) => row ?? { availablePersonnelToday: 0 })
        : Promise.resolve({ availablePersonnelToday: 0 }),

      db
        .select({
          activeInterestRounds: sql<number>`count(distinct ${assignmentInterestRoundsTable.id})::int`,
          interestedResponses: sql<number>`count(${assignmentInterestResponsesTable.id}) filter (where ${assignmentInterestResponsesTable.status} in ('interested','selected','reserve','confirmed'))::int`,
        })
        .from(assignmentInterestRoundsTable)
        .leftJoin(
          assignmentInterestResponsesTable,
          eq(
            assignmentInterestResponsesTable.roundId,
            assignmentInterestRoundsTable.id,
          ),
        )
        .where(
          and(
            eq(assignmentInterestRoundsTable.tenantId, tenantId),
            eq(assignmentInterestRoundsTable.status, "sent"),
          ),
        )
        .then(
          ([row]) => row ?? { activeInterestRounds: 0, interestedResponses: 0 },
        ),

      canReadPersonnel
        ? db
            .select({ leaveOrSickImpactToday: sql<number>`count(*)::int` })
            .from(leavePeriodsTable)
            .innerJoin(
              personnelTable,
              eq(leavePeriodsTable.personnelId, personnelTable.id),
            )
            .where(
              and(
                eq(personnelTable.tenantId, tenantId),
                eq(leavePeriodsTable.status, "approved"),
                lte(leavePeriodsTable.startDate, todayStr),
                sql`coalesce(${leavePeriodsTable.endDate}, ${leavePeriodsTable.startDate}) >= ${todayStr}`,
              ),
            )
            .then(([row]) => row ?? { leaveOrSickImpactToday: 0 })
        : Promise.resolve({ leaveOrSickImpactToday: 0 }),
    ]);

  return {
    plannableAssignments: assignmentRow.plannableAssignments,
    openServices: assignmentRow.openServices,
    capacityBySector: capacityRows,
    availablePersonnelToday: availableRow.availablePersonnelToday,
    activeInterestRounds: interestRow.activeInterestRounds,
    interestedResponses: interestRow.interestedResponses,
    leaveOrSickImpactToday: leaveRow.leaveOrSickImpactToday,
    canReadPlanning,
    canReadPersonnel,
  };
}

export async function getAdministrationDashboardMetrics(): Promise<AdministrationDashboardMetrics> {
  const tenantId = await getCurrentTenantId();
  const canReadInvoices = await hasPermission("invoices", "read");

  if (!canReadInvoices) {
    return {
      invoiceProposals: 0,
      draftInvoices: 0,
      outstandingAmount: 0,
      outstandingCount: 0,
      openBatches: 0,
      openMolliePayments: 0,
      failedMolliePayments: 0,
      extraWorkLinesToReview: 0,
      materialLinesToReview: 0,
      canReadInvoices,
    };
  }

  const [
    proposalRow,
    invoiceRow,
    batchRow,
    paymentRow,
    extraWorkRow,
    materialRow,
  ] = await Promise.all([
    db
      .select({ invoiceProposals: sql<number>`count(*)::int` })
      .from(assignmentsTable)
      .where(
        and(
          eq(assignmentsTable.tenantId, tenantId),
          eq(assignmentsTable.status, "invoice_ready"),
        ),
      )
      .then(([row]) => row ?? { invoiceProposals: 0 }),

    db
      .select({
        draftInvoices: sql<number>`count(*) filter (where ${invoicesTable.status} = 'draft')::int`,
        outstandingCount: sql<number>`count(*) filter (where ${invoicesTable.status} = 'sent')::int`,
        outstandingAmount: sql<string>`coalesce(sum(${invoicesTable.totalAmount}) filter (where ${invoicesTable.status} = 'sent'), 0)::text`,
      })
      .from(invoicesTable)
      .innerJoin(
        assignmentsTable,
        eq(invoicesTable.assignmentId, assignmentsTable.id),
      )
      .where(eq(assignmentsTable.tenantId, tenantId))
      .then(
        ([row]) =>
          row ?? {
            draftInvoices: 0,
            outstandingCount: 0,
            outstandingAmount: "0",
          },
      ),

    db
      .select({ openBatches: sql<number>`count(*)::int` })
      .from(customerPaymentBatchesTable)
      .innerJoin(
        customersTable,
        eq(customerPaymentBatchesTable.customerId, customersTable.id),
      )
      .where(
        and(
          eq(customersTable.tenantId, tenantId),
          eq(customerPaymentBatchesTable.status, "open"),
        ),
      )
      .then(([row]) => row ?? { openBatches: 0 }),

    db
      .select({
        openMolliePayments: sql<number>`count(*) filter (where ${paymentsTable.status} = 'open')::int`,
        failedMolliePayments: sql<number>`count(*) filter (where ${paymentsTable.status} in ('failed','expired','canceled'))::int`,
      })
      .from(paymentsTable)
      .innerJoin(invoicesTable, eq(paymentsTable.invoiceId, invoicesTable.id))
      .innerJoin(
        assignmentsTable,
        eq(invoicesTable.assignmentId, assignmentsTable.id),
      )
      .where(eq(assignmentsTable.tenantId, tenantId))
      .then(
        ([row]) => row ?? { openMolliePayments: 0, failedMolliePayments: 0 },
      ),

    db
      .select({ extraWorkLinesToReview: sql<number>`count(*)::int` })
      .from(assignmentExtraWorkTable)
      .innerJoin(
        assignmentsTable,
        eq(assignmentExtraWorkTable.assignmentId, assignmentsTable.id),
      )
      .where(
        and(
          eq(assignmentsTable.tenantId, tenantId),
          inArray(assignmentsTable.status, [
            "completed",
            "report_submitted",
            "report_approved",
            "invoice_ready",
          ]),
        ),
      )
      .then(([row]) => row ?? { extraWorkLinesToReview: 0 }),

    db
      .select({ materialLinesToReview: sql<number>`count(*)::int` })
      .from(assignmentMaterialUsageTable)
      .innerJoin(
        assignmentsTable,
        eq(assignmentMaterialUsageTable.assignmentId, assignmentsTable.id),
      )
      .where(
        and(
          eq(assignmentsTable.tenantId, tenantId),
          inArray(assignmentsTable.status, [
            "completed",
            "report_submitted",
            "report_approved",
            "invoice_ready",
          ]),
        ),
      )
      .then(([row]) => row ?? { materialLinesToReview: 0 }),
  ]);

  return {
    invoiceProposals: proposalRow.invoiceProposals,
    draftInvoices: invoiceRow.draftInvoices,
    outstandingAmount: toNumber(invoiceRow.outstandingAmount),
    outstandingCount: invoiceRow.outstandingCount,
    openBatches: batchRow.openBatches,
    openMolliePayments: paymentRow.openMolliePayments,
    failedMolliePayments: paymentRow.failedMolliePayments,
    extraWorkLinesToReview: extraWorkRow.extraWorkLinesToReview,
    materialLinesToReview: materialRow.materialLinesToReview,
    canReadInvoices,
  };
}

// ─── Financieel widget ────────────────────────────────────────────────────────

export async function getDashboardFinancials(): Promise<DashboardFinancials | null> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return null;

  const tenantId = await getCurrentTenantId();
  const now = new Date();

  const thisMonthStart = toDateString(
    new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStart = toDateString(lastMonthDate);
  const lastMonthEnd = toDateString(
    new Date(now.getFullYear(), now.getMonth(), 0),
  );

  const [row] = await db
    .select({
      revenueThisMonth: sql<string>`coalesce(sum(${invoicesTable.totalAmount}) FILTER (
                           WHERE ${invoicesTable.status} = 'paid' AND ${invoicesTable.paidDate} >= ${thisMonthStart}
                         ), 0)::text`,
      revenueLastMonth: sql<string>`coalesce(sum(${invoicesTable.totalAmount}) FILTER (
                           WHERE ${invoicesTable.status} = 'paid'
                           AND ${invoicesTable.paidDate} >= ${lastMonthStart}
                           AND ${invoicesTable.paidDate} <= ${lastMonthEnd}
                         ), 0)::text`,
      outstandingAmount: sql<string>`coalesce(sum(${invoicesTable.totalAmount}) FILTER (
                           WHERE ${invoicesTable.status} = 'sent'
                         ), 0)::text`,
      outstandingCount: sql<number>`count(*) FILTER (WHERE ${invoicesTable.status} = 'sent')::int`,
    })
    .from(invoicesTable)
    .innerJoin(
      assignmentsTable,
      eq(invoicesTable.assignmentId, assignmentsTable.id),
    )
    .where(eq(assignmentsTable.tenantId, tenantId));

  const thisMonth = parseFloat(row?.revenueThisMonth ?? "0");
  const lastMonth = parseFloat(row?.revenueLastMonth ?? "0");
  const outstanding = parseFloat(row?.outstandingAmount ?? "0");

  let deltaPercent: number | null = null;
  if (lastMonth > 0) {
    deltaPercent = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
  }

  return {
    revenueThisMonth: thisMonth,
    revenueLastMonth: lastMonth,
    outstandingAmount: outstanding,
    outstandingCount: row?.outstandingCount ?? 0,
    deltaPercent,
  };
}

// ─── Actiepunten ──────────────────────────────────────────────────────────────

export async function getDashboardActionItems(): Promise<DashboardActionItems> {
  const tenantId = await getCurrentTenantId();
  const [canReadReports, canReadInvoices, canReadQuotes, canReadAssignments] =
    await Promise.all([
      hasPermission("reports", "read"),
      hasPermission("invoices", "read"),
      hasPermission("quotes", "read"),
      hasPermission("assignments", "read"),
    ]);

  const queries: Array<Promise<number>> = [
    canReadReports
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(reportsTable)
          .innerJoin(
            assignmentsTable,
            eq(reportsTable.assignmentId, assignmentsTable.id),
          )
          .where(
            and(
              eq(assignmentsTable.tenantId, tenantId),
              eq(reportsTable.status, "submitted"),
            ),
          )
          .then(([r]) => r?.count ?? 0)
      : Promise.resolve(0),

    canReadInvoices
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(invoicesTable)
          .innerJoin(
            assignmentsTable,
            eq(invoicesTable.assignmentId, assignmentsTable.id),
          )
          .where(
            and(
              eq(assignmentsTable.tenantId, tenantId),
              eq(invoicesTable.status, "draft"),
            ),
          )
          .then(([r]) => r?.count ?? 0)
      : Promise.resolve(0),

    canReadQuotes
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(quotesTable)
          .innerJoin(
            assignmentsTable,
            eq(quotesTable.assignmentId, assignmentsTable.id),
          )
          .where(
            and(
              eq(assignmentsTable.tenantId, tenantId),
              eq(quotesTable.status, "sent"),
            ),
          )
          .then(([r]) => r?.count ?? 0)
      : Promise.resolve(0),

    canReadAssignments
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(assignmentsTable)
          .where(
            and(
              eq(assignmentsTable.tenantId, tenantId),
              eq(assignmentsTable.status, "plannable"),
              notExists(
                db
                  .select({ id: assignmentPersonnelTable.id })
                  .from(assignmentPersonnelTable)
                  .where(
                    and(
                      eq(
                        assignmentPersonnelTable.assignmentId,
                        assignmentsTable.id,
                      ),
                      // Only confirmed (assigned) links count — 'suggested' candidates
                      // don't yet constitute confirmed personnel for this assignment
                      eq(assignmentPersonnelTable.status, "assigned"),
                    ),
                  ),
              ),
            ),
          )
          .then(([r]) => r?.count ?? 0)
      : Promise.resolve(0),
  ];

  const [pendingReports, invoicesToSend, pendingQuotes, plannableNoPersonnel] =
    await Promise.all(queries);

  return {
    pendingReports,
    invoicesToSend,
    pendingQuotes,
    plannableNoPersonnel,
    canReadReports,
    canReadInvoices,
    canReadQuotes,
    canReadAssignments,
  };
}

// ─── Personeelsbeschikbaarheid ────────────────────────────────────────────────

export async function getDashboardStaffAvailability(
  dateStr: string,
): Promise<StaffAvailabilityEntry[]> {
  const canRead = await hasPermission("personnel", "read");
  if (!canRead) return [];

  const tenantId = await getCurrentTenantId();
  const rows = await db
    .select({
      id: personnelTable.id,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
    })
    .from(personnelTable)
    .where(
      and(
        eq(personnelTable.tenantId, tenantId),
        eq(personnelTable.isActive, true),
      ),
    );

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const statusMap = await getBatchAvailabilityStatus(ids, dateStr);

  return rows.map((r) => ({
    personnelId: r.id,
    name: `${r.firstName} ${r.lastName}`.trim(),
    status: statusMap[r.id] ?? "niet_ingesteld",
  }));
}

// ─── Activiteitenfeed ─────────────────────────────────────────────────────────

export async function getDashboardRecentActivity(
  limit = 10,
): Promise<ActivityEntry[]> {
  const canRead = await hasPermission("settings", "read");
  if (!canRead) return [];

  const tenantId = await getCurrentTenantId();
  const tenantActors = await db
    .select({ userId: tenantUsersTable.userId })
    .from(tenantUsersTable)
    .where(
      and(
        eq(tenantUsersTable.tenantId, tenantId),
        eq(tenantUsersTable.status, "active"),
      ),
    );
  const tenantActorIds = tenantActors.map((row) => row.userId);
  if (tenantActorIds.length === 0) return [];

  const logRows = await db
    .select({
      id: auditLogTable.id,
      userId: auditLogTable.userId,
      action: auditLogTable.action,
      resource: auditLogTable.resource,
      resourceId: auditLogTable.resourceId,
      createdAt: auditLogTable.createdAt,
    })
    .from(auditLogTable)
    .where(inArray(auditLogTable.userId, tenantActorIds))
    .orderBy(desc(auditLogTable.createdAt))
    .limit(limit);

  if (logRows.length === 0) return [];

  const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001";
  const userIds = [
    ...new Set(
      logRows.map((r) => r.userId).filter((id) => id !== SYSTEM_ACTOR),
    ),
  ];

  const personnelRows =
    userIds.length > 0
      ? await db
          .select({
            userId: personnelTable.userId,
            firstName: personnelTable.firstName,
            lastName: personnelTable.lastName,
          })
          .from(personnelTable)
          .where(inArray(personnelTable.userId, userIds))
      : [];

  const nameByUserId = new Map<string, string>();
  for (const p of personnelRows) {
    if (p.userId)
      nameByUserId.set(p.userId, `${p.firstName} ${p.lastName}`.trim());
  }

  return logRows.map((r) => {
    let userName: string;
    if (r.userId === SYSTEM_ACTOR) {
      userName = "Systeem";
    } else {
      userName = nameByUserId.get(r.userId) ?? r.userId.slice(0, 8) + "…";
    }

    const actionLabel =
      ACTION_LABELS[r.action] ??
      `${r.action} (${RESOURCE_LABELS[r.resource] ?? r.resource})`;

    return {
      id: r.id,
      action: r.action,
      actionLabel,
      resource: r.resource,
      resourceId: r.resourceId,
      userName,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

// ─── Weekoverzicht ────────────────────────────────────────────────────────────

export async function getDashboardWeekCounts(): Promise<WeekDayCount[]> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return [];

  const tenantId = await getCurrentTenantId();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = getMondayOfWeek(today);

  const days: WeekDayCount[] = [];
  const dayNames = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
  const dateStrings: string[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const ds = toDateString(d);
    dateStrings.push(ds);
    days.push({
      date: ds,
      dayLabel: dayNames[i],
      count: 0,
      isToday: ds === toDateString(today),
    });
  }

  const weekStart = dateStrings[0];
  const weekEnd = dateStrings[6];

  const rows = await db
    .select({
      scheduledDate: assignmentsTable.scheduledDate,
      count: sql<number>`count(*)::int`,
    })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.tenantId, tenantId),
        gte(assignmentsTable.scheduledDate, weekStart),
        lte(assignmentsTable.scheduledDate, weekEnd),
      ),
    )
    .groupBy(assignmentsTable.scheduledDate);

  const countByDate = new Map<string, number>();
  for (const r of rows) {
    if (r.scheduledDate) countByDate.set(r.scheduledDate, r.count);
  }

  return days.map((d) => ({ ...d, count: countByDate.get(d.date) ?? 0 }));
}
