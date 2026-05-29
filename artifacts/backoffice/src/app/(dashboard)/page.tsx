import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";

export const metadata: Metadata = {
  title: "Dashboard",
};

const STAT_CARDS = [
  { label: "New Requests",    value: "—", accent: "#3B82F6" },
  { label: "Plannable",       value: "—", accent: "#F59E0B" },
  { label: "In Progress",     value: "—", accent: "#8B5CF6" },
  { label: "Completed Today", value: "—", accent: "#22C55E" },
];

export default async function DashboardPage() {
  if (!(await hasPermission("dashboard", "read"))) {
    return <ForbiddenPage resource="dashboard" action="read" />;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Dashboard
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Overview of your operations
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4 mb-8">
        {STAT_CARDS.map(({ label, value, accent }) => (
          <div key={label} className="veele-card flex flex-col gap-1">
            <span
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: "#64748B" }}
            >
              {label}
            </span>
            <span
              className="font-heading text-3xl font-bold mt-1"
              style={{ color: accent }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="veele-card lg:col-span-2">
          <h2 className="font-heading text-base font-semibold mb-4" style={{ color: "#081D3A" }}>
            Recent Assignments
          </h2>
          <p className="text-sm" style={{ color: "#64748B" }}>
            Assignment data will be available after Sprint 2.
          </p>
        </div>
        <div className="veele-card">
          <h2 className="font-heading text-base font-semibold mb-4" style={{ color: "#081D3A" }}>
            Upcoming Tasks
          </h2>
          <p className="text-sm" style={{ color: "#64748B" }}>
            Task data will be available after Sprint 2.
          </p>
        </div>
      </div>
    </div>
  );
}
