export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserPermissions, getUserRoles } from "@/lib/auth/permissions";
import { PermissionsProvider } from "@/providers/permissions-provider";
import { Sidebar } from "@/components/layout/Sidebar";
import { getPendingReportsCount } from "@/app/actions/reports";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Belt-and-suspenders: middleware already handles this redirect,
  // but Server Components must never trust implicit state.
  if (!user) {
    redirect("/login");
  }

  const [permissions, roles] = await Promise.all([
    getCurrentUserPermissions(),
    getUserRoles(user.id),
  ]);

  const canReadReports = permissions.has("reports:read");
  const pendingReportsCount = canReadReports ? await getPendingReportsCount() : 0;

  const userEmail   = user.email ?? "";
  const userInitial = (userEmail[0] ?? "U").toUpperCase();
  const userRole    = roles[0] ?? "User";

  return (
    <PermissionsProvider permissions={[...permissions]}>
      <div
        className="flex h-screen overflow-hidden"
        style={{ backgroundColor: "#F8FAFC" }}
      >
        <Sidebar
          userEmail={userEmail}
          userInitial={userInitial}
          userRole={userRole}
          pendingReportsCount={pendingReportsCount}
        />
        <div className="flex flex-col flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </PermissionsProvider>
  );
}
