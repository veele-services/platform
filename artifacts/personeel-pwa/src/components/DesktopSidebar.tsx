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
import { NativeAwareSignOutButton } from "@/components/NativeAwareSignOutButton";
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

type NavItem = {
  href: string;
  label: string;
  Icon: NavIcon;
  moduleKey?: keyof PersonnelPortalFeatureFlags;
};

const NAV_GROUPS = [
  {
    id: "werk",
    label: "Werk",
    items: [
      { href: "/", label: "Home", Icon: Home },
      { href: "/opdrachten", label: "Planning", Icon: ClipboardList },
      { href: "/openstaand", label: "Open diensten", Icon: ClipboardCheck },
      { href: "/uren", label: "Uren", Icon: Clock },
    ],
  },
  {
    id: "inbox",
    label: "Inbox",
    items: [
      { href: "/berichten", label: "Berichten", Icon: MessageSquare },
      {
        href: "/meldingen",
        label: "Meldingen",
        Icon: Bell,
        moduleKey: "notifications",
      },
    ],
  },
  {
    id: "mijn-zaken",
    label: "Mijn zaken",
    items: [
      { href: "/beschikbaarheid", label: "Beschikbaarheid", Icon: Calendar },
      { href: "/verlof", label: "Verlof", Icon: Plane },
      {
        href: "/documenten",
        label: "Documenten",
        Icon: FolderOpen,
        moduleKey: "documents",
      },
    ],
  },
  {
    id: "ondersteuning",
    label: "Ondersteuning",
    items: [
      { href: "/nieuws", label: "Nieuws", Icon: Newspaper },
      {
        href: "/help",
        label: "Help",
        Icon: HelpCircle,
        moduleKey: "knowledgebase",
      },
      {
        href: "/releases",
        label: "Wat is nieuw",
        Icon: Megaphone,
        moduleKey: "releases",
      },
    ],
  },
] satisfies Array<{ id: string; label: string; items: NavItem[] }>;

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

  return (
    <aside
      className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-white md:flex"
    >
      <div
        className="border-b border-[var(--color-border)] bg-[var(--color-primary)] px-5 py-4"
      >
        <FieldgridLogo branding={branding} />
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) =>
            isVisible(item.moduleKey, featureFlags),
          );
          if (visibleItems.length === 0) return null;
          return (
            <section key={group.id} aria-labelledby={`nav-${group.id}`}>
              <h2
                id={`nav-${group.id}`}
                className="mb-1 px-3 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-secondary)]"
              >
                {group.label}
              </h2>
              <div className="space-y-0.5">
                {visibleItems.map(({ href, label, Icon }) => {
                  const isActive =
                    href === "/" ? pathname === "/" : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                      style={{
                        backgroundColor: isActive
                          ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                          : "transparent",
                        color: isActive
                          ? "var(--color-primary)"
                          : "var(--color-secondary)",
                      }}
                    >
                      <Icon size={18} strokeWidth={isActive ? 2.2 : 1.75} />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>

      <div className="border-t border-[var(--color-border)] px-3 py-3">
        <Link
          href="/profiel"
          className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-secondary)]"
        >
          <User size={18} />
          Profiel
        </Link>
        <Link
          href="/instellingen"
          className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-secondary)]"
        >
          <Settings size={18} />
          Instellingen
        </Link>
        <NativeAwareSignOutButton
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-secondary)] transition-colors"
        >
            <LogOut size={18} strokeWidth={1.75} />
            Uitloggen
        </NativeAwareSignOutButton>
      </div>
    </aside>
  );
}
