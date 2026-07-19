import { BottomNav } from "@/components/BottomNav";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { HeaderActions, MobileHeader } from "@/components/MobileHeader";
import { getMyCustomerProfile } from "@/actions/customer";
import { getMyCustomerNotificationSummary } from "@/actions/notifications";
import { dismissCustomerReleaseHighlight, getCustomerReleaseHighlight } from "@/actions/releases";
import { CustomerRealtimeProvider } from "@/components/CustomerRealtimeProvider";
import { requireCurrentCustomerPortalTenantId } from "@/lib/auth/tenant";
import {
  getTenantBranding,
  getTenantBrandingCssVariables,
  isTenantModuleEnabled,
} from "@workspace/db";
import type { ReleaseHighlightSummary } from "@workspace/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

function ReleaseHighlightBanner({ highlight }: { highlight: ReleaseHighlightSummary | null }) {
  if (!highlight) return null;

  return (
    <div className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm md:mx-7">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-black">{highlight.title}</p>
          <p className="mt-1 text-sm leading-6 text-amber-900">{highlight.message}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href={`/releases/${highlight.releaseSlug}`}
            className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-950"
          >
            Lees meer
          </Link>
          <form action={dismissCustomerReleaseHighlight}>
            <input type="hidden" name="highlightId" value={highlight.id} />
            <button
              type="submit"
              className="rounded-xl border border-amber-200 px-3 py-2 text-xs font-black text-amber-900"
            >
              Sluiten
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const tenantId = await requireCurrentCustomerPortalTenantId();
  if (!tenantId) {
    redirect(
      "/login?error=" +
        encodeURIComponent("Het klantportaal is niet beschikbaar voor deze organisatie."),
    );
  }

  const [
    branding,
    profile,
    notificationSummary,
    documentsEnabled,
    financeEnabled,
    reportingEnabled,
    knowledgebaseEnabled,
    releasesEnabled,
  ] = await Promise.all([
    getTenantBranding(tenantId),
    getMyCustomerProfile(),
    getMyCustomerNotificationSummary(),
    isTenantModuleEnabled(tenantId, "documents"),
    isTenantModuleEnabled(tenantId, "finance"),
    isTenantModuleEnabled(tenantId, "reporting"),
    isTenantModuleEnabled(tenantId, "knowledgebase"),
    isTenantModuleEnabled(tenantId, "releases"),
  ]);

  const featureFlags = {
    documents: documentsEnabled,
    finance: financeEnabled,
    reporting: reportingEnabled,
    knowledgebase: knowledgebaseEnabled,
    releases: releasesEnabled,
  };
  const brandingStyle = getTenantBrandingCssVariables(branding) as CSSProperties;
  const releaseHighlight = releasesEnabled ? await getCustomerReleaseHighlight() : null;

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
                style={{ color: "var(--color-accent-accessible)" }}
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

          <ReleaseHighlightBanner highlight={releaseHighlight} />

          <main className="min-w-0 flex-1 pb-[calc(4.8rem+var(--safe-bottom))] md:pb-0">
            <div className="w-full px-0 md:px-7 md:py-7">{children}</div>
          </main>

          <BottomNav />
        </div>
      </div>
    </CustomerRealtimeProvider>
  );
}
