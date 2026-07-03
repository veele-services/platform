import { BottomNav } from "@/components/BottomNav";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { HeaderActions, MobileHeader } from "@/components/MobileHeader";
import { getMyCustomerProfile } from "@/actions/customer";
import { getMyCustomerNotificationSummary } from "@/actions/notifications";
import { CustomerRealtimeProvider } from "@/components/CustomerRealtimeProvider";
import { requireCurrentCustomerPortalTenantId } from "@/lib/auth/tenant";
import {
  getTenantBranding,
  getTenantBrandingCssVariables,
  isTenantModuleEnabled,
} from "@workspace/db";
import { redirect } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const tenantId = await requireCurrentCustomerPortalTenantId();
  if (!tenantId) {
    redirect(
      "/login?error=" +
        encodeURIComponent("Het klantportaal is niet beschikbaar voor deze tenant."),
    );
  }

  const [
    branding,
    profile,
    notificationSummary,
    documentsEnabled,
    financeEnabled,
    reportingEnabled,
  ] = await Promise.all([
    getTenantBranding(tenantId),
    getMyCustomerProfile(),
    getMyCustomerNotificationSummary(),
    isTenantModuleEnabled(tenantId, "documents"),
    isTenantModuleEnabled(tenantId, "finance"),
    isTenantModuleEnabled(tenantId, "reporting"),
  ]);

  const featureFlags = {
    documents: documentsEnabled,
    finance: financeEnabled,
    reporting: reportingEnabled,
  };
  const brandingStyle = getTenantBrandingCssVariables(branding) as CSSProperties;

  return (
    <CustomerRealtimeProvider customerId={profile?.id ?? null}>
      <div
        className="flex min-h-screen"
        style={{ ...brandingStyle, backgroundColor: "#F4F7FB" }}
      >
        <DesktopSidebar branding={branding} featureFlags={featureFlags} />

        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader
            branding={branding}
            notificationSummary={notificationSummary}
            profile={profile}
          />

          <header
            className="sticky top-0 z-30 hidden border-b bg-white/92 px-7 py-4 backdrop-blur md:flex md:items-center md:justify-between"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div>
              <p
                className="text-xs font-black uppercase tracking-[0.16em]"
                style={{ color: "var(--color-accent)" }}
              >
                {branding.displayName}
              </p>
              <p
                className="mt-0.5 text-sm font-semibold"
                style={{ color: "var(--color-secondary)" }}
              >
                Klantportaal voor {profile?.name ?? "uw organisatie"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div
                className="rounded-full border px-4 py-2 text-sm font-black"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-primary)",
                }}
              >
                {profile?.name ?? branding.displayName}
              </div>
              <HeaderActions
                notificationSummary={notificationSummary}
                profile={profile}
                tone="light"
              />
            </div>
          </header>

          <main className="min-w-0 flex-1 pb-[calc(4.8rem+var(--safe-bottom))] md:pb-0">
            <div className="w-full px-0 md:px-7 md:py-7">{children}</div>
          </main>

          <BottomNav />
        </div>
      </div>
    </CustomerRealtimeProvider>
  );
}
