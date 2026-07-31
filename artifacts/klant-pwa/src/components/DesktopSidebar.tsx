"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  FileCheck2,
  FileText,
  HelpCircle,
  Headphones,
  Home,
  LogOut,
  Settings,
  WalletCards,
  Sparkles,
} from "lucide-react";
import { signOut } from "@/actions/auth";
import { FieldgridLogo, type PortalBrandingProps } from "./MobileHeader";
import type { CustomerPortalFeatureFlags } from "@/lib/portal-features";

type NavIcon = ComponentType<{
  className?: string;
  size?: number;
  strokeWidth?: number;
}>;

const NAV_ITEMS = [
  { href: "/", label: "Overzicht", Icon: Home },
  { href: "/opdrachten", label: "Opdrachten", Icon: CalendarDays },
  { href: "/objecten", label: "Objecten", Icon: Building2 },
  {
    href: "/meldingen/tickets",
    label: "Contact & tickets",
    Icon: Headphones,
    match: ["/meldingen"],
  },
  {
    href: "/rapporten",
    label: "Rapportages",
    Icon: FileCheck2,
    moduleKey: "reporting",
  },
  {
    href: "/financieel",
    label: "Financieel",
    Icon: WalletCards,
    moduleKey: "finance",
    match: ["/financieel", "/facturen", "/offertes", "/betalingen"],
  },
  {
    href: "/documenten",
    label: "Documenten",
    Icon: FileText,
    moduleKey: "documents",
  },
  {
    href: "/help",
    label: "Hulpcentrum",
    Icon: HelpCircle,
    moduleKey: "knowledgebase",
  },
  {
    href: "/releases",
    label: "Wat is nieuw",
    Icon: Sparkles,
    moduleKey: "releases",
  },
] satisfies Array<{
  href: string;
  label: string;
  Icon: NavIcon;
  moduleKey?: keyof CustomerPortalFeatureFlags;
  match?: string[];
}>;

function isVisible(
  moduleKey: keyof CustomerPortalFeatureFlags | undefined,
  featureFlags: CustomerPortalFeatureFlags,
): boolean {
  return moduleKey ? featureFlags[moduleKey] : true;
}

export function DesktopSidebar({
  branding,
  featureFlags = {
    documents: true,
    finance: true,
    reporting: true,
    knowledgebase: true,
    releases: true,
  },
}: {
  branding?: PortalBrandingProps;
  featureFlags?: CustomerPortalFeatureFlags;
}) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) =>
    isVisible(item.moduleKey, featureFlags),
  );

  return (
    <aside
      className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col md:flex"
      style={{
        backgroundColor: "var(--color-primary)",
        color: "white",
      }}
    >
      <div className="px-5 pb-4 pt-6">
        <FieldgridLogo branding={branding} />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {visibleItems.map(({ href, label, Icon, match }) => {
          const activePaths = match ?? [href];
          const isActive = activePaths.some((path) =>
            path === "/" ? pathname === "/" : pathname.startsWith(path),
          );

          return (
            <Link
              key={href}
              href={href}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition"
              style={{
                backgroundColor: isActive
                  ? "color-mix(in srgb, var(--color-accent) 18%, transparent)"
                  : "transparent",
                color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.72)",
              }}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.85} />
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-0.5 border-t border-white/10 px-3 py-4">
        <Link
          href="/instellingen"
          className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/70"
        >
          <Settings size={18} />
          Voorkeuren
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-white/70"
          >
            <LogOut size={18} />
            Uitloggen
          </button>
        </form>
      </div>
    </aside>
  );
}
