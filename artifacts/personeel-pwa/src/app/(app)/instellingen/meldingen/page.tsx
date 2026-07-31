export const dynamic = "force-dynamic";

import { getMyPersonnel } from "@/actions/personnel";
import {
  PersonnelSettingsCard,
  PersonnelSettingsFeedback,
  PersonnelSettingsShell,
} from "@/components/SettingsShell";
import { NotificationSettingsForm } from "../../meldingen/NotificationSettingsForm";
import { notFound } from "next/navigation";
import { requireCurrentPortalModule } from "@/lib/auth/tenant";

export default async function InstellingenMeldingenPage() {
  if (!(await requireCurrentPortalModule("notifications"))) notFound();
  const profile = await getMyPersonnel();

  return (
    <PersonnelSettingsShell
      active="notifications"
      title="Meldingen"
      subtitle="Kies welke updates je wilt ontvangen."
      notificationsEnabled
    >
      <PersonnelSettingsCard>
        {profile ? (
          <NotificationSettingsForm profile={profile} />
        ) : (
          <PersonnelSettingsFeedback type="error">
            Profielgegevens niet gevonden.
          </PersonnelSettingsFeedback>
        )}
      </PersonnelSettingsCard>
    </PersonnelSettingsShell>
  );
}
