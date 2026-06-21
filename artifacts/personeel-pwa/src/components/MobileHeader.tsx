"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  Bell,
  CheckCheck,
  ChevronDown,
  Loader2,
  LogOut,
  MailOpen,
  MessageSquare,
  Settings,
  Smartphone,
  Trash2,
  UserCircle,
} from "lucide-react";
import { signOut } from "@/actions/auth";
import {
  clearAllNotifications,
  deleteNotification,
  markAllNotificationsRead,
  markAllNotificationsUnread,
  markNotificationRead,
  type NotificationSummary,
} from "@/actions/notifications";
import { saveMyPushSubscription } from "@/actions/push";
import type { TicketSummary } from "@/actions/messages";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function VeeleLogo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Veele Services home">
      <span className="relative flex h-8 w-8 items-center justify-center">
        <span
          className="absolute h-8 w-2 -rotate-[24deg] rounded-full"
          style={{ backgroundColor: "#00B7B3" }}
        />
        <span className="absolute h-8 w-2 rotate-[24deg] rounded-full bg-white" />
      </span>
      <span className="leading-none">
        <span className="block text-[16px] font-black tracking-[0.22em] text-white">
          VEELE
        </span>
        <span
          className="mt-1 block text-[7px] font-bold tracking-[0.42em]"
          style={{ color: "#BFECEA" }}
        >
          SERVICES
        </span>
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

