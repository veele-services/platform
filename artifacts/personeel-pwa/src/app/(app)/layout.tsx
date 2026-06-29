import { getMyTicketSummary } from "@/actions/messages";
import { getMyNotificationSummary } from "@/actions/notifications";
import { getMyPersonnel } from "@/actions/personnel";
import { BottomNav } from "@/components/BottomNav";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { MobileHeader } from "@/components/MobileHeader";
import { NativePushTokenSync } from "@/components/NativePushTokenSync";
import { PersonnelRealtimeOfflineProvider } from "@/components/PersonnelRealtimeOfflineProvider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notificationSummary, ticketSummary, personnel] = await Promise.all([
    getMyNotificationSummary(),
    getMyTicketSummary(),
    getMyPersonnel(),
  ]);

  return (
    <PersonnelRealtimeOfflineProvider personnelId={personnel?.id ?? null}>
      <div
        className="flex min-h-screen"
        style={{ backgroundColor: "var(--color-muted)" }}
      >
        <DesktopSidebar />

        <div className="flex flex-1 flex-col min-w-0">
          <MobileHeader
            notificationSummary={notificationSummary}
            ticketSummary={ticketSummary}
          />
          <NativePushTokenSync enabled={personnel?.notificationPushEnabled ?? false} />

          <main className="flex-1 pb-[calc(5.2rem+var(--safe-bottom))] md:pb-0">
            <div className="mx-auto w-full max-w-4xl px-0 md:px-6 md:py-6">
              {children}
            </div>
          </main>

          <div className="md:hidden">
            <BottomNav />
          </div>
        </div>
      </div>
    </PersonnelRealtimeOfflineProvider>
  );
}
