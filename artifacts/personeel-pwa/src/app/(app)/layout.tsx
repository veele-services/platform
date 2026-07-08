import { getMyTicketSummary } from "@/actions/messages";
import { getMyNotificationSummary } from "@/actions/notifications";
import { getMyPersonnel } from "@/actions/personnel";
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
    <div className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm md:mx-5 lg:mx-8">
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
          <form action={dismissPersonnelReleaseHighlight}>
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
          <NativePushTokenSync enabled={personnel.notificationPushEnabled ?? false} />
          <ReleaseHighlightBanner highlight={releaseHighlight} />

          <main className="flex-1 pb-[calc(5.2rem+var(--safe-bottom))] md:pb-0">
            <div className="mx-auto w-full max-w-[1440px] px-0 md:px-5 md:py-6 lg:px-8">
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
