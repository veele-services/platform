export const dynamic = "force-dynamic";

import { getMyPersonnel } from "@/actions/personnel";
import {
  PersonnelSettingsCard,
  PersonnelSettingsFeedback,
  PersonnelSettingsShell,
} from "@/components/SettingsShell";
import { NotificationSettingsForm } from "../../meldingen/NotificationSettingsForm";

export default async function InstellingenMeldingenPage() {
  const profile = await getMyPersonnel();

  return (
    <PersonnelSettingsShell
      active="notifications"
      title="Meldingen"
      subtitle="Kies welke updates je wilt ontvangen."
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
