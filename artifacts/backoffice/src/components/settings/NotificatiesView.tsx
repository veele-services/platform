"use client";

import { useState, useTransition } from "react";
import { Bell, CheckCircle2, AlertCircle, Send } from "lucide-react";
import { updateOrganizationSettings, sendTestNotification } from "@/app/actions/settings";
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

type TestStatus = "idle" | "sending" | "ok" | "error";

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

  const [testStatus, setTestStatus] = useState<Record<string, TestStatus>>({});

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

  function handleTest(key: string, label: string) {
    setTestStatus((prev) => ({ ...prev, [key]: "sending" }));
    void (async () => {
      const result = await sendTestNotification(key, label);
      setTestStatus((prev) => ({ ...prev, [key]: result.success ? "ok" : "error" }));
      setTimeout(() => setTestStatus((prev) => ({ ...prev, [key]: "idle" })), 4000);
    })();
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
          const ts       = testStatus[key as string] ?? "idle";

          return (
            <div key={key} className="py-4">
              <div className="flex items-start justify-between gap-4">
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

              {/* Test button row */}
              {canWrite && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={ts === "sending"}
                    onClick={() => handleTest(key as string, label)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-opacity disabled:opacity-50"
                    style={{ backgroundColor: "#F1F5F9", color: "#475569" }}
                  >
                    <Send className="h-3 w-3" />
                    {ts === "sending" ? "Versturen…" : "Stuur testmelding"}
                  </button>
                  {ts === "ok" && (
                    <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#059669" }}>
                      <CheckCircle2 className="h-3 w-3" />
                      Verstuurd
                    </span>
                  )}
                  {ts === "error" && (
                    <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#DC2626" }}>
                      <AlertCircle className="h-3 w-3" />
                      Mislukt - controleer mailinstellingen
                    </span>
                  )}
                </div>
              )}
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
          Per factuur wordt slechts één herinnering verstuurd binnen dit interval.
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
            <p className="text-sm font-medium" style={{ color: "#1E293B" }}>Mailconfiguratie</p>
            <p className="mt-0.5 text-xs" style={{ color: "#64748B" }}>
              E-mailtransport wordt beheerd via{" "}
              <a href="/instellingen/mail" className="font-medium underline" style={{ color: "#075E5D" }}>
                Mail-instellingen
              </a>
              . Huidige status:{" "}
              <span className="font-medium" style={{ color: "#334155" }}>
                {settings?.smtpEnabled && settings.smtpHost
                  ? `SMTP via ${settings.smtpHost}`
                  : "Resend fallback via omgevingsvariabelen"}
              </span>
              .
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
