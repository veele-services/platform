export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { Roboto } from "next/font/google";
import { backofficeRedirectPath } from "@/lib/backoffice-paths";
import type { ReleaseHighlightSummary } from "@workspace/db";
import {
  getTenantBranding,
  getTenantBrandingCssVariables,
} from "@workspace/db";
import {
  dismissTenantReleaseHighlight,
  getTenantReleaseHighlight,
} from "@/app/actions/releases";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentEffectiveUserPermissions,
  getUserRoles,
} from "@/lib/auth/permissions";
import {
  getCurrentSupportMode,
  type CurrentSupportMode,
} from "@/lib/auth/platform";
import { PermissionsProvider } from "@/providers/permissions-provider";
import { SidebarProvider } from "@/providers/sidebar-provider";
import { Sidebar } from "@/components/layout/Sidebar";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { RecentContextTracker } from "@/components/dashboard/RecentContextTracker";
import { BackofficeRealtimeProvider } from "@/components/realtime/BackofficeRealtimeProvider";
import { getPendingReportsCount } from "@/app/actions/reports";
import { getOutstandingInvoicesCount } from "@/app/actions/invoices";
import { getPendingQuotesCount } from "@/app/actions/quotes";
import { getPendingLeaveCount } from "@/app/actions/availability";
import { exitSupportMode } from "@/app/actions/platform";
import {
  getActiveBackofficeTenantsForUser,
  getCurrentTenantId,
} from "@/lib/auth/tenant";
import {
  getBackofficeProfileName,
  requiresBackofficeProfileName,
} from "@/lib/auth/backoffice-profile";
import { Suspense, type CSSProperties } from "react";

const tenantRoboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-tenant-roboto",
  display: "swap",
});

function NoActiveTenantAccess() {
  return (
    <main
      className={`${tenantRoboto.variable} tenant-admin-compact flex min-h-screen items-center justify-center bg-slate-50 px-6`}
    >
      <section className="max-w-lg rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1
          className="font-heading text-2xl font-semibold"
          style={{ color: "var(--color-foreground)" }}
        >
          Geen actieve organisatietoegang
        </h1>
        <p className="mt-3 text-sm leading-6" style={{ color: "#64748B" }}>
          Deze gebruiker heeft geen actieve organisatiekoppeling voor deze host.
          Controleer de organisatiestatus, domeinkoppeling of
          gebruikerskoppeling in platformbeheer.
        </p>
      </section>
    </main>
  );
}

