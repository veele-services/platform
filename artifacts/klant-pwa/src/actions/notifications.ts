"use server";

import {
  customerNotificationsTable,
  db,
  isTenantModuleEnabled,
  scanVisibleNotificationPages,
  type NotificationPageCursor,
} from "@workspace/db";
import {
  customerPortalRoutes,
  sanitizeCustomerPortalHref,
} from "@workspace/db/portal-routes";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

type CustomerNotificationEntitlements = {
  documents: boolean;
  finance: boolean;
  knowledgebase: boolean;
  reporting: boolean;
  releases: boolean;
};

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
const NOTIFICATION_PAGE_SIZE = 100;
const NOTIFICATION_ITEM_LIMIT = 80;

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

async function getNotificationIdentity() {
  const identity = await getMyCustomerIdentity();
  if (!identity) return null;

  return (await isTenantModuleEnabled(identity.tenantId, "notifications"))
    ? identity
    : null;
}

async function getNotificationEntitlements(
  tenantId: string,
): Promise<CustomerNotificationEntitlements> {
  const [documents, finance, knowledgebase, reporting, releases] =
    await Promise.all([
      isTenantModuleEnabled(tenantId, "documents"),
      isTenantModuleEnabled(tenantId, "finance"),
      isTenantModuleEnabled(tenantId, "knowledgebase"),
      isTenantModuleEnabled(tenantId, "reporting"),
      isTenantModuleEnabled(tenantId, "releases"),
    ]);
  return {
    documents,
    finance,
    knowledgebase,
    reporting,
    releases,
  };
}

