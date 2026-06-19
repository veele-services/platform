export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserPermissions, getUserRoles } from "@/lib/auth/permissions";
import { PermissionsProvider } from "@/providers/permissions-provider";
import { SidebarProvider } from "@/providers/sidebar-provider";
import { Sidebar } from "@/components/layout/Sidebar";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { SidebarOverlay } from "@/components/layout/SidebarOverlay";
import { getPendingReportsCount } from "@/app/actions/reports";
import { getOutstandingInvoicesCount } from "@/app/actions/invoices";
import { getPendingQuotesCount } from "@/app/actions/quotes";
import { getPendingLeaveCount } from "@/app/actions/availability";

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

  const [permissions, roles] = await Promise.all([
    getCurrentUserPermissions(),
    getUserRoles(user.id),
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
    <PermissionsProvider permissions={[...permissions]}>
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
            />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </div>
      </SidebarProvider>
    </PermissionsProvider>
  );
}