function formatSupportTtl(ttlSeconds: number): string {
  if (ttlSeconds <= 0) return "verlopen";
  const minutes = Math.floor(ttlSeconds / 60);
  if (minutes < 1) return "minder dan 1 minuut";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}u ${remainingMinutes}m` : `${hours}u`;
}

function SupportModeBanner({
  supportMode,
}: {
  supportMode: CurrentSupportMode;
}) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">Supportmodus actief</p>
          <p className="mt-0.5 truncate text-xs text-amber-900">
            Organisatie {supportMode.tenantId} · TTL{" "}
            {formatSupportTtl(supportMode.ttlSeconds)} · Reden:{" "}
            {supportMode.reason}
          </p>
          <p className="mt-0.5 truncate text-xs text-amber-800">
            Auditcontext: grant {supportMode.grantId} · prioriteit{" "}
            {supportMode.priority}
          </p>
        </div>
        <form action={exitSupportMode}>
          <button
            type="submit"
            className="rounded border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-100"
          >
            Stop supportmodus
          </button>
        </form>
      </div>
    </div>
  );
}

function ReleaseHighlightBanner({
  highlight,
}: {
  highlight: ReleaseHighlightSummary | null;
}) {
  if (!highlight) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">{highlight.title}</p>
          <p className="mt-0.5 text-xs leading-5 text-amber-900">
            {highlight.message}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href={`/releases/${highlight.releaseSlug}`}
            className="rounded border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-100"
          >
            Lees meer
          </Link>
          <form action={dismissTenantReleaseHighlight}>
            <input type="hidden" name="highlightId" value={highlight.id} />
            <button
              type="submit"
              className="rounded border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              Sluiten
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(backofficeRedirectPath("/login"));
  }
  if (requiresBackofficeProfileName(user)) {
    redirect(backofficeRedirectPath("/profiel-instellen"));
  }

  const [tenantOptions, currentTenantId] = await Promise.all([
    getActiveBackofficeTenantsForUser(user.id),
    getCurrentTenantId(),
  ]);

  const tenantId = currentTenantId;
  if (!tenantId) {
    return <NoActiveTenantAccess />;
  }

  const supportMode = await getCurrentSupportMode();
  const [permissions, roles, branding] = await Promise.all([
    getCurrentEffectiveUserPermissions(),
    supportMode
      ? Promise.resolve(["Supportmodus"])
      : getUserRoles(user.id, tenantId),
    getTenantBranding(tenantId),
  ]);

  const canReadReports = permissions.has("reports:read");
  const canReadInvoices = permissions.has("invoices:read");
  const canReadQuotes = permissions.has("quotes:read");
  const canReadPersonnel = permissions.has("personnel:read");

  const canViewReleases = permissions.has("releases:view");

  const [
    pendingReportsCount,
    outstandingInvoicesCount,
    pendingQuotesCount,
    pendingLeaveCount,
    releaseHighlight,
  ] = await Promise.all([
    canReadReports ? getPendingReportsCount() : Promise.resolve(0),
    canReadInvoices ? getOutstandingInvoicesCount() : Promise.resolve(0),
    canReadQuotes ? getPendingQuotesCount() : Promise.resolve(0),
    canReadPersonnel ? getPendingLeaveCount() : Promise.resolve(0),
    canViewReleases ? getTenantReleaseHighlight() : Promise.resolve(null),
  ]);

  const userEmail = user.email ?? "";
  const userName = getBackofficeProfileName(user) ?? userEmail;
  const userInitial = (userName[0] ?? "U").toUpperCase();
  const userRole = roles[0] ?? "User";
  const brandingStyle = getTenantBrandingCssVariables(
    branding,
  ) as CSSProperties;
  return (
    <PermissionsProvider
      permissions={[...permissions]}
      tenantId={tenantId}
      principalId={user.id}
    >
      <BackofficeRealtimeProvider realtimeKey={`management_${tenantId}`}>
        <SidebarProvider>
          <div
            className={`${tenantRoboto.variable} tenant-admin-compact flex h-screen overflow-hidden`}
            style={{
              ...brandingStyle,
              backgroundColor: "var(--color-background)",
            }}
          >
            <Sidebar
              branding={{
                displayName: branding.displayName,
                logoUrl: branding.logoUrl,
                customBrandingEnabled: branding.customBrandingEnabled,
                sidebarBackgroundColor: branding.sidebarBackgroundColor,
                sidebarTextColor: branding.sidebarTextColor,
                sidebarAccentColor: branding.sidebarAccentColor,
              }}
              pendingReportsCount={pendingReportsCount}
              outstandingInvoicesCount={outstandingInvoicesCount}
              pendingQuotesCount={pendingQuotesCount}
              pendingLeaveCount={pendingLeaveCount}
            />

            <div className="flex flex-col flex-1 overflow-hidden min-w-0">
              <DashboardHeader
                userEmail={userEmail}
                userName={userName}
                userInitial={userInitial}
                userRole={userRole}
                currentTenantId={tenantId}
                tenantOptions={tenantOptions}
              />
              {supportMode && <SupportModeBanner supportMode={supportMode} />}
              <ReleaseHighlightBanner highlight={releaseHighlight} />
              <main className="flex-1 overflow-y-auto">
                <Suspense fallback={null}>
                  <RecentContextTracker />
                </Suspense>
                {children}
              </main>
            </div>
          </div>
        </SidebarProvider>
      </BackofficeRealtimeProvider>
    </PermissionsProvider>
  );
}
