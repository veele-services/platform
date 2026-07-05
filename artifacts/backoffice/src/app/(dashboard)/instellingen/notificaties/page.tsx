import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import {
  getNotificationAudienceOptions,
  getOrganizationSettings,
  listNotificationEventSettings,
} from "@/app/actions/settings";
import { NotificatiesView } from "@/components/settings/NotificatiesView";
import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";

export const metadata: Metadata = { title: "Notificatie-instellingen" };

export default async function NotificatiesPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("settings", "read"),
    hasPermission("settings", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="instellingen" action="read" />;

  const [settings, events, audienceOptions] = await Promise.all([
    getOrganizationSettings(),
    listNotificationEventSettings(),
    getNotificationAudienceOptions(),
  ]);

  return (
    <SettingsSectionShell
      title="Notificaties"
      description="Beheer automatische triggers, e-mailtemplates, push/in-app notificaties en handmatige berichten."
    >
      <NotificatiesView
        settings={settings}
        events={events}
        audienceOptions={audienceOptions}
        canWrite={canWrite}
      />
    </SettingsSectionShell>
  );
}
