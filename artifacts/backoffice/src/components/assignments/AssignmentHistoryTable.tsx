import Link from "next/link";
import type { AssignmentHistoryRow } from "@/app/actions/assignments";
import { AssignmentStatusBadge } from "./AssignmentStatusBadge";

interface Props {
  rows: AssignmentHistoryRow[];
  emptyMessage?: string;
}

export function AssignmentHistoryTable({
  rows,
  emptyMessage = "Geen opdrachten gevonden.",
}: Props) {
  if (rows.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm" style={{ color: "#94A3B8" }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr style={{ borderTop: "1px solid #E2E8F0", borderBottom: "1px solid #E2E8F0" }}>
            <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
              Code
            </th>
            <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
              Titel
            </th>
            <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
              Status
            </th>
            <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
              Object
            </th>
            <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
              Datum
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id}
              className="transition-colors hover:bg-slate-50/60"
              style={{
                borderBottom: index < rows.length - 1 ? "1px solid #F1F5F9" : undefined,
              }}
            >
              <td className="px-5 py-3 text-xs font-mono" style={{ color: "#64748B" }}>
                {row.code}
              </td>
              <td className="px-5 py-3">
                <Link
                  href={`/assignments/${row.id}`}
                  className="text-sm font-medium hover:underline"
                  style={{ color: "var(--color-primary)" }}
                >
                  {row.title}
                </Link>
              </td>
              <td className="px-5 py-3">
                <AssignmentStatusBadge status={row.status} />
              </td>
              <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>
                {row.objectName ?? "-"}
              </td>
              <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>
                {row.scheduledDate
                  ? new Date(row.scheduledDate).toLocaleDateString("nl-NL", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
