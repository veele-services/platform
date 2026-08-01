"use server";

import {
  db,
  isTenantModuleEnabled,
  personnelNotificationsTable,
  personnelTable,
  scanVisibleNotificationPages,
  type NotificationPageCursor,
} from "@workspace/db";
import { sanitizePersonnelPortalHref } from "@workspace/db/portal-routes";
import { createClient } from "@/lib/supabase/server";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type PersonnelNotificationItem = {
  id: string;
  title: string;
  body: string | null;
  category: string;
  priority: string;
  sourceLabel: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationSummary = {
  unreadCount: number;
  recentUnread: PersonnelNotificationItem[];
};

type ActionResult = { success: boolean; error?: string };

type PersonnelNotificationEntitlements = {
  documents: boolean;
  inventory: boolean;
  knowledgebase: boolean;
  materials: boolean;
  releases: boolean;
};
const NOTIFICATION_PAGE_SIZE = 100;
const NOTIFICATION_ITEM_LIMIT = 80;

async function getCurrentPersonnelIdentity(): Promise<{
  personnelId: string;
  tenantId: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ id: personnelTable.id, tenantId: personnelTable.tenantId })
    .from(personnelTable)
    .where(
      and(
        eq(personnelTable.userId, user.id),
        eq(personnelTable.isActive, true),
      ),
    )
    .limit(1);

  return row ? { personnelId: row.id, tenantId: row.tenantId } : null;
}

async function getNotificationIdentity(): Promise<{
  personnelId: string;
  tenantId: string;
} | null> {
  const identity = await getCurrentPersonnelIdentity();
  if (!identity) return null;

  return (await isTenantModuleEnabled(identity.tenantId, "notifications"))
    ? identity
    : null;
}

