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
      title="Meldingen en voorkeuren"
      subtitle="Klantportaalvoorkeuren voor e-mail, push en service-updates."
      aside={
        <>
          <div className="rounded-[22px] bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#087C79]">
                <MailCheck size={21} />
              </span>
              <div>
                <h2 className="text-lg font-black" style={{ color: "var(--color-primary)" }}>
                  E-mailflows
                </h2>
                <p className="mt-1 text-sm font-semibold leading-6" style={{ color: "var(--color-secondary)" }}>
                  Deze voorkeuren worden opgeslagen per klant en bepalen welke operationele updates u ontvangt.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[22px] bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-[var(--color-primary)]">
                <Smartphone size={21} />
              </span>
              <div>
                <h2 className="text-lg font-black" style={{ color: "var(--color-primary)" }}>
                  Apparaatmeldingen
                </h2>
                <p className="mt-1 text-sm font-semibold leading-6" style={{ color: "var(--color-secondary)" }}>
                  Pushmeldingen verschijnen alleen wanneer apparaatregistratie voor dit portaal actief is.
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
