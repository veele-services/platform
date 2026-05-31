import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getDashboardCounts } from "@/app/actions/assignments";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const canRead = await hasPermission("dashboard", "read");
  if (!canRead) return <ForbiddenPage resource="dashboard" action="read" />;

  const canReadAssignments = await hasPermission("assignments", "read");

  // Live counts — fall back to "—" if assignments table is not yet migrated
  let counts = { requested: 0, plannable: 0, inProgress: 0, completedToday: 0 };
  if (canReadAssignments) {
    try {
      counts = await getDashboardCounts();
    } catch {
      // Migration not yet run — table doesn't exist
    }
  }

  const STAT_CARDS = [
    {
      label:  "Nieuwe aanvragen",
      value:  canReadAssignments ? String(counts.requested)      : "—",
      accent: "#3B82F6",
      href:   "/assignments?status=requested",
    },
    {
      label:  "Inplanbaar",
      value:  canReadAssignments ? String(counts.plannable)      : "—",
      accent: "#F59E0B",
      href:   "/assignments?status=plannable",
    },
    {
      label:  "In uitvoering",
      value:  canReadAssignments ? String(counts.inProgress)     : "—",
      accent: "#8B5CF6",
      href:   "/assignments?status=in_progress",
    },
    {
      label:  "Vandaag afgerond",
      value:  canReadAssignments ? String(counts.completedToday) : "—",
      accent: "#22C55E",
      href:   "/assignments?status=completed",
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Dashboard
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Overzicht van uw activiteiten
        </p>
      </div>

      {/* Live stat cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4 mb-8">
        {STAT_CARDS.map(({ label, value, accent, href }) => (
          <Link
            key={label}
            href={canReadAssignments ? href : "#"}
            className="veele-card flex flex-col gap-1 transition-shadow hover:shadow-md"
          >
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
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Recent assignments */}
        <div className="veele-card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-base font-semibold" style={{ color: "#081D3A" }}>
              Recente opdrachten
            </h2>
            {canReadAssignments && (
              <Link
                href="/assignments"
                className="text-xs font-medium hover:underline"
                style={{ color: "#00B7B3" }}
              >
                Alle opdrachten →
              </Link>
            )}
          </div>
          {canReadAssignments ? (
            <RecentAssignments />
          ) : (
            <p className="text-sm" style={{ color: "#64748B" }}>
              Geen toegang tot opdrachten.
            </p>
          )}
        </div>

        {/* Quick links */}
        <div className="veele-card">
          <h2 className="font-heading text-base font-semibold mb-4" style={{ color: "#081D3A" }}>
            Snelle navigatie
          </h2>
          <nav className="flex flex-col gap-1">
            {[
              { href: "/assignments",          label: "Opdrachten" },
              { href: "/planning",             label: "Planning" },
              { href: "/customers",            label: "Klanten" },
              { href: "/objects",              label: "Objecten" },
              { href: "/personnel",            label: "Personeel" },
              { href: "/settings/task-codes",  label: "Taakcodes" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center justify-between px-3 py-2 rounded text-sm transition-colors hover:bg-slate-50"
                style={{ color: "#374151" }}
              >
                {label}
                <span style={{ color: "#94A3B8" }}>→</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

// ── Recent assignments server sub-component ───────────────────────────────────

import { listAssignments } from "@/app/actions/assignments";
import { AssignmentStatusBadge } from "@/components/assignments/AssignmentStatusBadge";

async function RecentAssignments() {
  try {
    const { rows } = await listAssignments({ page: 1, sort: "createdAt", dir: "desc" });
    const recent = rows.slice(0, 6);

    if (recent.length === 0) {
      return (
        <p className="text-sm" style={{ color: "#64748B" }}>
          Nog geen opdrachten aangemaakt. Maak een{" "}
          <Link href="/assignments" className="underline" style={{ color: "#00B7B3" }}>
            eerste opdracht
          </Link>{" "}
          aan om te beginnen.
        </p>
      );
    }

    return (
      <ul className="divide-y" style={{ borderColor: "#F1F5F9" }}>
        {recent.map((a) => (
          <li key={a.id} className="flex items-center justify-between py-2.5 gap-3">
            <div className="min-w-0 flex-1">
              <Link
                href={`/assignments/${a.id}`}
                className="text-sm font-medium hover:underline truncate block"
                style={{ color: "#081D3A" }}
              >
                {a.title}
              </Link>
              <p className="text-xs mt-0.5 truncate" style={{ color: "#94A3B8" }}>
                {a.customerName}
                {a.scheduledDate && ` · ${new Date(a.scheduledDate + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}`}
              </p>
            </div>
            <AssignmentStatusBadge status={a.status} />
          </li>
        ))}
      </ul>
    );
  } catch {
    return (
      <p className="text-sm" style={{ color: "#64748B" }}>
        Opdrachtgegevens nog niet beschikbaar. Voer eerst de databasemigratie uit.
      </p>
    );
  }
}
