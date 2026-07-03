import { getMyTicketSummary } from "@/actions/messages";
import { getMyNotificationSummary } from "@/actions/notifications";
import { getMyPersonnel } from "@/actions/personnel";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";
import { BottomNav } from "@/components/BottomNav";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { MobileHeader } from "@/components/MobileHeader";
import { NativePushTokenSync } from "@/components/NativePushTokenSync";
import { PersonnelRealtimeOfflineProvider } from "@/components/PersonnelRealtimeOfflineProvider";
import {
  getTenantBranding,
  getTenantBrandingCssVariables,
  isTenantModuleEnabled,
} from "@workspace/db";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenantId = await requireCurrentPersonnelPortalTenantId();
  if (!tenantId) {
    redirect(
      "/login?error=" +
        encodeURIComponent("De personeelsapp is niet beschikbaar voor deze tenant."),
    );
  }

  const [
    branding,
    notificationSummary,
    ticketSummary,
    personnel,
    documentsEnabled,
    notificationsEnabled,
  ] = await Promise.all([
    getTenantBranding(tenantId),
    getMyNotificationSummary(),
    getMyTicketSummary(),
    getMyPersonnel(),
    isTenantModuleEnabled(tenantId, "documents"),
    isTenantModuleEnabled(tenantId, "notifications"),
  ]);

  const featureFlags = {
    documents: documentsEnabled,
    notifications: notificationsEnabled,
  };
  const brandingStyle = getTenantBrandingCssVariables(branding) as CSSProperties;

  return (
    <PersonnelRealtimeOfflineProvider personnelId={personnel?.id ?? null}>
      <div
        className="flex min-h-screen"
        style={{ ...brandingStyle, backgroundColor: "var(--color-muted)" }}
      >
        <DesktopSidebar branding={branding} featureFlags={featureFlags} />

        <div className="flex flex-1 flex-col min-w-0">
          <MobileHeader
            branding={branding}
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
