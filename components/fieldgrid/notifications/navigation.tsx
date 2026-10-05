"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { loadNotificationAccess } from "@/app/notifications/actions";
import { notificationPaths, type NotificationWorkspace } from "@/lib/notifications/model";

export function NotificationNavigation({ workspace, actorKey, className }: { workspace: NotificationWorkspace; actorKey: string; className?: string }) {
  const path = usePathname(), key = `${workspace}:${actorKey}`, [allowedKey, setAllowedKey] = useState<string | null>(null);
  useEffect(() => { let live = true; void loadNotificationAccess(workspace).then(result => { if (live) setAllowedKey(result.ok && result.data.allowed ? key : null); }).catch(() => { if (live) setAllowedKey(null); }); return () => { live = false; }; }, [workspace, key]);
  if (allowedKey !== key) return null;
  return <Link aria-label="Notificaties" title="Notificaties" href={notificationPaths[workspace]} className={className ?? (path.startsWith(notificationPaths[workspace]) ? "active" : undefined)} aria-current={path.startsWith(notificationPaths[workspace]) ? "page" : undefined}><Bell size={17}/><span>Notificaties</span></Link>;
}
