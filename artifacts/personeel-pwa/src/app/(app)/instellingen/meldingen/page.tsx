export const dynamic = "force-dynamic";

import { getMyPersonnel } from "@/actions/personnel";
import { MobilePageShell } from "@/components/MobilePageShell";
import { NotificationSettingsForm } from "../../meldingen/NotificationSettingsForm";

export default async function InstellingenMeldingenPage() {
  const profile = await getMyPersonnel();

  return (
    <MobilePageShell
      title="Meldingen"
      subtitle="Kies welke updates je wilt ontvangen."
    >
      <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.11)] md:p-5">
        {profile ? (
          <NotificationSettingsForm profile={profile} />
        ) : (
          <p className="rounded-2xl bg-red-50 px-3 py-2.5 text-sm font-bold text-red-600">
            Profielgegevens niet gevonden.
          </p>
        )}
      </section>
    </MobilePageShell>
  );
}
