"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
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
import {
  deactivateMyPushSubscription,
  getMyPushSubscriptionStatus,
  saveMyPushSubscription,
} from "@/actions/push";
import {
  ensureBrowserPushSubscription,
  getLocalPushState,
  unsubscribeBrowserPush,
} from "@/lib/browser-push";

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
    description: "Ontvang urgente updates ook buiten de app op dit apparaat.",
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
type PushDeviceState = {
  status: "checking" | "active" | "inactive" | "unsupported" | "denied" | "error";
  text: string;
  endpoint: string | null;
};

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
  const [isPushBusy, startPushTransition] = useTransition();
  const [pushDevice, setPushDevice] = useState<PushDeviceState>({
    status: "checking",
    text: "Pushstatus van dit apparaat controleren...",
    endpoint: null,
  });
  const [enabled, setEnabled] = useState<Record<OptionName, boolean>>(() => ({
    email: profile.notificationEmailEnabled,
    push: profile.notificationPushEnabled,
    planning: profile.notificationPlanningEnabled,
    news: profile.notificationNewsEnabled,
    hours: profile.notificationHoursEnabled,
  }));

  useEffect(() => {
    refreshPushStatus();
  }, []);

  async function saveBrowserSubscription(subscription: PushSubscription) {
    const serialized = subscription.toJSON();
    return saveMyPushSubscription({
      endpoint: serialized.endpoint ?? "",
      keys: {
        p256dh: serialized.keys?.p256dh,
        auth: serialized.keys?.auth,
      },
      userAgent: navigator.userAgent,
    });
  }

  function refreshPushStatus() {
    setPushStatus(null);
    startPushTransition(async () => {
      const localState = await getLocalPushState();

      if (!localState.supported) {
        setPushDevice({
          status: "unsupported",
          text: localState.reason,
          endpoint: null,
        });
        return;
      }

      if (localState.permission === "denied") {
        setPushDevice({
          status: "denied",
          text: "Push is geblokkeerd in de browserinstellingen.",
          endpoint: null,
        });
        return;
      }

      if (!localState.subscription || !localState.endpoint) {
        setPushDevice({
          status: "inactive",
          text:
            localState.permission === "granted"
              ? "Browsertoestemming staat aan, maar er is geen actief push-abonnement voor dit apparaat."
              : "Push is nog niet geactiveerd op dit apparaat.",
          endpoint: null,
        });
        return;
      }

      const serverStatus = await getMyPushSubscriptionStatus(localState.endpoint);
      if (serverStatus.success && serverStatus.active) {
        setPushDevice({
          status: "active",
          text: "Push is actief op dit apparaat.",
          endpoint: localState.endpoint,
        });
        return;
      }

      const result = await saveBrowserSubscription(localState.subscription);
      if (result.success) {
        setEnabled((current) => ({ ...current, push: true }));
        setPushDevice({
          status: "active",
          text: "Bestaand browserabonnement is opnieuw gekoppeld aan je account.",
          endpoint: localState.endpoint,
        });
        return;
      }

      setPushDevice({
        status: "error",
        text: result.error,
        endpoint: localState.endpoint,
      });
    });
  }

  function registerPush() {
    setPushStatus(null);
    startPushTransition(async () => {
      try {
        const subscription = await ensureBrowserPushSubscription();
        const result = await saveBrowserSubscription(subscription);

        if (result.success) {
          setEnabled((current) => ({ ...current, push: true }));
          setPushDevice({
            status: "active",
            text: "Browser is geregistreerd voor pushmeldingen.",
            endpoint: subscription.endpoint,
          });
          setPushStatus({
            type: "success",
            text: "Push is actief op dit apparaat.",
          });
          return;
        }

        setPushStatus({
          type: "error",
          text: result.error,
        });
        setPushDevice({
          status: "error",
          text: result.error,
          endpoint: subscription.endpoint,
        });
      } catch (error) {
        const text =
          error instanceof Error
            ? error.message
            : "Push kon niet worden geactiveerd.";
        setPushStatus({
          type: "error",
          text,
        });
        setPushDevice({ status: "error", text, endpoint: null });
      }
    });
  }

  function disablePush() {
    setPushStatus(null);
    startPushTransition(async () => {
      const endpoint = await unsubscribeBrowserPush();
      if (endpoint) {
        const result = await deactivateMyPushSubscription(endpoint);
        if (!result.success) {
          setPushStatus({ type: "error", text: result.error });
          return;
        }
      }

      setPushDevice({
        status: "inactive",
        text: "Push is uitgezet op dit apparaat.",
        endpoint: null,
      });
      setPushStatus({
        type: "success",
        text: "Push is uitgezet op dit apparaat.",
      });
    });
  }

  function renderPushDeviceBadge() {
    if (pushDevice.status === "active") {
      return "Actief";
    }
    if (pushDevice.status === "checking") {
      return "Controleren";
    }
    if (pushDevice.status === "denied") {
      return "Geblokkeerd";
    }
    return "Niet actief";
  }

  function renderPushDeviceBadgeClass() {
    if (pushDevice.status === "active") {
      return "bg-emerald-50 text-emerald-700";
    }
    if (pushDevice.status === "denied" || pushDevice.status === "error") {
      return "bg-red-50 text-red-600";
    }
    return "bg-slate-100 text-slate-600";
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

      <section
        className="rounded-[24px] border bg-white p-4 shadow-sm"
        style={{ borderColor: "#D8E8F3" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
              <Smartphone size={20} strokeWidth={2.4} />
            </span>
            <div>
              <h3 className="text-sm font-black text-[#081D3A]">
                Browser push
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {pushDevice.text}
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black ${renderPushDeviceBadgeClass()}`}
          >
            {renderPushDeviceBadge()}
          </span>
        </div>

        <div className="mt-3 grid gap-2">
          <button
            type="button"
            disabled={isPushBusy}
            onClick={
              pushDevice.status === "active" ? refreshPushStatus : registerPush
            }
            className="flex w-full items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-black text-[#081D3A] shadow-sm disabled:opacity-60"
            style={{ borderColor: "#BDEDEA" }}
          >
            {isPushBusy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Smartphone size={18} strokeWidth={2.4} />
            )}
            {pushDevice.status === "active"
              ? "Status opnieuw controleren"
              : "Browser push activeren"}
          </button>

          {pushDevice.status === "active" ? (
            <button
              type="button"
              disabled={isPushBusy}
              onClick={disablePush}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-black text-red-600 shadow-sm disabled:opacity-60"
            >
              Push op dit apparaat uitzetten
            </button>
          ) : null}
        </div>
      </section>

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
