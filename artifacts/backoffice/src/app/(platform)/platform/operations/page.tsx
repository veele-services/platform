import Link from "next/link";
import {
  getPlatformOperationsDashboard,
  requestPlatformOperationsRerun,
  type PlatformOperationsDeployment,
  type PlatformOperationsHealthCheck,
  type PlatformOperationsManualRun,
} from "@/app/actions/platform-operations";
import type {
  PlatformFinalExternalTenantGate,
  PlatformMigrationSmokeStatus,
  PlatformSmokeRunHistoryEntry,
  PlatformSmokeStatus,
} from "@/app/actions/platform-smoke.types";

export const metadata = {
  title: "Operations",
};

const STATUS_LABELS: Record<PlatformSmokeStatus, string> = {
  ok: "Groen",
  warning: "Aandacht",
  blocked: "Blokkerend",
  manual: "Handmatig",
};

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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function Stat({ label, value, status }: { label: string; value: string | number; status?: PlatformSmokeStatus }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold text-slate-950">{value}</p>
        {status && <span className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(status)}`}>{STATUS_LABELS[status]}</span>}
      </div>
    </div>
  );
}

function DeploymentPanel({ deployment }: { deployment: PlatformOperationsDeployment }) {
  const rows = [
    ["Omgeving", deployment.environment],
    ["App URL", deployment.appUrl],
    ["Site URL", deployment.siteUrl],
    ["Backoffice service", deployment.backofficeService],
    ["API service", deployment.apiService],
    ["Klant service", deployment.klantService],
    ["Personeel service", deployment.personeelService],
    ["Poorten", [deployment.backofficePort, deployment.apiPort, deployment.klantPort, deployment.personeelPort].filter(Boolean).join(" / ") || null],
  ] as const;

  return (
    <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold tracking-normal text-slate-950">Deployment</h2>
      <p className="mt-1 text-sm text-slate-500">Runtimeconfiguratie zonder secrets. Ontbrekende waarden verklaren vaak healthchecks in handmatige status.</p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded bg-slate-50 px-3 py-2">
            <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
            <dd className="mt-1 break-words font-medium text-slate-950">{value ?? "Niet geconfigureerd"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function HealthCard({ check }: { check: PlatformOperationsHealthCheck }) {
  return (
    <article className="rounded border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">{check.category}</p>
          <h3 className="mt-1 text-base font-semibold tracking-normal text-slate-950">{check.label}</h3>
        </div>
        <span className={`w-fit rounded border px-2 py-1 text-xs font-semibold ${statusClass(check.status)}`}>{STATUS_LABELS[check.status]}</span>
      </div>
      <p className="mt-3 text-sm text-slate-700">{check.summary}</p>
      <p className="mt-2 text-sm text-slate-500">{check.detail}</p>
      <dl className="mt-4 grid gap-2 text-xs text-slate-600">
        <div className="flex justify-between gap-3 rounded bg-slate-50 px-3 py-2">
          <dt>Endpoint</dt>
          <dd className="break-all text-right font-medium text-slate-900">{check.endpoint ?? "n.v.t."}</dd>
        </div>
        <div className="flex justify-between gap-3 rounded bg-slate-50 px-3 py-2">
          <dt>Laatste check</dt>
          <dd className="text-right font-medium text-slate-900">{formatDate(check.lastCheckedAt)}</dd>
        </div>
        <div className="flex justify-between gap-3 rounded bg-slate-50 px-3 py-2">
          <dt>Responstijd</dt>
          <dd className="text-right font-medium text-slate-900">{check.responseMs === null ? "-" : `${check.responseMs}ms`}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm font-medium text-slate-800">Volgende actie</p>
      <p className="mt-1 text-sm text-slate-600">{check.nextAction}</p>
    </article>
  );
}

function RunHistoryCard({ run }: { run: PlatformSmokeRunHistoryEntry }) {
  return (
    <article className="rounded border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">{run.kind}</p>
          <h3 className="mt-1 font-semibold text-slate-950">{run.label}</h3>
        </div>
        <span className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(run.status)}`}>{STATUS_LABELS[run.status]}</span>
      </div>
      <p className="mt-2 text-sm text-slate-600">{run.summary}</p>
      <p className="mt-2 text-xs text-slate-500">{formatDate(run.finishedAt)} / cleanup: {run.cleanup}</p>
      {run.artifactPath && <p className="mt-1 break-all text-xs font-medium text-slate-700">{run.artifactPath}</p>}
    </article>
  );
}

function ManualRunCard({ run }: { run: PlatformOperationsManualRun }) {
  return (
    <article className="rounded border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">{run.environment}</p>
          <h3 className="mt-1 font-semibold text-slate-950">{run.label}</h3>
        </div>
        <span className={`w-fit rounded border px-2 py-1 text-xs font-semibold ${statusClass(run.status)}`}>{STATUS_LABELS[run.status]}</span>
      </div>
      <p className="mt-3 break-words rounded bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">{run.command}</p>
      <p className="mt-3 text-sm text-slate-600">{run.nextAction}</p>
      <p className="mt-2 text-xs font-medium text-slate-500">{run.cleanupContract}</p>
      {run.latestRun && <p className="mt-2 text-xs text-slate-500">Laatste run: {formatDate(run.latestRun.finishedAt)} / {run.latestRun.status}</p>}
      <form action={requestPlatformOperationsRerun} className="mt-4">
        <input type="hidden" name="runId" value={run.id} />
        <input type="hidden" name="command" value={run.command} />
        <input type="hidden" name="cleanupContract" value={run.cleanupContract} />
        <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          Rerun aanvragen
        </button>
      </form>
    </article>
  );
}

