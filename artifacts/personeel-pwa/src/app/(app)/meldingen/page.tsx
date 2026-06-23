export const dynamic = "force-dynamic";

import { getMyNotifications } from "@/actions/notifications";
import { NotificationsInbox } from "./NotificationsInbox";

export default async function MeldingenPage() {
  const notifications = await getMyNotifications();

  return (
    <div className="min-h-[calc(100vh-4.2rem)] bg-[#061F44] md:bg-transparent">
      <section className="px-4 pb-6 pt-4 md:rounded-3xl md:px-6">
        <h1 className="text-[29px] font-black leading-tight text-white md:text-3xl">
          Meldingen
        </h1>
        <p className="mt-1 text-base font-medium text-white/68">
          Inbox en notificaties
        </p>
      </section>

      <section className="min-h-[calc(100vh-14rem)] rounded-t-[28px] bg-[#F4F7FB] px-3.5 pb-[calc(6.4rem+var(--safe-bottom))] pt-4 md:min-h-0 md:rounded-3xl md:px-0 md:pb-0 md:pt-0">
        <div className="mx-auto max-w-xl space-y-4 md:max-w-3xl">
          <NotificationsInbox notifications={notifications} />
        </div>
      </section>
    </div>
  );
}
