"use client";

import { CheckboxAdapter } from "@workspace/shared-ui";
import { useActionState, useEffect, useState, useTransition } from "react";
import {
  CalendarClock,
  Clock3,
  Loader2,
  Mail,
  Newspaper,
  Smartphone,
} from "lucide-react";
import {
  updateMyNotificationSettings,
  updateMyNotificationSettingsDirect,
  type PersonnelProfile,
} from "@/actions/personnel";
import {
  deactivateMyNativePushToken,
  deactivateMyPushSubscription,
  getMyNativePushTokenStatus,
  getMyPushSubscriptionStatus,
  saveMyNativePushToken,
  saveMyPushSubscription,
} from "@/actions/push";
import {
  ensureBrowserPushSubscription,
  getLocalPushState,
  unsubscribeBrowserPush,
} from "@/lib/browser-push";
import { isNativeCapacitorRuntime } from "@/lib/capacitor";
import {
  ensureNativePushRegistration,
  getLocalNativePushState,
  getNativePushAppMetadata,
  unregisterNativePush,
} from "@/lib/native-push";
import {
  PersonnelSettingsFeedback,
  PersonnelSettingsSaveBar,
} from "@/components/SettingsShell";

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
  status:
    | "checking"
    | "active"
    | "inactive"
    | "unsupported"
    | "denied"
    | "error";
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
  const [isNativeApp, setIsNativeApp] = useState(false);
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

  async function persistPreferences(next: Record<OptionName, boolean>) {
    return updateMyNotificationSettingsDirect({
      email: next.email,
      push: next.push,
      planning: next.planning,
      news: next.news,
      hours: next.hours,
    });
  }

  useEffect(() => {
    const native = isNativeCapacitorRuntime();
    setIsNativeApp(native);
    refreshPushStatus(native);
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

  async function saveNativeRegistration(registration: {
    token: string;
    platform: "android" | "ios";
    appId?: string;
    appVersion?: string;
    appBuild?: string;
  }) {
    const metadata =
      registration.appId && registration.appVersion && registration.appBuild
        ? {
            appId: registration.appId,
            appVersion: registration.appVersion,
            appBuild: registration.appBuild,
          }
        : await getNativePushAppMetadata();
    if (!metadata) {
      return {
        success: false as const,
        error: "De identiteit van deze personeelsapp kon niet worden gelezen.",
      };
    }
    return saveMyNativePushToken({
      token: registration.token,
      platform: registration.platform,
      appId: metadata.appId,
      appVersion: metadata.appVersion,
      appBuild: metadata.appBuild,
      userAgent: navigator.userAgent,
    });
  }

  function refreshPushStatus(nativeMode = isNativeApp) {
    setPushStatus(null);
    startPushTransition(async () => {
      if (nativeMode) {
        const localState = await getLocalNativePushState();

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
            text: "App push is geblokkeerd in de apparaatinstellingen.",
            endpoint: null,
          });
          return;
        }

        if (!localState.token) {
          setPushDevice({
            status: "inactive",
            text:
              localState.permission === "granted"
                ? "App toestemming staat aan, maar dit apparaat heeft nog geen gekoppelde FCM-token."
                : "App push is nog niet geactiveerd op dit apparaat.",
            endpoint: null,
          });
          return;
        }

        if (!enabled.push) {
          setPushDevice({
            status: "inactive",
            text: "App push staat uit in je voorkeuren.",
            endpoint: localState.token,
          });
          return;
        }

        const serverStatus = await getMyNativePushTokenStatus(localState.token);
        if (serverStatus.success && serverStatus.active) {
          setPushDevice({
            status: "active",
            text: "App push is actief op dit apparaat.",
            endpoint: localState.token,
          });
          return;
        }

        const result = await saveNativeRegistration({
          token: localState.token,
          platform: localState.platform,
        });
        if (result.success) {
          setEnabled((current) => ({ ...current, push: true }));
          setPushDevice({
            status: "active",
            text: "Bestaande FCM-token is opnieuw gekoppeld aan je account.",
            endpoint: localState.token,
          });
          return;
        }

        setPushDevice({
          status: "error",
          text: result.error,
          endpoint: localState.token,
        });
        return;
      }

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

      if (!enabled.push) {
        setPushDevice({
          status: "inactive",
          text: "Browser push staat uit in je voorkeuren.",
          endpoint: localState.endpoint,
        });
        return;
      }

      const serverStatus = await getMyPushSubscriptionStatus(
        localState.endpoint,
      );
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
        if (isNativeApp) {
          const previousState = await getLocalNativePushState();
          const previousToken = previousState.supported
            ? previousState.token
            : null;
          const registration = await ensureNativePushRegistration();

          if (previousToken && previousToken !== registration.token) {
            await deactivateMyNativePushToken(previousToken);
          }

          const result = await saveNativeRegistration(registration);

          if (result.success) {
            const next = { ...enabled, push: true };
            setEnabled(next);
            const preferencesResult = await persistPreferences(next);
            setPushDevice({
              status: "active",
              text: "App push is geregistreerd voor dit apparaat.",
              endpoint: registration.token,
            });
            setPushStatus({
              type: preferencesResult.success ? "success" : "error",
              text: preferencesResult.success
                ? "App push is actief op dit apparaat."
                : `App push is geregistreerd, maar de voorkeur kon niet worden opgeslagen: ${preferencesResult.error}`,
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
            endpoint: registration.token,
          });
          return;
        }

        const subscription = await ensureBrowserPushSubscription();
        const result = await saveBrowserSubscription(subscription);

        if (result.success) {
          const next = { ...enabled, push: true };
          setEnabled(next);
          const preferencesResult = await persistPreferences(next);
          setPushDevice({
            status: "active",
            text: "Browser is geregistreerd voor pushmeldingen.",
            endpoint: subscription.endpoint,
          });
          setPushStatus({
            type: preferencesResult.success ? "success" : "error",
            text: preferencesResult.success
              ? "Push is actief op dit apparaat."
              : `Push is geregistreerd, maar de voorkeur kon niet worden opgeslagen: ${preferencesResult.error}`,
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
      if (isNativeApp) {
        const token = await unregisterNativePush();
        if (token) {
          const result = await deactivateMyNativePushToken(token);
          if (!result.success) {
            setPushStatus({ type: "error", text: result.error });
            return;
          }
        }

        setPushDevice({
          status: "inactive",
          text: "App push is uitgezet op dit apparaat.",
          endpoint: null,
        });
        const next = { ...enabled, push: false };
        setEnabled(next);
        const preferencesResult = await persistPreferences(next);
        setPushStatus({
          type: preferencesResult.success ? "success" : "error",
          text: preferencesResult.success
            ? "App push is uitgezet op dit apparaat."
            : `App push is uitgezet, maar de voorkeur kon niet worden opgeslagen: ${preferencesResult.error}`,
        });
        return;
      }

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
      const next = { ...enabled, push: false };
      setEnabled(next);
      const preferencesResult = await persistPreferences(next);
      setPushStatus({
        type: preferencesResult.success ? "success" : "error",
        text: preferencesResult.success
          ? "Push is uitgezet op dit apparaat."
          : `Push is uitgezet, maar de voorkeur kon niet worden opgeslagen: ${preferencesResult.error}`,
      });
    });
  }

  function renderPushStatusClass() {
    if (pushDevice.status === "active") {
      return "text-emerald-700";
    }
    if (pushDevice.status === "denied" || pushDevice.status === "error") {
      return "text-red-600";
    }
    return "text-slate-500";
  }

  return (
    <form action={formAction} className="space-y-3">
      {OPTIONS.map(({ name, label, description, Icon }) => {
        const active = enabled[name];
        const isPushOption = name === "push";
        return (
          <label
            key={name}
            className="flex items-center gap-3 rounded-[20px] border bg-white px-3 py-3 shadow-sm"
            style={{ borderColor: active ? "#BDEDEA" : "#D8E8F3" }}
          >
            <CheckboxAdapter
              type="checkbox"
              name={name}
              checked={active}
              disabled={isPushOption && isPushBusy}
              onChange={(event) => {
                const checked = event.target.checked;
                if (isPushOption) {
                  if (checked) registerPush();
                  else disablePush();
                  return;
                }

                setEnabled((current) => ({
                  ...current,
                  [name]: checked,
                }));
              }}
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
              {isPushOption ? (
                <span
                  className={`mt-1 block text-[11px] font-black ${renderPushStatusClass()}`}
                >
                  {isNativeApp ? "App push" : "Browser push"} -{" "}
                  {pushDevice.text}
                </span>
              ) : null}
            </span>
            <span
              className="relative h-8 w-14 shrink-0 rounded-full transition-colors"
              style={{
                backgroundColor: active ? "#00B7B3" : "#CBD5E1",
              }}
            >
              {isPushOption && isPushBusy ? (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Loader2 size={16} className="animate-spin text-white" />
                </span>
              ) : null}
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
        <PersonnelSettingsFeedback type="error">
          {state.error}
        </PersonnelSettingsFeedback>
      ) : null}
      {state?.success ? (
        <PersonnelSettingsFeedback type="success">
          Voorkeuren opgeslagen
        </PersonnelSettingsFeedback>
      ) : null}

      <PersonnelSettingsSaveBar pending={isPending} label="Meldingen opslaan" />

      {pushStatus ? (
        <PersonnelSettingsFeedback
          type={pushStatus.type === "success" ? "success" : "warning"}
        >
          {pushStatus.text}
        </PersonnelSettingsFeedback>
      ) : null}
    </form>
  );
}
