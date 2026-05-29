import type { Metadata } from "next";
import { Calendar } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";

export const metadata: Metadata = {
  title: "Planning",
};

export default async function PlanningPage() {
  if (!(await hasPermission("planning", "read"))) {
    return <ForbiddenPage resource="planning" action="read" />;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Planning
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Schedule and manage field assignments
        </p>
      </div>
      <div className="veele-card flex flex-col items-center justify-center py-16 gap-4">
        <Calendar className="w-12 h-12" style={{ color: "#00B7B3" }} strokeWidth={1.5} />
        <p className="font-heading text-base font-semibold" style={{ color: "#081D3A" }}>
          Planning Board
        </p>
        <p className="text-sm text-center max-w-xs" style={{ color: "#64748B" }}>
          The planning module will be built in Sprint 3. Assignments must exist first.
        </p>
      </div>
    </div>
  );
}
