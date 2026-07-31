"use server";

import { customerNotificationsTable, db } from "@workspace/db";
import {
  customerPortalRoutes,
  sanitizeCustomerPortalHref,
} from "@workspace/db/portal-routes";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getMyAssignments } from "./assignments";
import { getMyCustomerIdentity } from "./customer";
import { getMyInvoices } from "./invoices";
import { getMyQuotes } from "./quotes";
import { getMyReports } from "./reports";

type CustomerNotificationCategory =
  | "invoice"
  | "quote"
  | "report"
  | "request"
  | "planning"
  | "news"
  | "releases"
  | "message"
  | "system";

type CustomerNotificationPriority = "low" | "normal" | "high";

export type CustomerNotification = {
  id: string;
  title: string;
  body: string;
  category: CustomerNotificationCategory;
  priority: CustomerNotificationPriority;
  kind: "communication" | "action";
  href: string;
  sourceLabel: string | null;
  readAt: string | null;
  createdAt: string;
};

export type CustomerNotificationSummary = {
  unreadCount: number;
  recent: CustomerNotification[];
};

type ActionResult = { success: boolean; error?: string };

const CATEGORY_SET = new Set<CustomerNotificationCategory>([
  "invoice",
  "quote",
  "report",
  "request",
  "planning",
  "news",
  "releases",
  "message",
  "system",
]);

const PRIORITY_SET = new Set<CustomerNotificationPriority>([
  "low",
  "normal",
  "high",
]);

function normalizeCategory(category: string): CustomerNotificationCategory {
  return CATEGORY_SET.has(category as CustomerNotificationCategory)
    ? (category as CustomerNotificationCategory)
    : "system";
}

function normalizePriority(priority: string): CustomerNotificationPriority {
  return PRIORITY_SET.has(priority as CustomerNotificationPriority)
    ? (priority as CustomerNotificationPriority)
    : "normal";
}

