"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FolderOpen,
  Home,
  LogOut,
  Plane,
  User,
} from "lucide-react";
import { signOut } from "@/actions/auth";
import { VeeleLogo, type PortalBrandingProps } from "./MobileHeader";

type PersonnelPortalFeatureFlags = {
  documents: boolean;
  notifications: boolean;
};

type NavIcon = ComponentType<{
  className?: string;
  size?: number;
  strokeWidth?: number;
}>;

const NAV_ITEMS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/opdrachten", label: "Opdrachten", Icon: ClipboardList },
  { href: "/openstaand", label: "Openstaand", Icon: ClipboardCheck },
  { href: "/uren", label: "Uren", Icon: Clock },
  { href: "/beschikbaarheid", label: "Beschikbaar", Icon: Calendar },
  { href: "/verlof", label: "Verlof", Icon: Plane },
  { href: "/documenten", label: "Documenten", Icon: FolderOpen, moduleKey: "documents" },
  { href: "/profiel", label: "Mijn profiel", Icon: User },
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
  featureFlags = { documents: true, notifications: true },
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
        <VeeleLogo branding={branding} />
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
