"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  ClipboardList,
  History,
  Layers3,
  Mail,
  Shield,
  Tag,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/providers/permissions-provider";

const SETTINGS_TABS = [
  { href: "/instellingen/organisatie", label: "Organisatie", icon: Building2, permission: "settings:write" },
  { href: "/instellingen/notificaties", label: "Notificaties", icon: Bell, permission: "settings:write" },
  { href: "/instellingen/mail", label: "Mail", icon: Mail, permission: "settings:write" },
  { href: "/instellingen/rollen", label: "Rollen & rechten", icon: Shield, permission: "roles:read" },
  { href: "/instellingen/gebruikers", label: "Gebruikers", icon: Users, permission: "users:read" },
  { href: "/settings/task-codes", label: "Taakcodes", icon: ClipboardList, permission: "task_codes:read" },
  { href: "/instellingen/sectoren", label: "Sectoren", icon: Layers3, permission: "settings:read" },
  { href: "/instellingen/klanttypes", label: "Klanttypes", icon: Tag, permission: "settings:read" },
  { href: "/instellingen/activiteitslog", label: "Activiteitslog", icon: History, permission: "settings:read" },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();
  const permissions = usePermissions();

  const visibleTabs = SETTINGS_TABS.filter((tab) => permissions.has(tab.permission));

  if (visibleTabs.length === 0) return null;

  return (
    <nav
      className="mb-6 flex gap-2 overflow-x-auto rounded-lg border bg-white p-1 shadow-sm"
      style={{ borderColor: "#E2E8F0" }}
      aria-label="Instellingen"
    >
      {visibleTabs.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition",
              active ? "bg-[#E0FAFB] text-[#075E5D]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
