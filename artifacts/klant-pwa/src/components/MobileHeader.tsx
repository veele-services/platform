"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  ChevronDown,
  LogOut,
  MailOpen,
  Settings,
  ShieldCheck,
  UserCircle,
} from "lucide-react";
import { signOut } from "@/actions/auth";
import type { CustomerNotificationSummary } from "@/actions/notifications";
import type { CustomerProfile } from "@/actions/customer";

export type PortalBrandingProps = {
  displayName: string;
  platformName: string;
  logoUrl: string | null;
  accentColor: string;
};

function initialsFor(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "FG";
}

export function FieldgridLogo({ branding }: { branding?: PortalBrandingProps }) {
  const displayName = branding?.displayName || "Fieldgrid";
  const platformName = branding ? branding.platformName.trim() : "Fieldgrid";
  const logoUrl = branding?.logoUrl ?? null;
  const accentColor = branding?.accentColor || "var(--color-accent)";

  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label={`${displayName} home`}>
      <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-white/10">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" />
        ) : (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl text-[11px] font-black text-white"
            style={{ backgroundColor: accentColor }}
          >
            {initialsFor(displayName)}
          </span>
        )}
      </span>
      <span className="min-w-0 leading-none">
        <span className="block max-w-32 truncate text-[16px] font-black tracking-[0.08em] text-white">
          {displayName.toUpperCase()}
        </span>
        {platformName ? (
          <span
            className="mt-1 block max-w-32 truncate text-[7px] font-bold tracking-[0.24em]"
            style={{ color: "#BFECEA" }}
          >
            {platformName.toUpperCase()}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black leading-none text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function HeaderActions({
  notificationSummary,
  profile,
  tone = "dark",
}: {
  notificationSummary: CustomerNotificationSummary;
  profile: CustomerProfile | null;
  tone?: "dark" | "light";
}) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<"notifications" | "profile" | null>(null);

  useEffect(() => {
    setOpenMenu(null);
  }, [pathname]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-full shadow-lg active:scale-95"
          style={{
            backgroundColor: tone === "dark" ? "rgba(255,255,255,0.11)" : "#F1F5F9",
            color:           tone === "dark" ? "#FFFFFF" : "var(--color-primary)",
          }}
          aria-label="Meldingen"
          aria-haspopup="menu"
          aria-expanded={openMenu === "notifications"}
          onClick={() => setOpenMenu((current) => current === "notifications" ? null : "notifications")}
        >
          <Bell size={18} strokeWidth={2.15} />
          <CountBadge count={notificationSummary.unreadCount} />
        </button>

        {openMenu === "notifications" ? (
          <div
            className="absolute right-0 top-11 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border bg-white text-sm shadow-2xl"
            role="menu"
            style={{
              borderColor: "var(--color-border)",
              boxShadow: "0 18px 42px rgba(8,29,58,0.22)",
            }}
          >
            <div className="border-b px-3.5 py-3" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-[var(--color-primary)]">Meldingen</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">
                    {notificationSummary.unreadCount} actueel
                  </p>
                </div>
                <Link
                  href="/meldingen"
                  className="rounded-full bg-[#E8FBFA] px-3 py-1.5 text-xs font-black text-[#087C79]"
                >
                  Open
                </Link>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto py-1">
              {notificationSummary.recent.length > 0 ? (
                notificationSummary.recent.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block border-b px-3.5 py-3 last:border-b-0"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <p className="line-clamp-1 text-sm font-black text-[var(--color-primary)]">
                      {item.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-500">
                      {item.body}
                    </p>
                  </Link>
                ))
              ) : (
                <p className="px-3.5 py-5 text-center text-sm font-semibold text-slate-500">
                  Geen actuele meldingen.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative">
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-full bg-white px-1.5 text-[#061F44] shadow-lg active:scale-95"
          style={{
            border: tone === "light" ? "1px solid var(--color-border)" : undefined,
          }}
          aria-haspopup="menu"
          aria-expanded={openMenu === "profile"}
          aria-label="Profielmenu"
          onClick={() => setOpenMenu((current) => current === "profile" ? null : "profile")}
        >
          <UserCircle size={25} strokeWidth={2.5} />
          <ChevronDown
            size={14}
            strokeWidth={2.4}
            className={`transition-transform ${openMenu === "profile" ? "rotate-180" : ""}`}
          />
        </button>

        {openMenu === "profile" ? (
          <div
            className="absolute right-0 top-11 w-56 overflow-hidden rounded-2xl border bg-white py-1.5 text-sm shadow-2xl"
            role="menu"
            style={{ borderColor: "var(--color-border)", boxShadow: "0 18px 42px rgba(8,29,58,0.22)" }}
          >
            <div className="border-b px-3.5 py-3" style={{ borderColor: "var(--color-border)" }}>
              <p className="truncate text-sm font-black" style={{ color: "var(--color-primary)" }}>
                {profile?.contactName ?? profile?.name ?? "Klant"}
              </p>
              <p className="truncate text-xs font-semibold" style={{ color: "var(--color-secondary)" }}>
                {profile?.name ?? "Organisatie"}
              </p>
            </div>
            <Link href="/profiel" className="flex items-center gap-2.5 px-3.5 py-2.5 font-bold" role="menuitem" style={{ color: "var(--color-primary)" }}>
              <UserCircle size={17} strokeWidth={2.3} />
              Profiel
            </Link>
            <Link href="/beveiliging" className="flex items-center gap-2.5 px-3.5 py-2.5 font-bold" role="menuitem" style={{ color: "var(--color-primary)" }}>
              <ShieldCheck size={17} strokeWidth={2.3} />
              Beveiliging
            </Link>
            <Link href="/instellingen" className="flex items-center gap-2.5 px-3.5 py-2.5 font-bold" role="menuitem" style={{ color: "var(--color-primary)" }}>
              <Settings size={17} strokeWidth={2.3} />
              Instellingen
            </Link>
            <Link href="/meldingen" className="flex items-center gap-2.5 px-3.5 py-2.5 font-bold" role="menuitem" style={{ color: "var(--color-primary)" }}>
              <MailOpen size={17} strokeWidth={2.3} />
              Meldingen
            </Link>
            <div className="my-1 border-t" style={{ borderColor: "var(--color-border)" }} />
            <form action={signOut}>
              <button type="submit" className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left font-bold" role="menuitem" style={{ color: "var(--color-destructive)" }}>
                <LogOut size={17} strokeWidth={2.3} />
                Uitloggen
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MobileHeader({
  branding,
  notificationSummary,
  profile,
}: {
  branding?: PortalBrandingProps;
  notificationSummary: CustomerNotificationSummary;
  profile: CustomerProfile | null;
}) {
  return (
    <header
      className="sticky top-0 z-40 md:hidden"
      style={{ background: "linear-gradient(180deg, var(--color-primary) 0%, #061F44 100%)" }}
    >
      <div className="flex items-center justify-between px-4 pb-3 pt-[calc(0.7rem+var(--safe-top))]">
        <FieldgridLogo branding={branding} />
        <HeaderActions notificationSummary={notificationSummary} profile={profile} />
      </div>
    </header>
  );
}
