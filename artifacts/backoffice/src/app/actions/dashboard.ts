"use server";

import { db } from "@workspace/db";
import {
  assignmentsTable,
  assignmentPersonnelTable,
  invoicesTable,
  paymentsTable,
  reportsTable,
  quotesTable,
  personnelTable,
  auditLogTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, inArray, desc, notExists } from "drizzle-orm";
import { hasPermission } from "@/lib/auth/permissions";
import { getBatchAvailabilityStatus } from "./availability";
import type { AvailabilityStatus } from "./availability";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DashboardPayments = {
  paidThisMonthCount:   number;
  paidThisMonthAmount:  number;
  mollieOpenCount:      number;
  mollieOpenAmountEur:  number;
};

export type DashboardFinancials = {
  revenueThisMonth:    number;
  revenueLastMonth:    number;
  outstandingAmount:   number;
  outstandingCount:    number;
  deltaPercent:        number | null;
};

export type DashboardActionItems = {
  pendingReports:      number;
  invoicesToSend:      number;
  pendingQuotes:       number;
  plannableNoPersonnel: number;
  canReadReports:      boolean;
  canReadInvoices:     boolean;
  canReadQuotes:       boolean;
  canReadAssignments:  boolean;
};

export type StaffAvailabilityEntry = {
  personnelId: string;
  name:        string;
  status:      AvailabilityStatus;
};

export type ActivityEntry = {
  id:         string;
  action:     string;
  actionLabel: string;
  resource:   string;
  resourceId: string | null;
  userName:   string;
  createdAt:  string;
};

export type WeekDayCount = {
  date:     string;
  dayLabel: string;
  count:    number;
  isToday:  boolean;
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

const ACTION_LABELS: Record<string, string> = {
  create_invoice:          "Factuur aangemaakt",
  mark_invoice_sent:       "Factuur verzonden",
  mark_invoice_paid:       "Factuur als betaald gemarkeerd",
  cancel_invoice:          "Factuur geannuleerd",
  create_mollie_payment:   "Betaallink aangemaakt",
  mollie_payment_received: "Betaling ontvangen (Mollie)",
  create_quote:            "Offerte aangemaakt",
  send_quote:              "Offerte verzonden",
  approve_quote:           "Offerte goedgekeurd",
  reject_quote:            "Offerte afgewezen",
  submit_report:           "Rapport ingediend",
  approve_report:          "Rapport goedgekeurd",
  reject_report:           "Rapport afgekeurd",
  create:                  "Record aangemaakt",
  update:                  "Record bijgewerkt",
  delete:                  "Record verwijderd",
  invite:                  "Gebruiker uitgenodigd",
  deactivate:              "Gebruiker gedeactiveerd",
  grant_permission:        "Recht verleend",
  revoke_permission:       "Recht ingetrokken",
  update_permissions:      "Rechten bijgewerkt",
  login:                   "Ingelogd",
  logout:                  "Uitgelogd",
};

const RESOURCE_LABELS: Record<string, string> = {
  invoices:    "Facturen",
  payments:    "Betalingen",
  quotes:      "Offertes",
  reports:     "Rapporten",
  assignments: "Opdrachten",
  customers:   "Klanten",
  objects:     "Objecten",
  personnel:   "Personeel",
  roles:       "Rollen",
  users:       "Gebruikers",
  settings:    "Instellingen",
};

// ─── Betalingen-widget ────────────────────────────────────────────────────────

export async function getDashboardPayments(): Promise<DashboardPayments | null> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return null;

  const now = new Date();
  const startOfMonth = toDateString(new Date(now.getFullYear(), now.getMonth(), 1));

  const [invoiceRow] = await db
    .select({
      paidThisMonthCount:  sql<number>`count(*) FILTER (WHERE status = 'paid' AND paid_date >= ${startOfMonth})::int`,
      paidThisMonthAmount: sql<string>`coalesce(sum(total_amount) FILTER (WHERE status = 'paid' AND paid_date >= ${startOfMonth}), 0)::text`,
    })
    .from(invoicesTable);

  const [paymentRow] = await db
    .select({
      mollieOpenCount:      sql<number>`count(*)::int`,
      mollieOpenAmountCents: sql<string>`coalesce(sum(amount_cents), 0)::text`,
    })
    .from(paymentsTable)
    .where(eq(paymentsTable.status, "open"));

  return {
    paidThisMonthCount:  invoiceRow?.paidThisMonthCount  ?? 0,
    paidThisMonthAmount: parseFloat(invoiceRow?.paidThisMonthAmount ?? "0"),
    mollieOpenCount:     paymentRow?.mollieOpenCount     ?? 0,
    mollieOpenAmountEur: Math.round((parseInt(paymentRow?.mollieOpenAmountCents ?? "0", 10)) / 100),
  };
}

// ─── Financieel widget ────────────────────────────────────────────────────────

