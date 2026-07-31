export const dynamic = "force-dynamic";

import { getMyNotifications } from "@/actions/notifications";
import { NotificationsInbox } from "./NotificationsInbox";
import { notFound } from "next/navigation";
import { requireCurrentPortalModule } from "@/lib/auth/tenant";
import { InboxTabs } from "@/components/InboxTabs";
import { MobilePageShell } from "@/components/MobilePageShell";

export default async function MeldingenPage() {
  if (!(await requireCurrentPortalModule("notifications"))) notFound();
  const notifications = await getMyNotifications();

  return (
    <MobilePageShell
      title="Inbox"
      subtitle="Berichten en meldingen op één plek"
    >
      <div className="mx-auto max-w-3xl space-y-3">
        <InboxTabs active="notifications" notificationsEnabled />
        <NotificationsInbox notifications={notifications} />
      </div>
    </MobilePageShell>
  );
}
