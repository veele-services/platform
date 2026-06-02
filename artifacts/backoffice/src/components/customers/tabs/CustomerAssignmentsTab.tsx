import Link from "next/link";
import { AssignmentHistoryTable } from "@/components/assignments/AssignmentHistoryTable";
import type { AssignmentHistoryRow } from "@/app/actions/assignments";

interface Props {
  customerId:  string;
  assignments: AssignmentHistoryRow[];
}

export function CustomerAssignmentsTab({ customerId, assignments }: Props) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm" style={{ color: "#64748B" }}>
          {assignments.length} opdracht{assignments.length !== 1 ? "en" : ""} (laatste 25)
        </p>
        <Link
          href={`/assignments?customerId=${customerId}`}
          className="text-xs font-medium hover:underline"
          style={{ color: "#00B7B3" }}
        >
          Alle bekijken →
        </Link>
      </div>
      <div className="veele-card overflow-hidden p-0">
        <AssignmentHistoryTable
          rows={assignments}
          emptyMessage="Nog geen opdrachten voor deze klant."
        />
      </div>
    </>
  );
}
