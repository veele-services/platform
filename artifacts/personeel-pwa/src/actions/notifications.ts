"use server";

import {
  db,
  personnelNotificationsTable,
  personnelTable,
} from "@workspace/db";
import { sanitizePersonnelPortalHref } from "@workspace/db/portal-routes";
import { createClient } from "@/lib/supabase/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
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

async function getCurrentPersonnelIdentity(): Promise<{ personnelId: string; tenantId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ id: personnelTable.id, tenantId: personnelTable.tenantId })
    .from(personnelTable)
    .where(and(eq(personnelTable.userId, user.id), eq(personnelTable.isActive, true)))
    .limit(1);

  return row ? { personnelId: row.id, tenantId: row.tenantId } : null;
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

function revalidateNotificationSurfaces() {
  revalidatePath("/");
  revalidatePath("/meldingen");
  revalidatePath("/berichten");
}

export async function getMyNotifications(): Promise<PersonnelNotificationItem[]> {
  const identity = await getCurrentPersonnelIdentity();
  if (!identity) return [];

  const rows = await db
    .select()
    .from(personnelNotificationsTable)
    .where(
      and(
        eq(personnelNotificationsTable.personnelId, identity.personnelId),
        eq(personnelNotificationsTable.tenantId, identity.tenantId),
        isNull(personnelNotificationsTable.deletedAt),
      ),
    )
    .orderBy(desc(personnelNotificationsTable.createdAt))
    .limit(80);

  return rows.map(mapNotification);
}

export async function getMyNotificationSummary(): Promise<NotificationSummary> {
  const identity = await getCurrentPersonnelIdentity();
  if (!identity) return { unreadCount: 0, recentUnread: [] };

  const unreadRows = await db
    .select()
    .from(personnelNotificationsTable)
    .where(
      and(
        eq(personnelNotificationsTable.personnelId, identity.personnelId),
        eq(personnelNotificationsTable.tenantId, identity.tenantId),
        isNull(personnelNotificationsTable.deletedAt),
        isNull(personnelNotificationsTable.readAt),
      ),
    )
    .orderBy(desc(personnelNotificationsTable.createdAt))
    .limit(40);

  return {
    unreadCount: unreadRows.length,
    recentUnread: unreadRows.slice(0, 3).map(mapNotification),
  };
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const identity = await getCurrentPersonnelIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd" };

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

export async function markNotificationUnread(id: string): Promise<ActionResult> {
  const identity = await getCurrentPersonnelIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd" };

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
  const identity = await getCurrentPersonnelIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd" };

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
  const identity = await getCurrentPersonnelIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd" };

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

export async function deleteNotifications(ids: string[]): Promise<ActionResult> {
  const identity = await getCurrentPersonnelIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd" };
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
  const identity = await getCurrentPersonnelIdentity();
  if (!identity) return { success: false, error: "Niet ingelogd" };

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
