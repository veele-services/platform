export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserPermissions, getUserRoles } from "@/lib/auth/permissions";
import { PermissionsProvider } from "@/providers/permissions-provider";
import { SidebarProvider } from "@/providers/sidebar-provider";
import { Sidebar } from "@/components/layout/Sidebar";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { SidebarOverlay } from "@/components/layout/SidebarOverlay";
import { BackofficeRealtimeProvider } from "@/components/realtime/BackofficeRealtimeProvider";
import { getPendingReportsCount } from "@/app/actions/reports";
import { getOutstandingInvoicesCount } from "@/app/actions/invoices";
import { getPendingQuotesCount } from "@/app/actions/quotes";
import { getPendingLeaveCount } from "@/app/actions/availability";
import {
  getActiveBackofficeTenantsForUser,
  getCurrentTenantId,
} from "@/lib/auth/tenant";

function NoActiveTenantAccess() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <section className="max-w-lg rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="font-heading text-2xl font-semibold" style={{ color: "#081D3A" }}>
          Geen actieve tenanttoegang
        </h1>
        <p className="mt-3 text-sm leading-6" style={{ color: "#64748B" }}>
          Deze gebruiker heeft geen actieve tenantkoppeling voor deze host. Controleer de tenantstatus,
          domeinkoppeling of gebruikerskoppeling in platform-admin.
        </p>
      </section>
    </main>
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
    redirect("/login");
  }

  const [tenantOptions, currentTenantId] = await Promise.all([
    getActiveBackofficeTenantsForUser(user.id),
    getCurrentTenantId(),
  ]);

  const tenantId = currentTenantId;
  if (!tenantId) {
    return <NoActiveTenantAccess />;
  }

  const [permissions, roles] = await Promise.all([
    getEffectiveUserPermissions(user.id, tenantId),
    getUserRoles(user.id, tenantId),
  ]);

  const canReadReports   = permissions.has("reports:read");
  const canReadInvoices  = permissions.has("invoices:read");
  const canReadQuotes    = permissions.has("quotes:read");
  const canReadPersonnel = permissions.has("personnel:read");

  const [pendingReportsCount, outstandingInvoicesCount, pendingQuotesCount, pendingLeaveCount] = await Promise.all([
    canReadReports   ? getPendingReportsCount()      : Promise.resolve(0),
    canReadInvoices  ? getOutstandingInvoicesCount() : Promise.resolve(0),
    canReadQuotes    ? getPendingQuotesCount()        : Promise.resolve(0),
    canReadPersonnel ? getPendingLeaveCount()         : Promise.resolve(0),
  ]);

  const userEmail   = user.email ?? "";
  const userInitial = (userEmail[0] ?? "U").toUpperCase();
  const userRole    = roles[0] ?? "User";

  return (
    <PermissionsProvider permissions={[...permissions]} tenantId={tenantId}>
      <BackofficeRealtimeProvider realtimeKey={`management_${tenantId}`}>
        <SidebarProvider>
          <div
            className="flex h-screen overflow-hidden"
            style={{ backgroundColor: "#F8FAFC" }}
          >
            <Sidebar
              pendingReportsCount={pendingReportsCount}
              outstandingInvoicesCount={outstandingInvoicesCount}
              pendingQuotesCount={pendingQuotesCount}
              pendingLeaveCount={pendingLeaveCount}
            />

            <SidebarOverlay />

            <div className="flex flex-col flex-1 overflow-hidden min-w-0">
              <DashboardHeader
                userEmail={userEmail}
                userInitial={userInitial}
                userRole={userRole}
                currentTenantId={tenantId}
                tenantOptions={tenantOptions}
              />
              <main className="flex-1 overflow-y-auto">{children}</main>
            </div>
          </div>
        </SidebarProvider>
      </BackofficeRealtimeProvider>
    </PermissionsProvider>
  );
}