export function MobileHeaderActions({
  notificationSummary,
  ticketSummary,
}: {
  notificationSummary: NotificationSummary;
  ticketSummary: TicketSummary;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState<"notifications" | "profile" | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const [isRegisteringPush, startPushRegistration] = useTransition();
  const [hasPushSubscription, setHasPushSubscription] = useState(false);
  const [pushStatus, setPushStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setOpenMenu(null);
  }, [pathname]);

  useEffect(() => {
    if (openMenu !== "notifications") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    let cancelled = false;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setHasPushSubscription(Boolean(subscription));
      })
      .catch(() => {
        if (!cancelled) setHasPushSubscription(false);
      });

    return () => {
      cancelled = true;
    };
  }, [openMenu]);

  function runNotificationAction(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  function registerPush() {
    setPushStatus(null);
    startPushRegistration(async () => {
      if (!VAPID_PUBLIC_KEY) {
        setPushStatus({
          type: "error",
          text: "Push sleutel ontbreekt in deze build.",
        });
        return;
      }

      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        typeof Notification === "undefined"
      ) {
        setPushStatus({
          type: "error",
          text: "Deze browser ondersteunt web push niet.",
        });
        return;
      }

      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;

      if (permission !== "granted") {
        setPushStatus({
          type: "error",
          text:
            permission === "denied"
              ? "Push is geblokkeerd in de browserinstellingen."
              : "Push toestemming is niet gegeven.",
        });
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));
      const serialized = subscription.toJSON();
      const result = await saveMyPushSubscription({
        endpoint: serialized.endpoint ?? "",
        keys: {
          p256dh: serialized.keys?.p256dh,
          auth: serialized.keys?.auth,
        },
        userAgent: navigator.userAgent,
      });

      if (result.success) {
        setHasPushSubscription(true);
        setPushStatus({
          type: "success",
          text: "Push is geactiveerd voor deze browser.",
        });
        return;
      }

      setPushStatus({ type: "error", text: result.error });
    });
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-white shadow-lg active:scale-95"
          style={{ backgroundColor: "rgba(255,255,255,0.11)" }}
          aria-label="Meldingen"
          aria-haspopup="menu"
          aria-expanded={openMenu === "notifications"}
          onClick={() =>
            setOpenMenu((current) =>
              current === "notifications" ? null : "notifications",
            )
          }
        >
          <Bell size={18} strokeWidth={2.15} />
          <CountBadge count={notificationSummary.unreadCount} />
        </button>

        {openMenu === "notifications" ? (
          <div
            className="fixed left-3 right-3 top-[calc(4.25rem+var(--safe-top))] z-50 max-h-[calc(100vh-5.25rem)] overflow-hidden rounded-2xl border bg-white text-sm shadow-2xl sm:left-auto sm:right-3 sm:w-[22rem]"
            role="menu"
            style={{
              borderColor: "var(--color-border)",
              boxShadow: "0 18px 42px rgba(8,29,58,0.22)",
            }}
          >
            <div className="border-b px-3.5 py-3" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-[#081D3A]">Meldingen</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">
                    {notificationSummary.unreadCount} ongelezen
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

            {!hasPushSubscription || pushStatus ? (
              <div
                className="border-b px-3.5 py-2.5"
                style={{ borderColor: "var(--color-border)" }}
              >
                {!hasPushSubscription ? (
                  <button
                    type="button"
                    disabled={isRegisteringPush}
                    onClick={registerPush}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00B7B3] px-3 py-2.5 text-xs font-black text-white shadow-sm disabled:opacity-60"
                  >
                    {isRegisteringPush ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Smartphone size={15} strokeWidth={2.4} />
                    )}
                    Push activeren
                  </button>
                ) : null}
                {pushStatus ? (
                  <p
                    className={`mt-2 rounded-xl px-3 py-2 text-xs font-bold ${
                      pushStatus.type === "success"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    {pushStatus.text}
                  </p>
                ) : (
                  <p className="mt-2 text-center text-[11px] font-semibold text-slate-500">
                    Activeer deze browser om meldingen buiten de app te ontvangen.
                  </p>
                )}
              </div>
            ) : null}

            <div className="max-h-72 overflow-y-auto py-1">
              {notificationSummary.recentUnread.length > 0 ? (
                notificationSummary.recentUnread.map((item) => (
                  <div
                    key={item.id}
                    className="border-b px-3.5 py-3 last:border-b-0"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <Link href={item.href ?? "/meldingen"} className="block">
                      <p className="line-clamp-1 text-sm font-black text-[#081D3A]">
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
                    <div className="mt-2 flex gap-1.5">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          runNotificationAction(() =>
                            markNotificationRead(item.id),
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600 disabled:opacity-50"
                      >
                        <CheckCheck size={13} />
                        Gelezen
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          runNotificationAction(() =>
                            deleteNotification(item.id),
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-black text-red-600 disabled:opacity-50"
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

            <div className="grid grid-cols-3 gap-1 border-t p-2" style={{ borderColor: "var(--color-border)" }}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => runNotificationAction(markAllNotificationsRead)}
                className="rounded-xl px-2 py-2 text-[11px] font-black text-[#081D3A] disabled:opacity-50"
              >
                Alles gelezen
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => runNotificationAction(markAllNotificationsUnread)}
                className="rounded-xl px-2 py-2 text-[11px] font-black text-[#081D3A] disabled:opacity-50"
              >
                Alles ongelezen
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => runNotificationAction(clearAllNotifications)}
                className="rounded-xl px-2 py-2 text-[11px] font-black text-red-600 disabled:opacity-50"
              >
                Alles wissen
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <Link
        href="/berichten"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-white shadow-lg active:scale-95"
        style={{ backgroundColor: "rgba(255,255,255,0.11)" }}
        aria-label="Berichten"
      >
        <MessageSquare size={18} strokeWidth={2.15} />
        <CountBadge count={ticketSummary.unreadCount} />
      </Link>

      <div className="relative">
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-full bg-white px-1.5 text-[#061F44] shadow-lg active:scale-95"
          aria-haspopup="menu"
          aria-expanded={openMenu === "profile"}
          aria-label="Profielmenu"
          onClick={() =>
            setOpenMenu((current) => (current === "profile" ? null : "profile"))
          }
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
            className="absolute right-0 top-11 w-48 overflow-hidden rounded-2xl border bg-white py-1.5 text-sm shadow-2xl"
            role="menu"
            style={{ borderColor: "var(--color-border)", boxShadow: "0 18px 42px rgba(8,29,58,0.22)" }}
          >
            <Link
              href="/profiel"
              className="flex items-center gap-2.5 px-3.5 py-2.5 font-bold"
              role="menuitem"
              style={{ color: "var(--color-primary)" }}
            >
              <UserCircle size={17} strokeWidth={2.3} />
              Profiel
            </Link>
            <Link
              href="/beveiliging"
              className="flex items-center gap-2.5 px-3.5 py-2.5 font-bold"
              role="menuitem"
              style={{ color: "var(--color-primary)" }}
            >
              <Settings size={17} strokeWidth={2.3} />
              Beveiliging
            </Link>
            <Link
              href="/meldingen"
              className="flex items-center gap-2.5 px-3.5 py-2.5 font-bold"
              role="menuitem"
              style={{ color: "var(--color-primary)" }}
            >
              <MailOpen size={17} strokeWidth={2.3} />
              Meldingen
            </Link>
            <div className="my-1 border-t" style={{ borderColor: "var(--color-border)" }} />
            <form action={signOut}>
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left font-bold"
                role="menuitem"
                style={{ color: "var(--color-destructive)" }}
              >
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
  notificationSummary,
  ticketSummary,
}: {
  notificationSummary: NotificationSummary;
  ticketSummary: TicketSummary;
}) {
  const pathname = usePathname();
  const isAssignmentDetail = /^\/opdrachten\/[^/]+/.test(pathname);

  if (isAssignmentDetail) return null;

  return (
    <header
      className="sticky top-0 z-40 md:hidden"
      style={{ background: "linear-gradient(180deg, #06224A 0%, #061F44 100%)" }}
    >
      <div className="flex items-center justify-between px-4 pb-3 pt-[calc(0.7rem+var(--safe-top))]">
        <VeeleLogo />
        <MobileHeaderActions
          notificationSummary={notificationSummary}
          ticketSummary={ticketSummary}
        />
      </div>
    </header>
  );
}
