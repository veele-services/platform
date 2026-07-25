import type { CustomerHistoryEntry } from "@/app/actions/customers";

const ACTION_LABELS: Record<string, string> = {
  create: "Aangemaakt",
  update: "Bijgewerkt",
  delete: "Verwijderd",
  activate: "Geactiveerd",
  deactivate: "Gedeactiveerd",
  status_change: "Status gewijzigd",
  lifecycle_status_change: "Lifecycle gewijzigd",
  bulk_activate: "Bulk geactiveerd",
  bulk_deactivate: "Bulk gedeactiveerd",
};

function formatMetadata(metadata: unknown): { key: string; value: string }[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];

  return Object.entries(metadata as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 4)
    .map(([key, value]) => ({
      key,
      value: typeof value === "object" ? JSON.stringify(value) : String(value),
    }));
}

interface Props {
  history: CustomerHistoryEntry[];
}

export function CustomerHistoryTab({ history }: Props) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm" style={{ color: "#64748B" }}>
          {history.length} gebeurtenis{history.length !== 1 ? "sen" : ""} (laatste 25)
        </p>
      </div>

      <div className="veele-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Actie</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Door</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Datum</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-sm" style={{ color: "#94A3B8" }}>
                    Nog geen klantgeschiedenis gevonden.
                  </td>
                </tr>
              ) : (
                history.map((entry, i) => {
                  const metadata = formatMetadata(entry.metadata);
                  return (
                    <tr
                      key={entry.id}
                      className="transition-colors hover:bg-slate-50/60"
                      style={{ borderBottom: i < history.length - 1 ? "1px solid #F1F5F9" : undefined }}
                    >
                      <td className="px-5 py-3">
                        <div className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
                          {ACTION_LABELS[entry.action] ?? entry.action}
                        </div>
                        <div className="text-xs font-mono mt-0.5" style={{ color: "#94A3B8" }}>
                          {entry.resource}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="text-sm" style={{ color: "#475569" }}>{entry.actorName}</div>
                        {entry.actorEmail && (
                          <div className="text-xs" style={{ color: "#94A3B8" }}>{entry.actorEmail}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>
                        {new Date(entry.createdAt).toLocaleString("nl-NL", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-3">
                        {metadata.length === 0 ? (
                          <span className="text-sm" style={{ color: "#94A3B8" }}>-</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {metadata.map((item) => (
                              <span
                                key={item.key}
                                className="inline-flex max-w-xs items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                                style={{ backgroundColor: "#F8FAFC", color: "#64748B" }}
                                title={`${item.key}: ${item.value}`}
                              >
                                <span className="font-medium">{item.key}</span>
                                <span className="truncate">{item.value}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
