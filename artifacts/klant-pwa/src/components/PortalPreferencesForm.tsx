"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import {
  updateMyPortalPreferences,
  type CustomerPortalPreferenceState,
  type PreferenceResult,
} from "@/actions/preferences";

const OPTIONS = [
  { name: "emailNotifications",  label: "E-mailmeldingen ontvangen", description: "Hoofdschakelaar voor operationele e-mails." },
  { name: "invoiceEmails",       label: "Facturen en betalingen", description: "Nieuwe facturen, herinneringen en betaalstatus." },
  { name: "quoteEmails",         label: "Offertes", description: "Offertes die beoordeling of akkoord nodig hebben." },
  { name: "reportEmails",        label: "Rapportages", description: "Nieuwe rapportages en documenten na uitvoering." },
  { name: "serviceUpdateEmails", label: "Service-updates", description: "Updates over aanvragen, planning en objecten." },
  { name: "marketingEmails",     label: "Commerciële updates", description: "Nieuws over diensten en algemene campagnes." },
  { name: "pushNotifications",   label: "Pushmeldingen", description: "Voorbereid voor PWA pushnotificaties." },
] as const;

export function PortalPreferencesForm({ preferences }: { preferences: CustomerPortalPreferenceState }) {
  const [state, formAction, pending] = useActionState<PreferenceResult, FormData>(
    updateMyPortalPreferences,
    { success: false, error: "" },
  );

  return (
    <form action={formAction} className="rounded-[22px] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black" style={{ color: "var(--color-primary)" }}>
            Notificatie- en e-mailinstellingen
          </h2>
          <p className="mt-1 text-sm font-medium" style={{ color: "var(--color-secondary)" }}>
            Bepaal welke klantportaalmeldingen u per e-mail of push wilt ontvangen.
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
            <input
              type="checkbox"
              name={option.name}
              defaultChecked={preferences[option.name]}
              className="mt-1 h-4 w-4 accent-[#00B7B3]"
            />
            <span>
              <span className="block text-sm font-black" style={{ color: "var(--color-primary)" }}>
                {option.label}
              </span>
              <span className="mt-0.5 block text-xs font-medium leading-5" style={{ color: "var(--color-secondary)" }}>
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </div>

      {state && !state.success && state.error ? (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {state.error}
        </p>
      ) : null}
      {state?.success && !pending ? (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          Instellingen opgeslagen.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        <Save size={16} />
        {pending ? "Opslaan..." : "Instellingen opslaan"}
      </button>
    </form>
  );
}