function mapPersistedNotification(
  row: typeof customerNotificationsTable.$inferSelect,
): CustomerNotification {
  return {
    id: row.id,
    title: row.title,
    body: row.body ?? "",
    category: normalizeCategory(row.category),
    priority: normalizePriority(row.priority),
    kind: "communication",
    href: sanitizeCustomerPortalHref(row.href),
    sourceLabel: row.sourceLabel,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function revalidateNotificationSurfaces() {
  revalidatePath("/");
  revalidatePath("/meldingen");
}

export async function getMyCustomerNotifications(): Promise<
  CustomerNotification[]
> {
  const identity = await getMyCustomerIdentity();

  const notifications: CustomerNotification[] = [];

  if (identity) {
    const persistedRows = await db
      .select()
      .from(customerNotificationsTable)
      .where(
        and(
          eq(customerNotificationsTable.customerId, identity.customerId),
          eq(customerNotificationsTable.tenantId, identity.tenantId),
          isNull(customerNotificationsTable.deletedAt),
        ),
      )
      .orderBy(desc(customerNotificationsTable.createdAt))
      .limit(80);

    notifications.push(...persistedRows.map(mapPersistedNotification));
  }

  return notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMyCustomerOpenActions(options: {
  finance: boolean;
  reporting: boolean;
}): Promise<CustomerNotification[]> {
  const [assignments, invoices, quotes, reports] = await Promise.all([
    getMyAssignments(),
    options.finance ? getMyInvoices() : Promise.resolve([]),
    options.finance ? getMyQuotes() : Promise.resolve([]),
    options.reporting ? getMyReports() : Promise.resolve([]),
  ]);
  const notifications: CustomerNotification[] = [];

  for (const invoice of invoices.filter((item) => item.status === "sent")) {
    notifications.push({
      id: `invoice-${invoice.id}`,
      title: `Factuur ${invoice.invoiceNumber} staat open`,
      body: `Te betalen: ${Number.parseFloat(invoice.totalAmount).toLocaleString("nl-NL", { style: "currency", currency: "EUR" })}.`,
      category: "invoice",
      priority: "high",
      kind: "action",
      href: customerPortalRoutes.invoice(invoice.id),
      sourceLabel: "Financieel",
      readAt: null,
      createdAt: invoice.createdAt,
    });
  }

  for (const quote of quotes.filter(
    (item) => item.assignmentStatus === "awaiting_approval",
  )) {
    notifications.push({
      id: `quote-${quote.id}`,
      title: `Offerte ${quote.quoteNumber} wacht op akkoord`,
      body: `${quote.assignmentTitle} is klaar om te beoordelen.`,
      category: "quote",
      priority: "high",
      kind: "action",
      href: "/offertes",
      sourceLabel: "Offertes",
      readAt: null,
      createdAt: quote.createdAt,
    });
  }

  for (const report of reports.slice(0, 5)) {
    notifications.push({
      id: `report-${report.id}`,
      title: "Nieuw rapport beschikbaar",
      body: report.assignmentTitle,
      category: "report",
      priority: "normal",
      kind: "action",
      href: "/rapporten",
      sourceLabel: "Rapportage",
      readAt: null,
      createdAt: report.submittedAt,
    });
  }

  for (const assignment of assignments
    .filter((item) =>
      ["requested", "review", "quote_preparation"].includes(item.status),
    )
    .slice(0, 5)) {
    notifications.push({
      id: `request-${assignment.id}`,
      title: "Aanvraag in behandeling",
      body: assignment.title,
      category: "request",
      priority: "low",
      kind: "action",
      href: customerPortalRoutes.assignment(assignment.id),
      sourceLabel: "Aanvragen",
      readAt: null,
      createdAt: assignment.createdAt,
    });
  }

  return notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMyCustomerNotificationSummary(): Promise<CustomerNotificationSummary> {
  const notifications = await getMyCustomerNotifications();
  const actionable = notifications.filter(
    (item) =>
      item.kind === "communication" &&
      item.category !== "system" &&
      !item.readAt,
  );
  return {
    unreadCount: actionable.length,
    recent: actionable.slice(0, 3),
  };
}

export async function markCustomerNotificationRead(
  id: string,
): Promise<ActionResult> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd" };

  await db
    .update(customerNotificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(customerNotificationsTable.id, id),
        eq(customerNotificationsTable.customerId, identity.customerId),
        eq(customerNotificationsTable.tenantId, identity.tenantId),
        isNull(customerNotificationsTable.deletedAt),
      ),
    );

  revalidateNotificationSurfaces();
  return { success: true };
}

export async function markCustomerNotificationUnread(
  id: string,
): Promise<ActionResult> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd" };

  await db
    .update(customerNotificationsTable)
    .set({ readAt: null })
    .where(
      and(
        eq(customerNotificationsTable.id, id),
        eq(customerNotificationsTable.customerId, identity.customerId),
        eq(customerNotificationsTable.tenantId, identity.tenantId),
        isNull(customerNotificationsTable.deletedAt),
      ),
    );

  revalidateNotificationSurfaces();
  return { success: true };
}

export async function markAllCustomerNotificationsRead(): Promise<ActionResult> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd" };

  await db
    .update(customerNotificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(customerNotificationsTable.customerId, identity.customerId),
        eq(customerNotificationsTable.tenantId, identity.tenantId),
        isNull(customerNotificationsTable.deletedAt),
      ),
    );

  revalidateNotificationSurfaces();
  return { success: true };
}

export async function markAllCustomerNotificationsUnread(): Promise<ActionResult> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd" };

  await db
    .update(customerNotificationsTable)
    .set({ readAt: null })
    .where(
      and(
        eq(customerNotificationsTable.customerId, identity.customerId),
        eq(customerNotificationsTable.tenantId, identity.tenantId),
        isNull(customerNotificationsTable.deletedAt),
      ),
    );

  revalidateNotificationSurfaces();
  return { success: true };
}

export async function deleteCustomerNotification(
  id: string,
): Promise<ActionResult> {
  return deleteCustomerNotifications([id]);
}

export async function deleteCustomerNotifications(
  ids: string[],
): Promise<ActionResult> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd" };
  const cleanIds = ids.filter(Boolean);
  if (cleanIds.length === 0) return { success: true };

  await db
    .update(customerNotificationsTable)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(customerNotificationsTable.customerId, identity.customerId),
        eq(customerNotificationsTable.tenantId, identity.tenantId),
        inArray(customerNotificationsTable.id, cleanIds),
        isNull(customerNotificationsTable.deletedAt),
      ),
    );

  revalidateNotificationSurfaces();
  return { success: true };
}

export async function clearAllCustomerNotifications(): Promise<ActionResult> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd" };

  await db
    .update(customerNotificationsTable)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(customerNotificationsTable.customerId, identity.customerId),
        eq(customerNotificationsTable.tenantId, identity.tenantId),
        isNull(customerNotificationsTable.deletedAt),
      ),
    );

  revalidateNotificationSurfaces();
  return { success: true };
}
