import { BottomNav } from "@/components/BottomNav";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { HeaderActions, MobileHeader } from "@/components/MobileHeader";
import { getMyCustomerProfile } from "@/actions/customer";
import { getMyCustomerNotificationSummary } from "@/actions/notifications";
import { CustomerRealtimeProvider } from "@/components/CustomerRealtimeProvider";
import type { ReactNode } from "react";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [profile, notificationSummary] = await Promise.all([
    getMyCustomerProfile(),
    getMyCustomerNotificationSummary(),
  ]);

  return (
    <CustomerRealtimeProvider customerId={profile?.id ?? null}>
      <div className="flex min-h-screen" style={{ backgroundColor: "#F4F7FB" }}>
        <DesktopSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader notificationSummary={notificationSummary} profile={profile} />

          <header
            className="sticky top-0 z-30 hidden border-b bg-white/92 px-7 py-4 backdrop-blur md:flex md:items-center md:justify-end"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="rounded-full border px-4 py-2 text-sm font-black"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-primary)",
                }}
              >
                {profile?.name ?? "Veele Services"}
              </div>
              <HeaderActions notificationSummary={notificationSummary} profile={profile} tone="light" />
            </div>
          </header>

          <main className="min-w-0 flex-1 pb-[calc(4.8rem+var(--safe-bottom))] md:pb-0">
            <div className="w-full px-0 md:px-7 md:py-7">
              {children}
            </div>
          </main>

          <BottomNav />
        </div>
      </div>
    </CustomerRealtimeProvider>
  );
}
