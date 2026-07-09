import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { listAllPendingLeaveRequests } from "@/app/actions/availability";
import { VerlofInboxView } from "@/components/personnel/VerlofInboxView";
import { CalendarClock } from "lucide-react";

export const metadata: Metadata = {
  title: "Verlof-inbox",
};

export default async function VerlofInboxPage() {
  const canRead = await hasPermission("personnel", "read");
  if (!canRead) return <ForbiddenPage resource="personnel" action="read" />;

  const requests = await listAllPendingLeaveRequests();

  return (
    <div className="mx-auto w-full max-w-[1800px] p-6">
      <div className="mb-4 flex items-center gap-2 text-sm" style={{ color: "#64748B" }}>
        <CalendarClock style={{ width: "18px", height: "18px", color: "#00B7B3" }} />
        <span>Verlofaanvragen van medewerkers die wachten op goedkeuring</span>
        {requests.length > 0 && (
          <span
            className="flex items-center justify-center rounded-full font-semibold text-white"
            style={{
              backgroundColor: "#00B7B3",
              fontSize: "11px",
              minWidth: "22px",
              height: "22px",
              padding: "0 6px",
            }}
          >
            {requests.length}
          </span>
        )}
      </div>

      <VerlofInboxView initialRequests={requests} />
    </div>
  );
}
