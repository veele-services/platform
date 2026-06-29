export const dynamic = "force-dynamic";

import { MailCheck, Smartphone } from "lucide-react";
import { getMyPortalPreferences } from "@/actions/preferences";
import { PageShell } from "@/components/PageShell";
import { PortalPreferencesForm } from "@/components/PortalPreferencesForm";

export default async function InstellingenPage() {
  const preferences = await getMyPortalPreferences();

  return (
    <PageShell title="Instellingen" subtitle="Klantportaalvoorkeuren voor meldingen en e-mail.">
      <section className="grid gap-4 xl:grid-cols-[1fr_24rem]">
        <PortalPreferencesForm preferences={preferences} />

        <aside className="space-y-4">
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
                  Deze voorkeuren worden opgeslagen per klant en kunnen door mailflows worden gebruikt.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[22px] bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-[#081D3A]">
                <Smartphone size={21} />
              </span>
              <div>
                <h2 className="text-lg font-black" style={{ color: "var(--color-primary)" }}>
                  PWA push
                </h2>
                <p className="mt-1 text-sm font-semibold leading-6" style={{ color: "var(--color-secondary)" }}>
                  Pushmeldingen zijn voorbereid in de voorkeuren; abonnementen volgen bij de notificatie-integratie.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </PageShell>
  );
}
