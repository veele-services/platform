"use client";

import { useState, useMemo } from "react";
import { Search, History } from "lucide-react";
import type { AuditLogEntry } from "@/app/actions/settings";

// ─── Action label map ─────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  create:             "Aangemaakt",
  update:             "Bijgewerkt",
  delete:             "Verwijderd",
  invite:             "Uitgenodigd",
  resend_invite:      "Uitnodiging opnieuw verstuurd",
  deactivate:         "Gedeactiveerd",
  update_roles:       "Rollen gewijzigd",
  grant_permission:   "Recht verleend",
  revoke_permission:  "Recht ingetrokken",
  update_permissions: "Rechten bijgewerkt",
};

const RESOURCE_LABELS: Record<string, string> = {
  settings: "Instellingen",
  roles:    "Rollen",
  users:    "Gebruikers",
};

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  entries: AuditLogEntry[];
}

export function ActiviteitslogView({ entries }: Props) {
  const [actorFilter,  setActorFilter]  = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const filtered = useMemo(() => {
    const actor  = actorFilter.toLowerCase().trim();
    const action = actionFilter.toLowerCase().trim();
    return entries.filter((e) => {
      const actorMatch =
        !actor ||
        e.userEmail.toLowerCase().includes(actor) ||
        (e.userName?.toLowerCase() ?? "").includes(actor);
      const actionMatch =
        !action ||
        e.action.toLowerCase().includes(action) ||
        (ACTION_LABELS[e.action] ?? "").toLowerCase().includes(action);
      return actorMatch && actionMatch;
    });
  }, [entries, actorFilter, actionFilter]);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "#94A3B8" }} />
          <input
            type="text"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            placeholder="Zoek op gebruiker…"
            className="veele-input w-full pl-9 text-sm"
          />
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "#94A3B8" }} />
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="Zoek op actie…"
            className="veele-input w-full pl-9 text-sm"
          />
        </div>
        <span className="self-center text-sm" style={{ color: "#94A3B8" }}>
          {filtered.length} van {entries.length} regels
        </span>
      </div>

      {/* Table */}
      <div className="veele-card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
              {["Datum/tijd", "Gebruiker", "Actie", "Resource", "Details"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "#94A3B8" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50" style={{ borderBottom: "1px solid #F8FAFC" }}>
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "#64748B" }}>
                  {formatDateTime(e.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <div style={{ color: "#081D3A" }} className="font-medium text-sm">
                    {e.userName ?? (
                      <span style={{ color: "#94A3B8" }}>Onbekend</span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: "#94A3B8" }}>{e.userEmail}</div>
                </td>
                <td className="px-4 py-3">
                  <ActionBadge action={e.action} />
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: "#475569" }}>
                  {RESOURCE_LABELS[e.resource] ?? e.resource}
                  {e.resourceId && (
                    <span className="ml-1 text-xs font-mono" style={{ color: "#94A3B8" }}>
                      #{e.resourceId.slice(0, 8)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 max-w-xs">
                  <MetadataCell metadata={e.metadata} action={e.action} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="py-12 text-center" style={{ color: "#94A3B8" }}>
            <History className="h-8 w-8 mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-sm">
              {entries.length === 0
                ? "Nog geen activiteit vastgelegd."
                : "Geen resultaten gevonden voor deze zoekopdracht."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ACTION_BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  create:             { bg: "#D1FAE5", color: "#065F46" },
  update:             { bg: "#DBEAFE", color: "#1D4ED8" },
  update_roles:       { bg: "#DBEAFE", color: "#1D4ED8" },
  update_permissions: { bg: "#DBEAFE", color: "#1D4ED8" },
  delete:             { bg: "#FEE2E2", color: "#991B1B" },
  deactivate:         { bg: "#FEE2E2", color: "#991B1B" },
  revoke_permission:  { bg: "#FEE2E2", color: "#991B1B" },
  invite:             { bg: "#EFF6FF", color: "#1E40AF" },
  resend_invite:      { bg: "#EFF6FF", color: "#1E40AF" },
  grant_permission:   { bg: "#D1FAE5", color: "#065F46" },
};

function ActionBadge({ action }: { action: string }) {
  const style = ACTION_BADGE_STYLES[action] ?? { bg: "#F3F4F6", color: "#374151" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {ACTION_LABELS[action] ?? action}
    </span>
  );
}

function MetadataCell({
  metadata,
  action,
}: {
  metadata: Record<string, unknown> | null;
  action:   string;
}) {
  if (!metadata) return <span style={{ color: "#CBD5E1" }}>—</span>;

  // Human-readable for known patterns
  if (action === "update_roles" && Array.isArray(metadata.roleNames)) {
    const names = metadata.roleNames as string[];
    return (
      <span className="text-xs" style={{ color: "#475569" }}>
        {names.length > 0 ? names.join(", ") : <em style={{ color: "#94A3B8" }}>geen rollen</em>}
      </span>
    );
  }
  if (action === "invite" && typeof metadata.email === "string") {
    return <span className="text-xs" style={{ color: "#475569" }}>{metadata.email}</span>;
  }
  if ((action === "grant_permission" || action === "revoke_permission") && metadata.permissionId) {
    return (
      <span className="text-xs font-mono" style={{ color: "#475569" }}>
        {String(metadata.permissionId).slice(0, 8)}
      </span>
    );
  }
  if (Array.isArray(metadata.fields)) {
    return (
      <span className="text-xs" style={{ color: "#475569" }}>
        {(metadata.fields as string[]).join(", ")}
      </span>
    );
  }

  // Fallback: compact JSON
  const json = JSON.stringify(metadata);
  const truncated = json.length > 80 ? json.slice(0, 80) + "…" : json;
  return <span className="text-xs font-mono break-all" style={{ color: "#94A3B8" }}>{truncated}</span>;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("nl-NL", {
    day:   "2-digit",
    month: "2-digit",
    year:  "numeric",
  }) + " " + d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}