export async function getDashboardFinancials(): Promise<DashboardFinancials | null> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return null;

  const now = new Date();

  const thisMonthStart = toDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  const lastMonthDate  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStart = toDateString(lastMonthDate);
  const lastMonthEnd   = toDateString(new Date(now.getFullYear(), now.getMonth(), 0));

  const [row] = await db
    .select({
      revenueThisMonth:  sql<string>`coalesce(sum(total_amount) FILTER (
                           WHERE status = 'paid' AND paid_date >= ${thisMonthStart}
                         ), 0)::text`,
      revenueLastMonth:  sql<string>`coalesce(sum(total_amount) FILTER (
                           WHERE status = 'paid'
                           AND paid_date >= ${lastMonthStart}
                           AND paid_date <= ${lastMonthEnd}
                         ), 0)::text`,
      outstandingAmount: sql<string>`coalesce(sum(total_amount) FILTER (
                           WHERE status = 'sent'
                         ), 0)::text`,
      outstandingCount:  sql<number>`count(*) FILTER (WHERE status = 'sent')::int`,
    })
    .from(invoicesTable);

  const thisMonth  = parseFloat(row?.revenueThisMonth  ?? "0");
  const lastMonth  = parseFloat(row?.revenueLastMonth  ?? "0");
  const outstanding = parseFloat(row?.outstandingAmount ?? "0");

  let deltaPercent: number | null = null;
  if (lastMonth > 0) {
    deltaPercent = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
  }

  return {
    revenueThisMonth:  thisMonth,
    revenueLastMonth:  lastMonth,
    outstandingAmount: outstanding,
    outstandingCount:  row?.outstandingCount ?? 0,
    deltaPercent,
  };
}

// ─── Actiepunten ──────────────────────────────────────────────────────────────

export async function getDashboardActionItems(): Promise<DashboardActionItems> {
  const [
    canReadReports,
    canReadInvoices,
    canReadQuotes,
    canReadAssignments,
  ] = await Promise.all([
    hasPermission("reports",     "read"),
    hasPermission("invoices",    "read"),
    hasPermission("quotes",      "read"),
    hasPermission("assignments", "read"),
  ]);

  const queries: Array<Promise<number>> = [
    canReadReports
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(reportsTable)
          .where(eq(reportsTable.status, "submitted"))
          .then(([r]) => r?.count ?? 0)
      : Promise.resolve(0),

    canReadInvoices
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(invoicesTable)
          .where(eq(invoicesTable.status, "draft"))
          .then(([r]) => r?.count ?? 0)
      : Promise.resolve(0),

    canReadQuotes
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(quotesTable)
          .where(eq(quotesTable.status, "sent"))
          .then(([r]) => r?.count ?? 0)
      : Promise.resolve(0),

    canReadAssignments
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(assignmentsTable)
          .where(
            and(
              eq(assignmentsTable.status, "plannable"),
              notExists(
                db
                  .select({ id: assignmentPersonnelTable.id })
                  .from(assignmentPersonnelTable)
                  .where(
                    and(
                      eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
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

  const rows = await db
    .select({ id: personnelTable.id, firstName: personnelTable.firstName, lastName: personnelTable.lastName })
    .from(personnelTable)
    .where(eq(personnelTable.isActive, true));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const statusMap = await getBatchAvailabilityStatus(ids, dateStr);

  return rows.map((r) => ({
    personnelId: r.id,
    name:        `${r.firstName} ${r.lastName}`.trim(),
    status:      statusMap[r.id] ?? "niet_ingesteld",
  }));
}

// ─── Activiteitenfeed ─────────────────────────────────────────────────────────

export async function getDashboardRecentActivity(
  limit = 10,
): Promise<ActivityEntry[]> {
  const canRead = await hasPermission("settings", "read");
  if (!canRead) return [];

  const logRows = await db
    .select({
      id:         auditLogTable.id,
      userId:     auditLogTable.userId,
      action:     auditLogTable.action,
      resource:   auditLogTable.resource,
      resourceId: auditLogTable.resourceId,
      createdAt:  auditLogTable.createdAt,
    })
    .from(auditLogTable)
    .orderBy(desc(auditLogTable.createdAt))
    .limit(limit);

  if (logRows.length === 0) return [];

  const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001";
  const userIds = [...new Set(logRows.map((r) => r.userId).filter((id) => id !== SYSTEM_ACTOR))];

  const personnelRows = userIds.length > 0
    ? await db
        .select({ userId: personnelTable.userId, firstName: personnelTable.firstName, lastName: personnelTable.lastName })
        .from(personnelTable)
        .where(inArray(personnelTable.userId, userIds))
    : [];

  const nameByUserId = new Map<string, string>();
  for (const p of personnelRows) {
    if (p.userId) nameByUserId.set(p.userId, `${p.firstName} ${p.lastName}`.trim());
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
      id:          r.id,
      action:      r.action,
      actionLabel,
      resource:    r.resource,
      resourceId:  r.resourceId,
      userName,
      createdAt:   r.createdAt.toISOString(),
    };
  });
}

// ─── Weekoverzicht ────────────────────────────────────────────────────────────

export async function getDashboardWeekCounts(): Promise<WeekDayCount[]> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return [];

  const today  = new Date();
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
      date:     ds,
      dayLabel: dayNames[i],
      count:    0,
      isToday:  ds === toDateString(today),
    });
  }

  const weekStart = dateStrings[0];
  const weekEnd   = dateStrings[6];

  const rows = await db
    .select({
      scheduledDate: assignmentsTable.scheduledDate,
      count:         sql<number>`count(*)::int`,
    })
    .from(assignmentsTable)
    .where(
      and(
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
