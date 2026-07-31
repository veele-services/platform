"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/shared-ui";
import {
  Bell,
  CheckCheck,
  ChevronDown,
  LogOut,
  MessageSquare,
  Settings,
  Trash2,
  UserCircle,
} from "lucide-react";
import { NativeAwareSignOutButton } from "@/components/NativeAwareSignOutButton";
import {
  clearAllNotifications,
  deleteNotification,
  markAllNotificationsRead,
  markAllNotificationsUnread,
  markNotificationRead,
  type NotificationSummary,
} from "@/actions/notifications";
import type { TicketSummary } from "@/actions/messages";
import { PersonnelConfirmDialog } from "@/components/PersonnelConfirmDialog";

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
      className="flex min-h-11 items-center gap-2.5"
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
            className="flex h-8 w-8 items-center justify-center rounded-xl text-[11px] font-semibold text-white"
            style={{ backgroundColor: accentColor }}
          >
            {initialsFor(displayName)}
          </span>
        )}
      </span>
      <span className="min-w-0 leading-none">
        <span className="block max-w-32 truncate text-[16px] font-semibold tracking-[0.08em] text-white">
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
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold leading-none text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function MobileHeaderActions({
  notificationSummary,
  ticketSummary,
}: {
  notificationSummary?: NotificationSummary;
  ticketSummary: TicketSummary;
}) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: "all" } | { kind: "one"; id: string } | null
  >(null);
  const [isPending, startTransition] = useTransition();

  function runNotificationAction(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    runNotificationAction(() =>
      deleteTarget.kind === "all"
        ? clearAllNotifications()
        : deleteNotification(deleteTarget.id),
    );
    setDeleteTarget(null);
  }

  return (
    <div className="flex items-center gap-2">
      {notificationSummary ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg active:scale-95"
              style={{ backgroundColor: "rgba(255,255,255,0.11)" }}
              aria-label="Meldingen"
            >
              <Bell size={18} strokeWidth={2.15} />
              <CountBadge count={notificationSummary.unreadCount} />
            </button>
          </PopoverTrigger>

          <PopoverContent
            side="bottom"
            align="end"
            sideOffset={8}
            collisionPadding={12}
            aria-label="Meldingen"
            className="max-h-[calc(100vh-5.25rem)] w-[calc(100vw-1.5rem)] max-w-[22rem] overflow-hidden rounded-2xl p-0 text-sm"
          >
            <div className="border-b px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[var(--color-primary)]">
                    Meldingen
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">
                    {notificationSummary.unreadCount} ongelezen
                  </p>
                </div>
                <PopoverClose asChild>
                  <Link
                    href="/meldingen"
                    className="inline-flex min-h-11 items-center rounded-full px-3 py-1.5 text-xs font-medium text-[var(--color-accent-accessible)]"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--color-accent) 12%, white)",
                    }}
                  >
                    Open
                  </Link>
                </PopoverClose>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto py-1">
              {notificationSummary.recentUnread.length > 0 ? (
                notificationSummary.recentUnread.map((item) => (
                  <div
                    key={item.id}
                    className="border-b px-3.5 py-3 last:border-b-0"
                  >
                    <PopoverClose asChild>
                    <Link
                      href={item.href ?? "/meldingen"}
                      className="flex min-h-11 flex-col justify-center"
                    >
                        <p className="line-clamp-1 text-sm font-semibold text-[var(--color-primary)]">
                          {item.title}
                        </p>
                        {item.body ? (
                          <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-500">
                            {item.body}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                          {item.sourceLabel ?? item.category}
                        </p>
                      </Link>
                    </PopoverClose>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          runNotificationAction(() =>
                            markNotificationRead(item.id),
                          )
                        }
                        className="inline-flex min-h-11 items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600 disabled:opacity-50"
                      >
                        <CheckCheck size={13} />
                        Gelezen
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          setDeleteTarget({ kind: "one", id: item.id })
                        }
                        className="inline-flex min-h-11 items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-[11px] font-medium text-red-600 disabled:opacity-50"
                      >
                        <Trash2 size={13} />
                        Wissen
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="px-3.5 py-5 text-center text-sm font-semibold text-slate-500">
                  Geen ongelezen meldingen.
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1 border-t p-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => runNotificationAction(markAllNotificationsRead)}
                className="min-h-11 rounded-xl px-2 py-2 text-[11px] font-medium text-[var(--color-primary)] disabled:opacity-50"
              >
                Alles gelezen
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  runNotificationAction(markAllNotificationsUnread)
                }
                className="min-h-11 rounded-xl px-2 py-2 text-[11px] font-medium text-[var(--color-primary)] disabled:opacity-50"
              >
                Alles ongelezen
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setDeleteTarget({ kind: "all" })}
                className="min-h-11 rounded-xl px-2 py-2 text-[11px] font-medium text-red-600 disabled:opacity-50"
              >
                Alles wissen
              </button>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}

      <Link
        href="/berichten"
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg active:scale-95"
        style={{ backgroundColor: "rgba(255,255,255,0.11)" }}
        aria-label="Berichten"
      >
        <MessageSquare size={18} strokeWidth={2.15} />
        <CountBadge count={ticketSummary.unreadCount} />
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="group flex h-11 min-w-11 items-center gap-1.5 rounded-full bg-white px-1.5 text-[var(--color-primary)] shadow-lg active:scale-95"
            aria-label="Profielmenu"
          >
            <UserCircle size={25} strokeWidth={2.5} />
            <ChevronDown
              size={14}
              strokeWidth={2.4}
              className="transition-transform group-data-[state=open]:rotate-180"
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="w-48 rounded-2xl"
        >
          <DropdownMenuItem asChild>
            <Link
              href="/profiel"
              className="gap-2.5 font-medium text-[var(--color-primary)]"
            >
              <UserCircle size={17} strokeWidth={2.3} />
              Profiel
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href="/instellingen"
              className="gap-2.5 font-medium text-[var(--color-primary)]"
            >
              <Settings size={17} strokeWidth={2.3} />
              Instellingen
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            asChild
            onSelect={(event) => event.preventDefault()}
          >
            <NativeAwareSignOutButton
              menuItem
              className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left font-medium text-[var(--color-destructive)]"
            >
              <LogOut size={17} strokeWidth={2.3} />
              Uitloggen
            </NativeAwareSignOutButton>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PersonnelConfirmDialog
        open={Boolean(deleteTarget)}
        title={
          deleteTarget?.kind === "all"
            ? "Alle meldingen wissen?"
            : "Melding wissen?"
        }
        description="De melding verdwijnt uit je inbox. Dit kan niet ongedaan worden gemaakt."
        confirmLabel="Wissen"
        tone="danger"
        pending={isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export function MobileHeader({
  branding,
  notificationSummary,
  ticketSummary,
}: {
  branding?: PortalBrandingProps;
  notificationSummary?: NotificationSummary;
  ticketSummary: TicketSummary;
}) {
  const pathname = usePathname();
  const isAssignmentDetail = /^\/opdrachten\/[^/]+/.test(pathname);

  if (isAssignmentDetail) return null;

  return (
    <header
      className="sticky top-0 z-40 md:hidden"
      style={{
        background:
          "linear-gradient(180deg, var(--color-primary) 0%, #061F44 100%)",
      }}
    >
      <MobileHeaderBar
        branding={branding}
        notificationSummary={notificationSummary}
        ticketSummary={ticketSummary}
      />
    </header>
  );
}

export function MobileHeaderBar({
  branding,
  notificationSummary,
  ticketSummary,
  leading,
}: {
  branding?: PortalBrandingProps;
  notificationSummary?: NotificationSummary;
  ticketSummary: TicketSummary;
  leading?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-[calc(0.7rem+var(--safe-top))]">
      <div className="min-w-0">
        {leading ?? <FieldgridLogo branding={branding} />}
      </div>
      <MobileHeaderActions
        notificationSummary={notificationSummary}
        ticketSummary={ticketSummary}
      />
    </div>
  );
}
