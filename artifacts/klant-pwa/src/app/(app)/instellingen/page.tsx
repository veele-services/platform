export const dynamic = "force-dynamic";

import { MailCheck, Smartphone } from "lucide-react";
import { getMyPortalPreferences } from "@/actions/preferences";
import { PortalPreferencesForm } from "@/components/PortalPreferencesForm";
import { CustomerSettingsShell } from "@/components/SettingsShell";

export default async function InstellingenPage() {
  const preferences = await getMyPortalPreferences();

  return (
    <CustomerSettingsShell
      active="preferences"
      title="Voorkeuren"
      subtitle="Klantportaalvoorkeuren voor e-mail, push en service-updates."
      aside={
        <>
          <div
            className="rounded-xl border bg-white p-4"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_10%,white)] text-[var(--color-accent-accessible)]">
                <MailCheck size={21} />
              </span>
              <div>
                <h2
                  className="text-lg font-black"
                  style={{ color: "var(--color-primary)" }}
                >
                  E-mailflows
                </h2>
                <p
                  className="mt-1 text-sm font-semibold leading-6"
                  style={{ color: "var(--color-secondary)" }}
                >
                  Deze voorkeuren worden opgeslagen per klant en bepalen welke
                  operationele updates u ontvangt.
                </p>
              </div>
            </div>
          </div>

          <div
            className="rounded-xl border bg-white p-4"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[var(--color-primary)]">
                <Smartphone size={21} />
              </span>
              <div>
                <h2
                  className="text-lg font-black"
                  style={{ color: "var(--color-primary)" }}
                >
                  Apparaatmeldingen
                </h2>
                <p
                  className="mt-1 text-sm font-semibold leading-6"
                  style={{ color: "var(--color-secondary)" }}
                >
                  Pushmeldingen verschijnen alleen wanneer apparaatregistratie
                  voor dit portaal actief is.
                </p>
              </div>
            </div>
          </div>
        </>
      }
    >
      <PortalPreferencesForm preferences={preferences} />
    </CustomerSettingsShell>
  );
}
