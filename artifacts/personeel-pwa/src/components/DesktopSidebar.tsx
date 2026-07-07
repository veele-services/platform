"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FolderOpen,
  HelpCircle,
  Home,
  LogOut,
  MessageSquare,
  Megaphone,
  Newspaper,
  Plane,
  Settings,
  User,
} from "lucide-react";
import { signOut } from "@/actions/auth";
import { FieldgridLogo, type PortalBrandingProps } from "./MobileHeader";

type PersonnelPortalFeatureFlags = {
  documents: boolean;
  notifications: boolean;
  knowledgebase: boolean;
  releases: boolean;
};

type NavIcon = ComponentType<{
  className?: string;
  size?: number;
  strokeWidth?: number;
}>;

const NAV_ITEMS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/opdrachten", label: "Planning", Icon: ClipboardList },
  { href: "/openstaand", label: "Open diensten", Icon: ClipboardCheck },
  { href: "/uren", label: "Uren", Icon: Clock },
  { href: "/berichten", label: "Berichten", Icon: MessageSquare },
  { href: "/nieuws", label: "Nieuws", Icon: Newspaper },
  { href: "/meldingen", label: "Meldingen", Icon: Bell, moduleKey: "notifications" },
  { href: "/beschikbaarheid", label: "Beschikbaarheid", Icon: Calendar },
  { href: "/verlof", label: "Verlof", Icon: Plane },
  { href: "/documenten", label: "Documenten", Icon: FolderOpen, moduleKey: "documents" },
  { href: "/help", label: "Help", Icon: HelpCircle, moduleKey: "knowledgebase" },
  { href: "/releases", label: "Releases", Icon: Megaphone, moduleKey: "releases" },
  { href: "/instellingen", label: "Instellingen", Icon: Settings },
  { href: "/profiel", label: "Profiel", Icon: User },
] satisfies Array<{
  href: string;
  label: string;
  Icon: NavIcon;
  moduleKey?: keyof PersonnelPortalFeatureFlags;
}>;

function isVisible(
  moduleKey: keyof PersonnelPortalFeatureFlags | undefined,
  featureFlags: PersonnelPortalFeatureFlags,
): boolean {
  return moduleKey ? featureFlags[moduleKey] : true;
}

export function DesktopSidebar({
  branding,
  featureFlags = { documents: true, notifications: true, knowledgebase: true, releases: true },
}: {
  branding?: PortalBrandingProps;
  featureFlags?: PersonnelPortalFeatureFlags;
}) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => isVisible(item.moduleKey, featureFlags));

  return (
    <aside
      className="hidden h-screen w-60 shrink-0 flex-col border-r md:flex"
      style={{ backgroundColor: "#FFFFFF", borderColor: "#E2E8F0" }}
    >
      <div
        className="border-b px-5 py-5"
        style={{
          background: "linear-gradient(180deg, var(--color-primary) 0%, #061F44 100%)",
          borderColor: "#E2E8F0",
        }}
      >
        <FieldgridLogo branding={branding} />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {visibleItems.map(({ href, label, Icon }) => {
          const isActive =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
              style={{
                backgroundColor: isActive ? "rgba(0,183,179,0.12)" : "transparent",
                color: isActive ? "var(--color-primary)" : "#475569",
              }}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.75} />
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div
        className="border-t px-3 py-4"
        style={{ borderColor: "#E2E8F0" }}
      >
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
            style={{ color: "#475569" }}
          >
            <LogOut size={18} strokeWidth={1.75} />
            Uitloggen
          </button>
        </form>
      </div>
    </aside>
  );
}
