import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";

export const metadata: Metadata = {
  title: "Assignments",
};

export default async function AssignmentsPage() {
  if (!(await hasPermission("assignments", "read"))) {
    return <ForbiddenPage resource="assignments" action="read" />;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Assignments
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Central entity — drives planning, reporting, and invoicing
        </p>
      </div>
      <div className="veele-card flex flex-col items-center justify-center py-16 gap-4">
        <ClipboardList className="w-12 h-12" style={{ color: "#00B7B3" }} strokeWidth={1.5} />
        <p className="font-heading text-base font-semibold" style={{ color: "#081D3A" }}>
          Assignment Management
        </p>
        <p className="text-sm text-center max-w-xs" style={{ color: "#64748B" }}>
          Assignment CRUD, lifecycle management, and task linking will be built in Sprint 2.
        </p>
      </div>
    </div>
  );
}
