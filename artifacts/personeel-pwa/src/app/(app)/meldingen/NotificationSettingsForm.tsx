"use client";

import { useActionState, useState } from "react";
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

export function NotificationSettingsForm({
  profile,
}: {
  profile: PersonnelProfile;
}) {
  const [state, formAction, isPending] = useActionState(
    updateMyNotificationSettings,
    undefined,
  );
  const [enabled, setEnabled] = useState<Record<OptionName, boolean>>(() => ({
    email: profile.notificationEmailEnabled,
    push: profile.notificationPushEnabled,
    planning: profile.notificationPlanningEnabled,
    news: profile.notificationNewsEnabled,
    hours: profile.notificationHoursEnabled,
  }));

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
    </form>
  );
}
