"use client";

import { CheckboxAdapter } from "@workspace/shared-ui";
import { useActionState, useState, useTransition } from "react";
import { Loader2, Smartphone } from "lucide-react";
import {
  updateMyPortalPreferences,
  type CustomerPortalPreferenceState,
  type PreferenceResult,
} from "@/actions/preferences";
import { saveMyCustomerPushSubscription } from "@/actions/push";
import {
  CustomerSettingsFeedback,
  CustomerSettingsSaveBar,
} from "./SettingsShell";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

const OPTIONS = [
  {
    name: "emailNotifications",
    label: "E-mailmeldingen ontvangen",
    description: "Hoofdschakelaar voor operationele e-mails.",
  },
  {
    name: "invoiceEmails",
    label: "Facturen en betalingen",
    description: "Nieuwe facturen, herinneringen en betaalstatus.",
  },
  {
    name: "quoteEmails",
    label: "Offertes",
    description: "Offertes die beoordeling of akkoord nodig hebben.",
  },
  {
    name: "reportEmails",
    label: "Rapportages",
    description: "Nieuwe rapportages en documenten na uitvoering.",
  },
  {
    name: "serviceUpdateEmails",
    label: "Service-updates",
    description: "Updates over aanvragen, planning en objecten.",
  },
  {
    name: "marketingEmails",
    label: "Commerciele updates",
    description: "Nieuws over diensten en algemene campagnes.",
  },
  {
    name: "pushNotifications",
    label: "Pushmeldingen",
    description: "Apparaatmeldingen wanneer push voor dit portaal actief is.",
  },
] as const;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function PortalPreferencesForm({
  preferences,
}: {
  preferences: CustomerPortalPreferenceState;
}) {
  const [state, formAction, pending] = useActionState<
    PreferenceResult,
    FormData
  >(updateMyPortalPreferences, { success: false, error: "" });
  const [pushStatus, setPushStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isRegisteringPush, startPushRegistration] = useTransition();

  function registerPush() {
    setPushStatus(null);
    startPushRegistration(async () => {
      if (!VAPID_PUBLIC_KEY) {
        setPushStatus({
          type: "error",
          text: "Pushmeldingen zijn nog niet actief voor deze omgeving. E-mailmeldingen blijven beschikbaar.",
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
      const result = await saveMyCustomerPushSubscription({
        endpoint: serialized.endpoint ?? "",
        keys: {
          p256dh: serialized.keys?.p256dh,
          auth: serialized.keys?.auth,
        },
        userAgent: navigator.userAgent,
      });

      setPushStatus(
        result.success
          ? {
              type: "success",
              text: "Browser is geregistreerd voor pushmeldingen.",
            }
          : { type: "error", text: result.error },
      );
    });
  }

  return (
    <form action={formAction} className="rounded-[22px] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            className="text-lg font-black"
            style={{ color: "var(--color-primary)" }}
          >
            Notificatie- en e-mailinstellingen
          </h2>
          <p
            className="mt-1 text-sm font-medium"
            style={{ color: "var(--color-secondary)" }}
          >
            Bepaal welke klantportaalmeldingen u per e-mail of push wilt
            ontvangen.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {OPTIONS.map((option) => (
          <label
            key={option.name}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3"
            style={{ borderColor: "var(--color-border)" }}
          >
            <CheckboxAdapter
              type="checkbox"
              name={option.name}
              defaultChecked={preferences[option.name]}
              className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
            />
            <span>
              <span
                className="block text-sm font-black"
                style={{ color: "var(--color-primary)" }}
              >
                {option.label}
              </span>
              <span
                className="mt-0.5 block text-xs font-medium leading-5"
                style={{ color: "var(--color-secondary)" }}
              >
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </div>

      {state && !state.success && state.error ? (
        <div className="mt-4">
          <CustomerSettingsFeedback type="error">
            {state.error}
          </CustomerSettingsFeedback>
        </div>
      ) : null}
      {state?.success && !pending ? (
        <div className="mt-4">
          <CustomerSettingsFeedback type="success">
            Instellingen opgeslagen.
          </CustomerSettingsFeedback>
        </div>
      ) : null}

      <CustomerSettingsSaveBar pending={pending} label="Instellingen opslaan">
        {VAPID_PUBLIC_KEY ? (
          <button
            type="button"
            disabled={isRegisteringPush}
            onClick={registerPush}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-black disabled:opacity-60"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-primary)",
            }}
          >
            {isRegisteringPush ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Smartphone size={16} />
            )}
            Browser push activeren
          </button>
        ) : (
          <span
            className="inline-flex min-h-11 items-center rounded-2xl bg-slate-50 px-4 py-2.5 text-sm font-bold"
            style={{ color: "var(--color-secondary)" }}
          >
            Pushregistratie is niet actief voor deze omgeving.
          </span>
        )}
      </CustomerSettingsSaveBar>

      {pushStatus ? (
        <div className="mt-4">
          <CustomerSettingsFeedback
            type={pushStatus.type === "success" ? "success" : "warning"}
          >
            {pushStatus.text}
          </CustomerSettingsFeedback>
        </div>
      ) : null}
    </form>
  );
}