function mapNotification(
  row: typeof personnelNotificationsTable.$inferSelect,
): PersonnelNotificationItem {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    priority: row.priority,
    sourceLabel: row.sourceLabel,
    href: sanitizePersonnelPortalHref(row.href),
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function getNotificationEntitlements(
  tenantId: string,
): Promise<PersonnelNotificationEntitlements> {
  const [documents, inventory, knowledgebase, materials, releases] =
    await Promise.all([
      isTenantModuleEnabled(tenantId, "documents"),
      isTenantModuleEnabled(tenantId, "inventory"),
      isTenantModuleEnabled(tenantId, "knowledgebase"),
      isTenantModuleEnabled(tenantId, "materials"),
      isTenantModuleEnabled(tenantId, "releases"),
    ]);

  return { documents, inventory, knowledgebase, materials, releases };
}

function isNotificationAccessible(
  notification: PersonnelNotificationItem,
  entitlements: PersonnelNotificationEntitlements,
): boolean {
  const pathname = (notification.href ?? "/").split(/[?#]/u, 1)[0] ?? "/";
  const requiresDocuments =
    pathname === "/documenten" || pathname.startsWith("/documenten/");
  const requiresKnowledgebase =
    pathname === "/help" || pathname.startsWith("/help/");
  const requiresReleases =
    pathname === "/releases" || pathname.startsWith("/releases/");
  const requiresInventory =
    pathname === "/scan/inventory" ||
    pathname.startsWith("/scan/inventory/") ||
    pathname === "/i" ||
    pathname.startsWith("/i/") ||
    /^\/opdrachten\/[^/]+\/inventaris(?:\/|$)/u.test(pathname);
  const requiresMaterials = /^\/opdrachten\/[^/]+\/materiaal(?:\/|$)/u.test(
    pathname,
  );

  return (
    (!requiresDocuments || entitlements.documents) &&
    (!requiresInventory || entitlements.inventory) &&
    (!requiresKnowledgebase || entitlements.knowledgebase) &&
    (!requiresMaterials || entitlements.materials) &&
    (!requiresReleases || entitlements.releases)
  );
}

function revalidateNotificationSurfaces() {
  revalidatePath("/");
  revalidatePath("/meldingen");
  revalidatePath("/berichten");
}

async function loadPersonnelNotificationPage({
  personnelId,
  tenantId,
  cursor,
  unreadOnly,
}: {
  personnelId: string;
  tenantId: string;
  cursor: NotificationPageCursor | null;
  unreadOnly: boolean;
}) {
  return db
    .select()
    .from(personnelNotificationsTable)
    .where(
      and(
        eq(personnelNotificationsTable.personnelId, personnelId),
        eq(personnelNotificationsTable.tenantId, tenantId),
        isNull(personnelNotificationsTable.deletedAt),
        unreadOnly ? isNull(personnelNotificationsTable.readAt) : undefined,
        cursor
          ? or(
              lt(personnelNotificationsTable.createdAt, cursor.createdAt),
              and(
                eq(personnelNotificationsTable.createdAt, cursor.createdAt),
                lt(personnelNotificationsTable.id, cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(
      desc(personnelNotificationsTable.createdAt),
      desc(personnelNotificationsTable.id),
    )
    .limit(NOTIFICATION_PAGE_SIZE);
}

export async function getMyNotifications(): Promise<
  PersonnelNotificationItem[]
> {
  const identity = await getNotificationIdentity();
  if (!identity) return [];

  const entitlements = await getNotificationEntitlements(identity.tenantId);
  const result = await scanVisibleNotificationPages({
    pageSize: NOTIFICATION_PAGE_SIZE,
    itemLimit: NOTIFICATION_ITEM_LIMIT,
    countAll: false,
    loadPage: (cursor) =>
      loadPersonnelNotificationPage({
        personnelId: identity.personnelId,
        tenantId: identity.tenantId,
        cursor,
        unreadOnly: false,
      }),
    mapRow: mapNotification,
    isVisible: (notification) =>
      isNotificationAccessible(notification, entitlements),
  });

  return result.items;
}

export async function getMyNotificationSummary(): Promise<NotificationSummary> {
  const identity = await getNotificationIdentity();
  if (!identity) return { unreadCount: 0, recentUnread: [] };

  const entitlements = await getNotificationEntitlements(identity.tenantId);
  const result = await scanVisibleNotificationPages({
    pageSize: NOTIFICATION_PAGE_SIZE,
    itemLimit: 3,
    countAll: true,
    loadPage: (cursor) =>
      loadPersonnelNotificationPage({
        personnelId: identity.personnelId,
        tenantId: identity.tenantId,
        cursor,
        unreadOnly: true,
      }),
    mapRow: mapNotification,
    isVisible: (notification) =>
      isNotificationAccessible(notification, entitlements),
  });

  return {
    unreadCount: result.visibleCount,
    recentUnread: result.items,
  };
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const identity = await getNotificationIdentity();
  if (!identity) {
    return { success: false, error: "Meldingen zijn niet beschikbaar" };
  }

  await db
    .update(personnelNotificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(personnelNotificationsTable.id, id),
        eq(personnelNotificationsTable.personnelId, identity.personnelId),
        eq(personnelNotificationsTable.tenantId, identity.tenantId),
        isNull(personnelNotificationsTable.deletedAt),
      ),
    );

  revalidateNotificationSurfaces();
  return { success: true };
}

export async function markNotificationUnread(
  id: string,
): Promise<ActionResult> {
  const identity = await getNotificationIdentity();
  if (!identity) {
    return { success: false, error: "Meldingen zijn niet beschikbaar" };
  }

  await db
    .update(personnelNotificationsTable)
    .set({ readAt: null })
    .where(
      and(
        eq(personnelNotificationsTable.id, id),
        eq(personnelNotificationsTable.personnelId, identity.personnelId),
        eq(personnelNotificationsTable.tenantId, identity.tenantId),
        isNull(personnelNotificationsTable.deletedAt),
      ),
    );

  revalidateNotificationSurfaces();
  return { success: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const identity = await getNotificationIdentity();
  if (!identity) {
    return { success: false, error: "Meldingen zijn niet beschikbaar" };
  }

  await db
    .update(personnelNotificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(personnelNotificationsTable.personnelId, identity.personnelId),
        eq(personnelNotificationsTable.tenantId, identity.tenantId),
        isNull(personnelNotificationsTable.deletedAt),
      ),
    );

  revalidateNotificationSurfaces();
  return { success: true };
}

export async function markAllNotificationsUnread(): Promise<ActionResult> {
  const identity = await getNotificationIdentity();
  if (!identity) {
    return { success: false, error: "Meldingen zijn niet beschikbaar" };
  }

  await db
    .update(personnelNotificationsTable)
    .set({ readAt: null })
    .where(
      and(
        eq(personnelNotificationsTable.personnelId, identity.personnelId),
        eq(personnelNotificationsTable.tenantId, identity.tenantId),
        isNull(personnelNotificationsTable.deletedAt),
      ),
    );

  revalidateNotificationSurfaces();
  return { success: true };
}

export async function deleteNotification(id: string): Promise<ActionResult> {
  return deleteNotifications([id]);
}

export async function deleteNotifications(
  ids: string[],
): Promise<ActionResult> {
  const identity = await getNotificationIdentity();
  if (!identity) {
    return { success: false, error: "Meldingen zijn niet beschikbaar" };
  }
  const cleanIds = ids.filter(Boolean);
  if (cleanIds.length === 0) return { success: true };

  await db
    .update(personnelNotificationsTable)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(personnelNotificationsTable.personnelId, identity.personnelId),
        eq(personnelNotificationsTable.tenantId, identity.tenantId),
        inArray(personnelNotificationsTable.id, cleanIds),
        isNull(personnelNotificationsTable.deletedAt),
      ),
    );

  revalidateNotificationSurfaces();
  return { success: true };
}

export async function clearAllNotifications(): Promise<ActionResult> {
  const identity = await getNotificationIdentity();
  if (!identity) {
    return { success: false, error: "Meldingen zijn niet beschikbaar" };
  }

  await db
    .update(personnelNotificationsTable)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(personnelNotificationsTable.personnelId, identity.personnelId),
        eq(personnelNotificationsTable.tenantId, identity.tenantId),
        isNull(personnelNotificationsTable.deletedAt),
      ),
    );

  revalidateNotificationSurfaces();
  return { success: true };
}
