import Link from "next/link";
import {
  getPlatformStagingSmokeDashboard,
  type PlatformSmokeCheck,
  type PlatformSmokeStatus,
} from "@/app/actions/platform-smoke";

export const metadata = {
  title: "Staging smoke",
};

const STATUS_LABELS: Record<PlatformSmokeStatus, string> = {
  ok: "Groen",
  warning: "Aandacht",
  blocked: "Blokkerend",
  manual: "Handmatig",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: PlatformSmokeStatus): string {
  switch (status) {
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "blocked":
      return "border-red-200 bg-red-50 text-red-900";
    case "manual":
      return "border-sky-200 bg-sky-50 text-sky-900";
  }
}

function statusDotClass(status: PlatformSmokeStatus): string {
  switch (status) {
    case "ok":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "blocked":
      return "bg-red-500";
    case "manual":
      return "bg-sky-500";
  }
}

function CheckCard({ check, required }: { check: PlatformSmokeCheck; required: boolean }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(check.status)}`} />
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">{check.label}</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">{check.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {required && <span className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600">Minimum green</span>}
          <span className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(check.status)}`}>{STATUS_LABELS[check.status]}</span>
        </div>
      </div>
      <p className="text-sm text-slate-600">{check.detail}</p>
      <p className="mt-3 text-sm font-medium text-slate-800">Volgende actie</p>
      <p className="mt-1 text-sm text-slate-600">{check.nextAction}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {check.testIds.map((testId) => (
          <span key={testId} className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
            {testId}
          </span>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

export default async function PlatformStagingSmokePage() {
  const dashboard = await getPlatformStagingSmokeDashboard();
  const requiredChecks = new Set(dashboard.minimumGreen);
  const blockingChecks = dashboard.checks.filter((check) => check.status === "blocked").length;
  const warningChecks = dashboard.checks.filter((check) => check.status === "warning").length;
  const okChecks = dashboard.checks.filter((check) => check.status === "ok").length;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-5">
          <Link href="/platform" className="text-sm text-slate-500 underline-offset-2 hover:underline">
            Platformbeheer
          </Link>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Fieldgrid operatie</p>
              <h1 className="text-3xl font-semibold tracking-normal">Staging smoke dashboard</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                Read-only acceptatieoverzicht voor host, login, modules, sectoren, storage, PDF/downloads, migraties, support grants en audit.
              </p>
              <p className="mt-2 text-xs text-slate-400">Gegenereerd: {formatDate(dashboard.generatedAt)}</p>
            </div>
            <Link
              href="/api/platform/staging-smoke"
              className="w-fit rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              JSON smoke API
            </Link>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <Stat label="Groene checks" value={okChecks} />
          <Stat label="Aandacht" value={warningChecks} />
          <Stat label="Blokkerend" value={blockingChecks} />
          <Stat label="Demo tenants" value={`${dashboard.totals.demoTenants}/3`} />
        </section>

        <section className="rounded border border-slate-200 bg-white p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">Platformhost</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{dashboard.environment.platformHost}</p>
              <p className="text-xs text-slate-500">{dashboard.environment.platformHostKnown ? "Bekend als platformhost" : "Niet herkend als platformhost"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">Staginghost</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{dashboard.environment.stagingHost}</p>
              <p className="text-xs text-slate-500">{dashboard.environment.stagingHostKnown ? "Bekend als platformhost" : "Niet herkend als platformhost"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">Tenantdomeinen</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{dashboard.totals.verifiedTenantDomains}/{dashboard.totals.tenantDomains} verified</p>
              <p className="text-xs text-slate-500">Host-first smokebasis voor Tenant A/B/Veele.</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">Migration history</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{dashboard.totals.migrationHistoryTables}/2 tabellen</p>
              <p className="text-xs text-slate-500">Drizzle en SQL migration history aanwezig.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <Stat label="Actieve tenants" value={`${dashboard.totals.activeTenants}/${dashboard.totals.tenants}`} />
          <Stat label="Actieve modules" value={dashboard.totals.enabledTenantModules} />
          <Stat label="Actieve sectoren" value={dashboard.totals.tenantSectors} />
          <Stat label="Support audit" value={dashboard.totals.supportAuditEvents} />
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          {dashboard.checks.map((check) => (
            <CheckCard key={check.id} check={check} required={requiredChecks.has(check.id)} />
          ))}
        </div>

        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Operationele bronnen</h2>
          <p className="mt-1 text-sm text-slate-500">
            Gebruik deze playbooks samen met het dashboard voordat `main` naar staging of een eerste externe tenant gaat.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {dashboard.playbooks.map((playbook) => (
              <span key={playbook} className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                {playbook}
              </span>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
