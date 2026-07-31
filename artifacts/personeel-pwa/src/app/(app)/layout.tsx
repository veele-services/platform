import { getMyTicketSummary } from "@/actions/messages";
import { getMyNotificationSummary } from "@/actions/notifications";
import { getMyPersonnel } from "@/actions/personnel";
import { personnelOnboardingRequiredForCurrentMembership } from "@/actions/onboarding";
import { dismissPersonnelReleaseHighlight, getPersonnelReleaseHighlight } from "@/actions/releases";
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
import type { ReleaseHighlightSummary } from "@workspace/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";

function ReleaseHighlightBanner({ highlight }: { highlight: ReleaseHighlightSummary | null }) {
  if (!highlight) return null;

  return (
    <div className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950 md:mx-5 lg:mx-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{highlight.title}</p>
          <p className="mt-1 text-sm leading-5 text-amber-900">{highlight.message}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href={`/releases/${highlight.releaseSlug}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-950"
          >
            Lees meer
          </Link>
          <form action={dismissPersonnelReleaseHighlight}>
            <input type="hidden" name="highlightId" value={highlight.id} />
            <button
              type="submit"
              className="min-h-11 rounded-lg border border-amber-200 px-3 py-2 text-xs font-medium text-amber-900"
            >
              Sluiten
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenantId = await requireCurrentPersonnelPortalTenantId();
  if (!tenantId) {
    redirect(
      "/login?error=" +
        encodeURIComponent("De personeelsapp is niet beschikbaar voor deze organisatie."),
    );
  }
  const [
    branding,
    notificationSummary,
    ticketSummary,
    personnel,
    documentsEnabled,
    notificationsEnabled,
    knowledgebaseEnabled,
    releasesEnabled,
  ] = await Promise.all([
    getTenantBranding(tenantId),
    getMyNotificationSummary(),
    getMyTicketSummary(),
    getMyPersonnel(),
    isTenantModuleEnabled(tenantId, "documents"),
    isTenantModuleEnabled(tenantId, "notifications"),
    isTenantModuleEnabled(tenantId, "knowledgebase"),
    isTenantModuleEnabled(tenantId, "releases"),
  ]);

  if (!personnel) {
    redirect(
      "/login?error=" +
        encodeURIComponent("Log in om de personeelsapp te gebruiken."),
    );
  }
  if (await personnelOnboardingRequiredForCurrentMembership()) {
    redirect("/personeel/onboarding");
  }

  const featureFlags = {
    documents: documentsEnabled,
    notifications: notificationsEnabled,
    knowledgebase: knowledgebaseEnabled,
    releases: releasesEnabled,
  };
  const brandingStyle = getTenantBrandingCssVariables(branding) as CSSProperties;
  const releaseHighlight = releasesEnabled ? await getPersonnelReleaseHighlight() : null;

  return (
    <PersonnelRealtimeOfflineProvider personnelId={personnel.id}>
      <div
        className="flex min-h-screen w-full min-w-0 overflow-x-hidden"
        style={{ ...brandingStyle, backgroundColor: "var(--color-muted)" }}
      >
        <DesktopSidebar branding={branding} featureFlags={featureFlags} />

        <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
          <MobileHeader
            branding={branding}
            notificationSummary={notificationSummary}
            ticketSummary={ticketSummary}
          />
          <NativePushTokenSync enabled={personnel.notificationPushEnabled ?? false} />
          <ReleaseHighlightBanner highlight={releaseHighlight} />

          <main className="min-w-0 flex-1 overflow-x-hidden pb-[calc(5.2rem+var(--safe-bottom))] md:pb-0">
            <div className="mx-auto w-full min-w-0 max-w-[1200px] px-0 md:px-5 md:py-5 lg:px-6">
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