function MigrationSmokePanel({ migrationSmoke }: { migrationSmoke: PlatformMigrationSmokeStatus }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Migration smoke status</h2>
          <p className="mt-1 text-sm text-slate-500">{migrationSmoke.nextAction}</p>
        </div>
        <span className={`w-fit rounded border px-2 py-1 text-xs font-semibold ${statusClass(migrationSmoke.status)}`}>{STATUS_LABELS[migrationSmoke.status]}</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {migrationSmoke.targets.map((target) => (
          <div key={target.id} className="rounded border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-950">{target.label}</h3>
              <span className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(target.status)}`}>{STATUS_LABELS[target.status]}</span>
            </div>
            <p className="mt-2 break-all text-xs text-slate-500">{target.requiredSecret}</p>
            <p className="mt-1 break-all text-xs text-slate-500">{target.confirmVar}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 break-words text-sm font-medium text-slate-800">{migrationSmoke.command}</p>
      <p className="mt-1 text-sm text-slate-500">Rapportmap: {migrationSmoke.reportDirectory}</p>
    </section>
  );
}

function FinalGatePanel({ gate }: { gate: PlatformFinalExternalTenantGate }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Final external tenant gate</h2>
          <p className="mt-1 text-sm text-slate-500">{gate.summary}</p>
          <p className="mt-2 text-sm font-medium text-slate-800">{gate.command}</p>
          <p className="mt-1 text-xs text-slate-500">{gate.checklist} / {gate.reportDirectory}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600">{gate.decision}</span>
          <span className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(gate.status)}`}>{STATUS_LABELS[gate.status]}</span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-5">
        {gate.requirements.map((requirement) => (
          <div key={requirement.id} className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-950">{requirement.label}</p>
              <span className={`shrink-0 rounded border px-2 py-1 text-xs font-semibold ${statusClass(requirement.status)}`}>{STATUS_LABELS[requirement.status]}</span>
            </div>
            <p className="mt-2 text-xs text-slate-600">{requirement.nextAction}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function PlatformOperationsPage() {
  const dashboard = await getPlatformOperationsDashboard();
  const smoke = dashboard.stagingSmoke;
  const liveReadyChecks = smoke.liveSmokes.filter((check) => check.status === "ok").length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/platform" className="text-sm text-slate-500 underline-offset-2 hover:underline">
              Platformbeheer
            </Link>
            <p className="mt-4 text-sm font-medium text-slate-500">Fieldgrid operations</p>
            <h1 className="text-3xl font-semibold tracking-normal">Operations en staging smoke</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Live zicht op deployment, healthchecks, migration smoke, run history en final gates zonder terminal.
            </p>
            <p className="mt-2 text-xs text-slate-400">Gegenereerd: {formatDate(dashboard.generatedAt)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/api/platform/operations" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              JSON operations API
            </Link>
            <Link href="/platform/staging-smoke" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              Staging smoke detail
            </Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Operations status" value={STATUS_LABELS[dashboard.status]} status={dashboard.status} />
          <Stat label="Health groen" value={dashboard.healthChecks.filter((check) => check.status === "ok").length} />
          <Stat label="Blokkerend" value={dashboard.summary.blocked} status={dashboard.summary.blocked > 0 ? "blocked" : "ok"} />
          <Stat label="Migration smoke" value={STATUS_LABELS[smoke.migrationSmoke.status]} status={smoke.migrationSmoke.status} />
          <Stat label="Live smokes" value={`${liveReadyChecks}/${smoke.liveSmokes.length}`} />
        </section>

        <DeploymentPanel deployment={dashboard.deployment} />

        <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Healthchecks</h2>
          <p className="mt-1 text-sm text-slate-500">
            Backoffice, API, klant-PWA, personeel-PWA, database, storage en mail met timestamp en herstelactie.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {dashboard.healthChecks.map((check) => <HealthCard key={check.id} check={check} />)}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Run history</h2>
            <p className="mt-1 text-sm text-slate-500">
              Laatste dashboard-, staging-smoke- en migration-smoke runs. Artifacts uit `artifacts/staging-smoke` en `artifacts/migration-smoke` verschijnen automatisch.
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {smoke.runHistory.map((run) => <RunHistoryCard key={run.id} run={run} />)}
            </div>
          </section>

          <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Handmatige rerun</h2>
            <p className="mt-1 text-sm text-slate-500">
              De knop registreert een auditbare run-aanvraag met opdracht en cleanup-contract. Uitvoering blijft bewust expliciet.
            </p>
            <div className="mt-4 grid gap-3">
              {dashboard.manualRuns.map((run) => <ManualRunCard key={run.id} run={run} />)}
            </div>
          </section>
        </div>

        <MigrationSmokePanel migrationSmoke={smoke.migrationSmoke} />
        <FinalGatePanel gate={smoke.finalExternalTenantGate} />

        <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Staging smoke checks</h2>
          <p className="mt-1 text-sm text-slate-500">
            Minimum green contract: {smoke.minimumGreen.join(", ")}.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {smoke.checks.map((check) => (
              <article key={check.id} className="rounded border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-slate-950">{check.label}</h3>
                  <span className={`shrink-0 rounded border px-2 py-1 text-xs font-semibold ${statusClass(check.status)}`}>{STATUS_LABELS[check.status]}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{check.summary}</p>
                <p className="mt-2 text-xs text-slate-500">{check.nextAction}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
