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
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <CalendarClock style={{ width: "22px", height: "22px", color: "#00B7B3" }} />
          <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
            Verlof-inbox
          </h1>
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
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Verlofaanvragen van medewerkers die wachten op goedkeuring
        </p>
      </div>

      <VerlofInboxView initialRequests={requests} />
    </div>
  );
}
