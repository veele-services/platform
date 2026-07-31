"use client";

import Link from "next/link";
import {
  Bell,
  Building2,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/shared-ui";

export type PortalBrandingProps = {
  displayName: string;
  platformName: string;
  logoUrl: string | null;
  accentColor: string;
};

function initialsFor(value: string): string {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "FG"
  );
}

export function FieldgridLogo({
  branding,
}: {
  branding?: PortalBrandingProps;
}) {
  const displayName = branding?.displayName || "Fieldgrid";
  const platformName = branding ? branding.platformName.trim() : "Fieldgrid";
  const logoUrl = branding?.logoUrl ?? null;
  const accentColor = branding?.accentColor || "var(--color-accent)";

  return (
    <Link
      href="/"
      className="flex items-center gap-2.5"
      aria-label={`${displayName} home`}
    >
      <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-white/10">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="h-full w-full object-contain p-1"
          />
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
  canSwitchOrganization = false,
  organizationSwitchLabel = "Klantorganisatie wisselen",
}: {
  notificationSummary: CustomerNotificationSummary;
  profile: CustomerProfile | null;
  tone?: "dark" | "light";
  canSwitchOrganization?: boolean;
  organizationSwitchLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="relative flex min-h-11 min-w-11 items-center justify-center rounded-full active:scale-95"
            style={{
              backgroundColor:
                tone === "dark"
                  ? "color-mix(in srgb, white 11%, transparent)"
                  : "var(--color-muted)",
              color: tone === "dark" ? "white" : "var(--color-primary)",
            }}
            aria-label="Meldingen"
          >
            <Bell size={18} strokeWidth={2.15} />
            <CountBadge count={notificationSummary.unreadCount} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden p-0 text-sm">
          <div
            className="border-b px-3.5 py-3"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[var(--color-primary)]">
                  Meldingen
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {notificationSummary.unreadCount} ongelezen
                </p>
              </div>
              <PopoverClose asChild>
                <Link
                  href="/meldingen"
                  className="inline-flex min-h-11 items-center rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_10%,white)] px-3 text-xs font-medium text-[var(--color-accent-accessible)]"
                >
                  Open
                </Link>
              </PopoverClose>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {notificationSummary.recent.length > 0 ? (
              notificationSummary.recent.map((item) => (
                <PopoverClose asChild key={item.id}>
                  <Link
                    href={item.href}
                    className="block border-b px-3.5 py-3 last:border-b-0"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <p className="line-clamp-1 text-sm font-semibold text-[var(--color-primary)]">
                      {item.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-500">
                      {item.body}
                    </p>
                  </Link>
                </PopoverClose>
              ))
            ) : (
              <p className="px-3.5 py-5 text-center text-sm text-slate-500">
                Geen actuele meldingen.
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex min-h-11 items-center gap-1.5 rounded-full bg-white px-2 text-[var(--color-primary)] active:scale-95"
            style={{
              border:
                tone === "light" ? "1px solid var(--color-border)" : undefined,
            }}
            aria-label="Profielmenu"
          >
            <UserCircle size={25} strokeWidth={2.5} />
            <ChevronDown size={14} strokeWidth={2.4} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          <DropdownMenuLabel>
            <p className="truncate text-sm font-semibold text-[var(--color-primary)]">
              {profile?.contactName ?? profile?.name ?? "Klant"}
            </p>
            <p className="truncate text-xs font-normal text-[var(--color-secondary)]">
              {profile?.name ?? "Organisatie"}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profiel" className="gap-2.5 font-medium">
              <UserCircle size={17} strokeWidth={2.3} />
              Profiel
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/beveiliging" className="gap-2.5 font-medium">
              <ShieldCheck size={17} strokeWidth={2.3} />
              Beveiliging
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/instellingen" className="gap-2.5 font-medium">
              <Settings size={17} strokeWidth={2.3} />
              Voorkeuren
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/meldingen" className="gap-2.5 font-medium">
              <MailOpen size={17} strokeWidth={2.3} />
              Meldingen
            </Link>
          </DropdownMenuItem>
          {canSwitchOrganization ? (
            <DropdownMenuItem asChild>
              <Link href="/context-kiezen" className="gap-2.5 font-medium">
                <Building2 size={17} strokeWidth={2.1} />
                {organizationSwitchLabel}
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <form action={signOut}>
            <DropdownMenuItem asChild>
              <button
                type="submit"
                className="w-full gap-2.5 text-left font-medium text-[var(--color-destructive)]"
              >
                <LogOut size={17} strokeWidth={2.3} />
                Uitloggen
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function MobileHeader({
  branding,
  notificationSummary,
  profile,
  canSwitchOrganization = false,
}: {
  branding?: PortalBrandingProps;
  notificationSummary: CustomerNotificationSummary;
  profile: CustomerProfile | null;
  canSwitchOrganization?: boolean;
}) {
  return (
    <header
      className="sticky top-0 z-40 md:hidden"
      style={{ backgroundColor: "var(--color-primary)" }}
    >
      <div className="flex items-center justify-between px-4 pb-3 pt-[calc(0.7rem+var(--safe-top))]">
        <FieldgridLogo branding={branding} />
        <HeaderActions
          notificationSummary={notificationSummary}
          profile={profile}
          canSwitchOrganization={canSwitchOrganization}
        />
      </div>
    </header>
  );
}
