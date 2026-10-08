import type { ReactNode } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getTicketAccess } from "@/lib/tickets/data";
import { getNotificationAccess } from "@/lib/notifications/data";
import { TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import { PlatformShell } from "./platform-shell";

export default async function Layout({ children }: { children: ReactNode }) {
  const context = await getAuthContext();
  if ((await headers()).get(TENANT_SLUG_HEADER)) notFound();
  const [tickets, notifications] = await Promise.all([getTicketAccess("platform"), getNotificationAccess("platform")]);
  const canSupport = tickets.allowed || tickets.canCreate || tickets.canConfigure || tickets.canDelegate;
  if (!context.isPlatformAdmin && !canSupport && !notifications.allowed) notFound();
  return <PlatformShell access={{ userId: context.user.id, name: context.user.displayName || context.user.email || "Platformgebruiker", email: context.user.email, canManage: context.isPlatformAdmin, canSupport, canConfigureSupport: tickets.canConfigure || tickets.canDelegate, canNotifications: notifications.allowed }}>{children}</PlatformShell>;
}
