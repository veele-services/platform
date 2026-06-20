"use client";

import { useActionState, useState, useTransition } from "react";
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  Mail,
  Newspaper,
  Smartphone,
} from "lucide-react";
import {
  updateMyNotificationSettings,
  type PersonnelProfile,
} from "@/actions/personnel";
import { saveMyPushSubscription } from "@/actions/push";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

const OPTIONS = [
  {
    name: "email",
    label: "E-mailmeldingen",
    description: "Belangrijke updates ook per e-mail ontvangen.",
    Icon: Mail,
    field: "notificationEmailEnabled",
  },
  {
    name: "push",
    label: "Pushmeldingen",
    description: "Voorbereid voor PWA-push zodra dit gekoppeld wordt.",
    Icon: Smartphone,
    field: "notificationPushEnabled",
  },
  {
    name: "planning",
    label: "Planning updates",
    description: "Nieuwe, verplaatste of vervallen diensten.",
    Icon: CalendarClock,
    field: "notificationPlanningEnabled",
  },
  {
    name: "news",
    label: "Nieuwsberichten",
    description: "Interne berichten en aankondigingen.",
    Icon: Newspaper,
    field: "notificationNewsEnabled",
  },
  {
    name: "hours",
    label: "Uren en herinneringen",
    description: "Herinneringen voor urenregistratie en controles.",
    Icon: Clock3,
    field: "notificationHoursEnabled",
  },
] as const;

type OptionName = (typeof OPTIONS)[number]["name"];

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function NotificationSettingsForm({
  profile,
}: {
  profile: PersonnelProfile;
}) {
  const [state, formAction, isPending] = useActionState(
    updateMyNotificationSettings,
    undefined,
  );
  const [pushStatus, setPushStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isRegisteringPush, startPushRegistration] = useTransition();
  const [enabled, setEnabled] = useState<Record<OptionName, boolean>>(() => ({
    email: profile.notificationEmailEnabled,
    push: profile.notificationPushEnabled,
    planning: profile.notificationPlanningEnabled,
    news: profile.notificationNewsEnabled,
    hours: profile.notificationHoursEnabled,
  }));

  function registerPush() {
    setPushStatus(null);
    startPushRegistration(async () => {
      if (!VAPID_PUBLIC_KEY) {
        setPushStatus({
          type: "error",
          text: "Push is technisch voorbereid. Stel eerst NEXT_PUBLIC_VAPID_PUBLIC_KEY en de server-side VAPID keys in.",
        });
        return;
      }

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushStatus({
          type: "error",
          text: "Deze browser ondersteunt web push niet.",
        });
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushStatus({
          type: "error",
          text: "Push toestemming is niet gegeven.",
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

      setPushStatus(
        result.success
          ? { type: "success", text: "Browser is geregistreerd voor pushmeldingen." }
          : { type: "error", text: result.error },
      );
    });
  }

  return (
    <form action={formAction} className="space-y-3">
      {OPTIONS.map(({ name, label, description, Icon }) => {
        const active = enabled[name];
        return (
          <label
            key={name}
            className="flex items-center gap-3 rounded-[20px] border bg-white px-3 py-3 shadow-sm"
            style={{ borderColor: active ? "#BDEDEA" : "#D8E8F3" }}
          >
            <input
              type="checkbox"
              name={name}
              checked={active}
              onChange={(event) =>
                setEnabled((current) => ({
                  ...current,
                  [name]: event.target.checked,
                }))
              }
              className="sr-only"
            />
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: active ? "#E8FBFA" : "#F1F5F9",
                color: active ? "#009E9A" : "#94A3B8",
              }}
            >
              <Icon size={20} strokeWidth={2.4} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-[#081D3A]">
                {label}
              </span>
              <span className="block text-xs font-semibold text-slate-500">
                {description}
              </span>
            </span>
            <span
              className="relative h-8 w-14 shrink-0 rounded-full transition-colors"
              style={{
                backgroundColor: active ? "#00B7B3" : "#CBD5E1",
              }}
            >
              <span
                className="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform"
                style={{
                  transform: active ? "translateX(26px)" : "translateX(4px)",
                }}
              />
            </span>
          </label>
        );
      })}

      {state?.error ? (
        <p className="rounded-2xl bg-red-50 px-3 py-2.5 text-sm font-bold text-red-600">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-700">
          <CheckCircle2 size={17} strokeWidth={2.4} />
          Voorkeuren opgeslagen
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00B7B3] px-4 py-3.5 text-base font-black text-white shadow-lg disabled:opacity-60"
      >
        {isPending ? (
          <Loader2 size={19} className="animate-spin" />
        ) : (
          <BellRing size={19} strokeWidth={2.4} />
        )}
        Meldingen opslaan
      </button>

      <button
        type="button"
        disabled={isRegisteringPush}
        onClick={registerPush}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3.5 text-sm font-black text-[#081D3A] shadow-sm disabled:opacity-60"
        style={{ borderColor: "#BDEDEA" }}
      >
        {isRegisteringPush ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Smartphone size={18} strokeWidth={2.4} />
        )}
        Browser push activeren
      </button>

      {pushStatus ? (
        <p
          className={`rounded-2xl px-3 py-2.5 text-sm font-bold ${
            pushStatus.type === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          {pushStatus.text}
        </p>
      ) : null}
    </form>
  );
}