function isNotificationAccessible(
  notification: CustomerNotification,
  entitlements: CustomerNotificationEntitlements,
): boolean {
  const pathname = notification.href.split(/[?#]/u, 1)[0] ?? "/";
  const requiresFinance =
    notification.category === "invoice" ||
    notification.category === "quote" ||
    [
      "/financieel",
      "/facturen",
      "/offertes",
      "/betalingen",
      "/api/factuur",
      "/api/offerte",
      "/api/verzamelfactuur",
    ].some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  const requiresReporting =
    notification.category === "report" ||
    pathname === "/rapporten" ||
    pathname.startsWith("/rapporten/");
  const requiresDocuments =
    pathname === "/documenten" || pathname.startsWith("/documenten/");
  const requiresKnowledgebase =
    pathname === "/help" || pathname.startsWith("/help/");
  const requiresReleases =
    notification.category === "releases" ||
    pathname === "/releases" ||
    pathname.startsWith("/releases/");

  return (
    (!requiresDocuments || entitlements.documents) &&
    (!requiresFinance || entitlements.finance) &&
    (!requiresKnowledgebase || entitlements.knowledgebase) &&
    (!requiresReporting || entitlements.reporting) &&
    (!requiresReleases || entitlements.releases)
  );
}

function revalidateNotificationSurfaces() {
  revalidatePath("/");
  revalidatePath("/meldingen");
}

async function loadCustomerNotificationPage({
  customerId,
  tenantId,
  cursor,
  unreadOnly,
}: {
  customerId: string;
  tenantId: string;
  cursor: NotificationPageCursor | null;
  unreadOnly: boolean;
}) {
  return db
    .select()
    .from(customerNotificationsTable)
    .where(
      and(
        eq(customerNotificationsTable.customerId, customerId),
        eq(customerNotificationsTable.tenantId, tenantId),
        isNull(customerNotificationsTable.deletedAt),
        unreadOnly ? isNull(customerNotificationsTable.readAt) : undefined,
        cursor
          ? or(
              lt(customerNotificationsTable.createdAt, cursor.createdAt),
              and(
                eq(customerNotificationsTable.createdAt, cursor.createdAt),
                lt(customerNotificationsTable.id, cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(
      desc(customerNotificationsTable.createdAt),
      desc(customerNotificationsTable.id),
    )
    .limit(NOTIFICATION_PAGE_SIZE);
}

export async function getMyCustomerNotifications(): Promise<
  CustomerNotification[]
> {
  const identity = await getNotificationIdentity();
  if (!identity) return [];

  const entitlements = await getNotificationEntitlements(identity.tenantId);
  const result = await scanVisibleNotificationPages({
    pageSize: NOTIFICATION_PAGE_SIZE,
    itemLimit: NOTIFICATION_ITEM_LIMIT,
    countAll: false,
    loadPage: (cursor) =>
      loadCustomerNotificationPage({
        customerId: identity.customerId,
        tenantId: identity.tenantId,
        cursor,
        unreadOnly: false,
      }),
    mapRow: mapPersistedNotification,
    isVisible: (notification) =>
      isNotificationAccessible(notification, entitlements),
  });

  return result.items;
}

export async function getMyCustomerOpenActions(options: {
  finance: boolean;
  reporting: boolean;
}): Promise<CustomerNotification[]> {
  const identity = await getNotificationIdentity();
  if (!identity) return [];
  const entitlements = await getNotificationEntitlements(identity.tenantId);
  const financeEnabled = options.finance && entitlements.finance;
  const reportingEnabled = options.reporting && entitlements.reporting;

  const [assignments, invoices, quotes, reports] = await Promise.all([
    getMyAssignments(),
    financeEnabled ? getMyInvoices() : Promise.resolve([]),
    financeEnabled ? getMyQuotes() : Promise.resolve([]),
    reportingEnabled ? getMyReports() : Promise.resolve([]),
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
  const identity = await getNotificationIdentity();
  if (!identity) return { unreadCount: 0, recent: [] };

  const entitlements = await getNotificationEntitlements(identity.tenantId);
  const result = await scanVisibleNotificationPages({
    pageSize: NOTIFICATION_PAGE_SIZE,
    itemLimit: 3,
    countAll: true,
    loadPage: (cursor) =>
      loadCustomerNotificationPage({
        customerId: identity.customerId,
        tenantId: identity.tenantId,
        cursor,
        unreadOnly: true,
      }),
    mapRow: mapPersistedNotification,
    isVisible: (notification) =>
      notification.category !== "system" &&
      isNotificationAccessible(notification, entitlements),
  });

  return {
    unreadCount: result.visibleCount,
    recent: result.items,
  };
}

export async function markCustomerNotificationRead(
  id: string,
): Promise<ActionResult> {
  const identity = await getNotificationIdentity();
  if (!identity) {
    return { success: false, error: "Meldingen zijn niet beschikbaar" };
  }

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

export async function markCustomerNotificationReadAndOpen(
  formData: FormData,
): Promise<never> {
  const identity = await getNotificationIdentity();
  if (!identity) redirect("/");

  const id = String(formData.get("notificationId") ?? "").trim();
  if (!id) redirect("/meldingen");

  const [[row], entitlements] = await Promise.all([
    db
      .select()
      .from(customerNotificationsTable)
      .where(
        and(
          eq(customerNotificationsTable.id, id),
          eq(customerNotificationsTable.customerId, identity.customerId),
          eq(customerNotificationsTable.tenantId, identity.tenantId),
          isNull(customerNotificationsTable.deletedAt),
        ),
      )
      .limit(1),
    getNotificationEntitlements(identity.tenantId),
  ]);
  if (!row) redirect("/meldingen");

  const notification = mapPersistedNotification(row);
  if (!isNotificationAccessible(notification, entitlements)) {
    redirect("/meldingen");
  }

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
  redirect(notification.href);
}

export async function markCustomerNotificationUnread(
  id: string,
): Promise<ActionResult> {
  const identity = await getNotificationIdentity();
  if (!identity) {
    return { success: false, error: "Meldingen zijn niet beschikbaar" };
  }

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
  const identity = await getNotificationIdentity();
  if (!identity) {
    return { success: false, error: "Meldingen zijn niet beschikbaar" };
  }

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
  const identity = await getNotificationIdentity();
  if (!identity) {
    return { success: false, error: "Meldingen zijn niet beschikbaar" };
  }

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
  const identity = await getNotificationIdentity();
  if (!identity) {
    return { success: false, error: "Meldingen zijn niet beschikbaar" };
  }
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
  const identity = await getNotificationIdentity();
  if (!identity) {
    return { success: false, error: "Meldingen zijn niet beschikbaar" };
  }

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
