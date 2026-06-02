"use client";

import { useState, useTransition } from "react";
import { Bell, CheckCircle2, AlertCircle } from "lucide-react";
import { updateOrganizationSettings } from "@/app/actions/settings";
import type { OrgSettings } from "@/app/actions/settings";

interface Props {
  settings: OrgSettings | null;
  canWrite: boolean;
}

const NOTIFICATION_ITEMS: {
  key: keyof OrgSettings;
  label:       string;
  description: string;
}[] = [
  {
    key:         "notifRapportGoedgekeurd",
    label:       "Rapport goedgekeurd",
    description: "Medewerker ontvangt een e-mail wanneer het door hem/haar ingediende rapport wordt goedgekeurd.",
  },
  {
    key:         "notifRapportAfgekeurd",
    label:       "Rapport afgekeurd",
    description: "Medewerker ontvangt een e-mail met reden wanneer het rapport wordt afgekeurd.",
  },
  {
    key:         "notifOfferteVerstuurd",
    label:       "Offerte verzonden",
    description: "Klant ontvangt een e-mail wanneer een offerte klaarstaat ter goedkeuring.",
  },
  {
    key:         "notifOfferteVerlopen",
    label:       "Offerte verlopen",
    description: "Klant ontvangt een e-mail wanneer een offerte is verlopen zonder reactie.",
  },
  {
    key:         "notifBetalingHerinnering",
    label:       "Betalingsherinnering",
    description: "Klant ontvangt een automatische betalingsherinnering bij een te late factuur.",
  },
];

export function NotificatiesView({ settings, canWrite }: Props) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const s = settings;

  const [toggles, setToggles] = useState({
    notifRapportGoedgekeurd:  s?.notifRapportGoedgekeurd  ?? true,
    notifRapportAfgekeurd:    s?.notifRapportAfgekeurd    ?? true,
    notifOfferteVerstuurd:    s?.notifOfferteVerstuurd    ?? true,
    notifOfferteVerlopen:     s?.notifOfferteVerlopen     ?? true,
    notifBetalingHerinnering: s?.notifBetalingHerinnering ?? true,
  });
  const [herinneringDagen, setHerinneringDagen] = useState(
    s?.notifHerinneringDagen ?? 7,
  );

  function handleToggle(key: keyof typeof toggles) {
    if (!canWrite) return;
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    setError(null);

    startTransition(async () => {
      const result = await updateOrganizationSettings({
        ...toggles,
        notifHerinneringDagen: herinneringDagen,
      });
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.message ?? "Opslaan mislukt.");
      }
    });
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Toggle list */}
      <div className="veele-card divide-y divide-slate-100">
        <p className="text-sm font-semibold pb-3" style={{ color: "#081D3A" }}>
          E-mailnotificaties
        </p>

        {NOTIFICATION_ITEMS.map(({ key, label, description }) => {
          const notifKey = key as keyof typeof toggles;
          const enabled  = toggles[notifKey];

          return (
            <div key={key} className="flex items-start justify-between py-4 gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: "#1E293B" }}>{label}</p>
                <p className="mt-0.5 text-xs" style={{ color: "#64748B" }}>{description}</p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={!canWrite || isPending}
                onClick={() => handleToggle(notifKey)}
                className="relative inline-flex flex-shrink-0 h-5 w-9 rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: enabled ? "#081D3A" : "#CBD5E1",
                  cursor: canWrite ? "pointer" : "default",
                }}
              >
                <span
                  className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform ring-0 transition-transform duration-200"
                  style={{ transform: enabled ? "translateX(16px)" : "translateX(0px)" }}
                />
              </button>
            </div>
          );
        })}
      </div>

      {/* Reminder days */}
      <div className="veele-card space-y-3">
        <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
          Betalingsherinnering instelling
        </p>
        <p className="text-xs" style={{ color: "#64748B" }}>
          Aantal dagen na de vervaldatum van een factuur waarna een betalingsherinnering wordt verstuurd.
        </p>

        <div className="flex items-center gap-3">
          <label htmlFor="herinneringDagen" className="text-sm" style={{ color: "#374151" }}>
            Verstuur herinnering na
          </label>
          <input
            id="herinneringDagen"
            type="number"
            min={1}
            max={90}
            value={herinneringDagen}
            onChange={(e) => setHerinneringDagen(Math.max(1, Math.min(90, parseInt(e.target.value, 10) || 7)))}
            disabled={!canWrite || isPending}
            className="veele-input w-20"
          />
          <span className="text-sm" style={{ color: "#374151" }}>dagen</span>
        </div>
      </div>

      {/* E-mail config status */}
      <div className="veele-card" style={{ backgroundColor: "#F8FAFC" }}>
        <div className="flex items-start gap-3">
          <Bell className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#64748B" }} strokeWidth={1.75} />
          <div>
            <p className="text-sm font-medium" style={{ color: "#1E293B" }}>E-mailafzender</p>
            <p className="mt-0.5 text-xs" style={{ color: "#64748B" }}>
              E-mails worden verstuurd via{" "}
              <span className="font-mono" style={{ color: "#334155" }}>
                {process.env["RESEND_FROM_EMAIL"] ?? "noreply@veele.nl"}
              </span>
              . Configureer de afzender en API-sleutel (
              <code className="text-xs" style={{ color: "#334155" }}>RESEND_API_KEY</code>,{" "}
              <code className="text-xs" style={{ color: "#334155" }}>RESEND_FROM_EMAIL</code>
              ) in de omgevingsvariabelen.
            </p>
          </div>
        </div>
      </div>

      {canWrite && (
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: "#081D3A" }}
          >
            {isPending ? "Opslaan…" : "Wijzigingen opslaan"}
          </button>

          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#059669" }}>
              <CheckCircle2 className="h-4 w-4" />
              Opgeslagen
            </span>
          )}
          {error && (
            <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#DC2626" }}>
              <AlertCircle className="h-4 w-4" />
              {error}
            </span>
          )}
        </div>
      )}
    </form>
  );
}
