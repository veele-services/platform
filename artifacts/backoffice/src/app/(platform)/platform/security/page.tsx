import Link from "next/link";
import {
  listPlatformSecurityDashboard,
  type PlatformSecurityEventRow,
} from "@/app/actions/platform";

export const metadata = {
  title: "Securitydashboard",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function metadataLabel(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "-";

  const grantType = typeof metadata["grantType"] === "string" ? metadata["grantType"] : null;
  const ttlMinutes = typeof metadata["ttlMinutes"] === "number" ? metadata["ttlMinutes"] : null;
  const maxTtlMinutes = typeof metadata["maxTtlMinutes"] === "number" ? metadata["maxTtlMinutes"] : null;

  if (grantType && ttlMinutes !== null) {
    return `${grantType} · ${ttlMinutes}m${maxTtlMinutes !== null ? ` / max ${maxTtlMinutes}m` : ""}`;
  }

  if (grantType) return grantType;
  return JSON.stringify(metadata).slice(0, 120);
}

function EventTable({
  title,
  helper,
  events,
}: {
  title: string;
  helper: string;
  events: PlatformSecurityEventRow[];
}) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{helper}</p>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{events.length}</span>
      </div>

      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Tenant</th>
              <th className="px-3 py-2 font-semibold">Actie</th>
              <th className="px-3 py-2 font-semibold">Resource</th>
              <th className="px-3 py-2 font-semibold">Context</th>
              <th className="px-3 py-2 font-semibold">Tijd</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-950">{event.tenantName}</td>
                <td className="px-3 py-2 text-slate-700">{event.action}</td>
                <td className="px-3 py-2 text-slate-600">{event.resource ?? "-"}</td>
                <td className="max-w-80 truncate px-3 py-2 text-slate-600">{metadataLabel(event.metadata)}</td>
                <td className="px-3 py-2 text-slate-600">{formatDate(event.createdAt)}</td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                  Geen events gevonden in de huidige auditbasis.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function PlatformSecurityPage() {
  const dashboard = await listPlatformSecurityDashboard();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-5">
          <Link href="/platform" className="text-sm text-slate-500 underline-offset-2 hover:underline">
            Platformbeheer
          </Link>
          <div>
            <p className="text-sm font-medium text-slate-500">Fieldgrid security</p>
            <h1 className="text-3xl font-semibold tracking-normal">Securitydashboard</h1>
            <p className="mt-1 text-sm text-slate-500">
              Read-only overzicht van support access, downloads, denials en platformwijzigingen op basis van bestaande auditregels.
            </p>
            <p className="mt-2 text-xs text-slate-400">Gegenereerd: {formatDate(dashboard.generatedAt)}</p>
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase text-slate-500">Support access events</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{dashboard.supportEvents.length}</p>
          </div>
          <div className="rounded border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase text-slate-500">Downloads</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{dashboard.downloadEvents.length}</p>
          </div>
          <div className="rounded border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase text-slate-500">Denials</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{dashboard.denialEvents.length}</p>
          </div>
          <div className="rounded border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase text-slate-500">Platform changes</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{dashboard.platformEvents.length}</p>
          </div>
        </div>

        <EventTable
          title="Support access events"
          helper="Grant-aanmaak, revoke, supportmodus en support-checks. Nieuwe grants krijgen het break-glass risk label in metadata."
          events={dashboard.supportEvents}
        />
        <EventTable
          title="Downloads"
          helper="Download-, PDF- en signed URL-events zodra die door de auditbasis worden geschreven."
          events={dashboard.downloadEvents}
        />
        <EventTable
          title="Denials"
          helper="Geweigerde acties zoals support-denials, direct-ID, expired grants en path guessing waar gelogd."
          events={dashboard.denialEvents}
        />
        <EventTable
          title="Platform changes"
          helper="Platform- en tenantwijzigingen die via de support/platform audit beschikbaar zijn."
          events={dashboard.platformEvents}
        />
      </div>
    </main>
  );
}
