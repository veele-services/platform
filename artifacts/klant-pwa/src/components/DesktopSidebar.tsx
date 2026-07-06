"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  FileText,
  HelpCircle,
  Headphones,
  Home,
  LogOut,
  Settings,
  WalletCards,
} from "lucide-react";
import { signOut } from "@/actions/auth";
import { VeeleLogo, type PortalBrandingProps } from "./MobileHeader";

type CustomerPortalFeatureFlags = {
  documents: boolean;
  finance: boolean;
  reporting: boolean;
  knowledgebase: boolean;
};

type NavIcon = ComponentType<{
  className?: string;
  size?: number;
  strokeWidth?: number;
}>;

const NAV_ITEMS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/opdrachten", label: "Opdrachten", Icon: CalendarDays },
  { href: "/objecten", label: "Objecten", Icon: Building2 },
  { href: "/meldingen/tickets", label: "Support", Icon: Headphones, match: ["/meldingen"] },
  { href: "/financieel", label: "Financieel", Icon: WalletCards, moduleKey: "finance", match: ["/financieel", "/facturen", "/betalingen", "/offertes"] },
  { href: "/documenten", label: "Documenten", Icon: FileText, moduleKey: "documents" },
  { href: "/help", label: "Help", Icon: HelpCircle, moduleKey: "knowledgebase" },
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
  featureFlags = { documents: true, finance: true, reporting: true, knowledgebase: true },
}: {
  branding?: PortalBrandingProps;
  featureFlags?: CustomerPortalFeatureFlags;
}) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => isVisible(item.moduleKey, featureFlags));

  return (
    <aside
      className="hidden h-screen w-[260px] shrink-0 flex-col md:flex"
      style={{
        background: "linear-gradient(180deg, var(--color-primary) 0%, #061F44 100%)",
        color: "white",
      }}
    >
      <div className="px-6 pb-5 pt-7">
        <VeeleLogo branding={branding} />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-2">
        {visibleItems.map(({ href, label, Icon, match }) => {
          const activePaths = match ?? [href];
          const isActive = activePaths.some((path) =>
            path === "/" ? pathname === "/" : pathname.startsWith(path),
          );

          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition"
              style={{
                backgroundColor: isActive ? "rgba(0,183,179,0.18)" : "transparent",
                color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.72)",
              }}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.85} />
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-white/10 px-4 py-5">
        <Link
          href="/meldingen/tickets"
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-white/70"
        >
          <Headphones size={18} />
          Contact opnemen
        </Link>
        <Link
          href="/instellingen"
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-white/70"
        >
          <Settings size={18} />
          Instellingen
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-white/70"
          >
            <LogOut size={18} />
            Uitloggen
          </button>
        </form>
      </div>
    </aside>
  );
}
