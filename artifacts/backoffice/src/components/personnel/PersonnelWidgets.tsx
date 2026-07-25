import Link from "next/link";
import { Zap, Users2, Award, ArrowRight } from "lucide-react";
import type { FlexpoolRow, CapacityByRoleRow, PersonnelStats } from "@/app/actions/personnel";
import { formatPersonnelRoleName } from "@/lib/personnel-role-labels";
import {
  PERSONNEL_TYPE_LABELS,
  PERSONNEL_TYPE_COLORS,
  type PersonnelType,
} from "@/types/personnel";

// ─── Flexpool widget ──────────────────────────────────────────────────────────

function FlexpoolWidget({ rows }: { rows: FlexpoolRow[] }) {
  return (
    <div className="veele-card flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4" style={{ color: "#F59E0B" }} />
          <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
            Flexpool vandaag
          </h3>
        </div>
        <span className="text-xs" style={{ color: "#94A3B8" }}>Top 3</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: "#94A3B8" }}>
          Geen flexmedewerkers beschikbaar vandaag.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => {
            const typeLabel = r.personnelType
              ? (PERSONNEL_TYPE_LABELS[r.personnelType as PersonnelType] ?? r.personnelType)
              : null;
            const typeColor = r.personnelType
              ? PERSONNEL_TYPE_COLORS[r.personnelType as PersonnelType]
              : null;
            return (
              <Link
                key={r.id}
                href={`/personnel/${r.id}`}
                className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50"
                style={{ border: "1px solid #F1F5F9" }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      width:           "32px",
                      height:          "32px",
                      backgroundColor: "#E0FAFB",
                      color:           "#0A7E7A",
                    }}
                  >
                    {r.firstName[0]}{r.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--color-foreground)" }}>
                      {r.firstName} {r.lastName}
                    </p>
                    <p className="text-xs truncate" style={{ color: "#94A3B8" }}>
                      {formatPersonnelRoleName(r.roleName) || "—"}{r.region ? ` · ${r.region}` : ""}
                    </p>
                  </div>
                  {typeLabel && typeColor && (
                    <span
                      className="flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: typeColor.bg, color: typeColor.color }}
                    >
                      {typeLabel}
                    </span>
                  )}
                </div>
                {/* Match percentage bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-full overflow-hidden" style={{ height: "4px", backgroundColor: "#E2E8F0" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width:           `${r.matchPct}%`,
                        backgroundColor: r.matchPct >= 60 ? "#10B981" : r.matchPct >= 30 ? "#F59E0B" : "#94A3B8",
                      }}
                    />
                  </div>
                  <span className="text-xs flex-shrink-0 font-medium" style={{ color: "#64748B", minWidth: "36px", textAlign: "right" }}>
                    {r.matchPct}%
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-3 pt-3" style={{ borderTop: "1px solid #F1F5F9" }}>
        <Link
          href="/personnel?personnelType=flex"
          className="flex items-center gap-1 text-xs font-medium hover:underline"
          style={{ color: "var(--color-primary)" }}
        >
          Alle flexmedewerkers bekijken
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

// ─── Capacity by role widget ──────────────────────────────────────────────────

function CapacityWidget({ rows }: { rows: CapacityByRoleRow[] }) {
  return (
    <div className="veele-card flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Users2 className="h-4 w-4" style={{ color: "#3B5CE0" }} />
        <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
          Beschikbaarheid per functie
        </h3>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: "#94A3B8" }}>
          Geen functies met toegewezen medewerkers.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => {
            const pct = r.total > 0 ? Math.round((r.availableToday / r.total) * 100) : 0;
            return (
              <div key={r.roleId}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium truncate" style={{ color: "#475569" }}>
                    {formatPersonnelRoleName(r.roleName)}
                  </span>
                  <span className="text-xs flex-shrink-0 ml-2" style={{ color: "#94A3B8" }}>
                    {r.availableToday}/{r.total}
                  </span>
                </div>
                <div className="rounded-full overflow-hidden" style={{ height: "6px", backgroundColor: "#E2E8F0" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width:           `${pct}%`,
                      backgroundColor: pct >= 60 ? "#10B981" : pct >= 30 ? "#F59E0B" : "#EF4444",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Certificates widget ──────────────────────────────────────────────────────

function CertificatesWidget({ stats }: { stats: PersonnelStats }) {
  const hasExpiring = stats.expiringSoon > 0;
  return (
    <div className="veele-card flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Award className="h-4 w-4" style={{ color: "#3B5CE0" }} />
        <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
          Documenten &amp; certificaten
        </h3>
      </div>

      <div className="flex flex-col gap-3">
        <div
          className="flex items-center justify-between rounded-lg px-3 py-2.5"
          style={{ backgroundColor: "#D1FAE5" }}
        >
          <span className="text-sm font-medium" style={{ color: "#065F46" }}>
            Geldige certificaten
          </span>
          <span className="text-xl font-bold" style={{ color: "#065F46" }}>
            {stats.totalCertificates}
          </span>
        </div>

        <div
          className="flex items-center justify-between rounded-lg px-3 py-2.5"
          style={{ backgroundColor: hasExpiring ? "#FEE2E2" : "#F1F5F9" }}
        >
          <span className="text-sm font-medium" style={{ color: hasExpiring ? "#991B1B" : "#64748B" }}>
            Verlopen binnenkort (&lt;30 d)
          </span>
          <span className="text-xl font-bold" style={{ color: hasExpiring ? "#991B1B" : "#94A3B8" }}>
            {stats.expiringSoon}
          </span>
        </div>

        {hasExpiring && (
          <p className="text-xs" style={{ color: "#991B1B" }}>
            {stats.expiringSoon} certificaat{stats.expiringSoon !== 1 ? "en verlopen" : " verloopt"} binnen 30 dagen — controleer de profielen.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Combined export ──────────────────────────────────────────────────────────

interface PersonnelWidgetsProps {
  flexpoolRows:    FlexpoolRow[];
  capacityRows:    CapacityByRoleRow[];
  stats:           PersonnelStats;
}

export function PersonnelWidgets({ flexpoolRows, capacityRows, stats }: PersonnelWidgetsProps) {
  return (
    <div className="grid grid-cols-1 gap-5 mt-6 lg:grid-cols-3">
      <FlexpoolWidget    rows={flexpoolRows} />
      <CapacityWidget    rows={capacityRows} />
      <CertificatesWidget stats={stats} />
    </div>
  );
}
