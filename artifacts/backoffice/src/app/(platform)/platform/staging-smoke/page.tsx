import Link from "next/link";
import { getPlatformStagingSmokeDashboard } from "@/app/actions/platform-smoke";
import type {
  PlatformAdminReleaseGate,
  PlatformFinalExternalTenantGate,
  PlatformLiveSmokeTarget,
  PlatformMutatingSmokeCheck,
  PlatformSmokeCheck,
  PlatformSmokeRunHistoryEntry,
  PlatformSmokeStatus,
  PlatformStagingPromotionGate,
} from "@/app/actions/platform-smoke.types";

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

function CheckCard({
  check,
  required,
}: {
  check: PlatformSmokeCheck;
  required: boolean;
}) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${statusDotClass(check.status)}`}
            />
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">
              {check.label}
            </h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">{check.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {required && (
            <span className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600">
              Minimum green
            </span>
          )}
          <span
            className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(check.status)}`}
          >
            {STATUS_LABELS[check.status]}
          </span>
        </div>
      </div>
      <p className="text-sm text-slate-600">{check.detail}</p>
      <p className="mt-3 text-sm font-medium text-slate-800">Volgende actie</p>
      <p className="mt-1 text-sm text-slate-600">{check.nextAction}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {check.testIds.map((testId) => (
          <span
            key={testId}
            className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
          >
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

function RunHistoryCard({ run }: { run: PlatformSmokeRunHistoryEntry }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            {run.kind}
          </p>
          <h3 className="mt-1 font-semibold text-slate-950">{run.label}</h3>
        </div>
        <span
          className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(run.status)}`}
        >
          {STATUS_LABELS[run.status]}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600">{run.summary}</p>
      <p className="mt-2 text-xs text-slate-500">
        {formatDate(run.finishedAt)} - {run.source}
      </p>
      {run.artifactPath && (
        <p className="mt-1 text-xs font-medium text-slate-600">
          {run.artifactPath}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {run.checks.slice(0, 8).map((check) => (
          <span
            key={check}
            className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
          >
            {check}
          </span>
        ))}
      </div>
    </div>
  );
}

function LiveSmokeCard({ smoke }: { smoke: PlatformLiveSmokeTarget }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            {smoke.host}
            {smoke.route}
          </p>
          <h3 className="mt-1 font-semibold text-slate-950">{smoke.label}</h3>
        </div>
        <span
          className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(smoke.status)}`}
        >
          {STATUS_LABELS[smoke.status]}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600">{smoke.command}</p>
      <p className="mt-2 text-sm font-medium text-slate-800">Volgende actie</p>
      <p className="mt-1 text-sm text-slate-600">{smoke.nextAction}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {smoke.testIds.map((testId) => (
          <span
            key={testId}
            className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
          >
            {testId}
          </span>
        ))}
      </div>
    </div>
  );
}

function MutatingCheckCard({ check }: { check: PlatformMutatingSmokeCheck }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            {check.tenantScope}
          </p>
          <h3 className="mt-1 font-semibold text-slate-950">{check.label}</h3>
        </div>
        <span
          className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(check.status)}`}
        >
          {STATUS_LABELS[check.status]}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-sm">
        <div className="flex justify-between gap-3 rounded bg-slate-50 px-3 py-2">
          <dt className="text-slate-500">Cleanup</dt>
          <dd className="font-medium text-slate-950">{check.cleanupStatus}</dd>
        </div>
        <div className="flex justify-between gap-3 rounded bg-slate-50 px-3 py-2">
          <dt className="text-slate-500">Confirm</dt>
          <dd className="font-medium text-slate-950">{check.confirmVar}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs font-medium text-slate-600">
        {check.cleanupSelector}
      </p>
      <p className="mt-2 text-sm text-slate-600">{check.nextAction}</p>
    </div>
  );
}

function FinalGateCard({ gate }: { gate: PlatformFinalExternalTenantGate }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">
            Finale externe tenant gate
          </h2>
          <p className="mt-1 text-sm text-slate-500">{gate.summary}</p>
          <p className="mt-2 text-sm font-medium text-slate-800">
            {gate.command}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {gate.checklist} - {gate.reportDirectory}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600">
            {gate.decision}
          </span>
          <span
            className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(gate.status)}`}
          >
            {STATUS_LABELS[gate.status]}
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-5">
        {gate.requirements.map((requirement) => (
          <div
            key={requirement.id}
            className="rounded border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-950">
                {requirement.label}
              </h3>
              <span
                className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(requirement.status)}`}
              >
                {STATUS_LABELS[requirement.status]}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {requirement.evidence}
            </p>
            <p className="mt-2 text-xs font-medium text-slate-600">
              {requirement.id}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-semibold text-amber-950">
              Post-launch accepted register
            </h3>
            <p className="mt-1 text-sm text-amber-900">
              Open runtime/hardening punten blijven zichtbaar met owner,
              bewijsdoel en go/no-go eis.
            </p>
          </div>
          <span className="w-fit rounded border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-950">
            {gate.postLaunchExceptions.length} uitzonderingen
          </span>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {gate.postLaunchExceptions.map((exception) => (
            <div
              key={exception.id}
              className="rounded border border-amber-200 bg-white px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-950">
                  {exception.label}
                </p>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                  {exception.risk}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {exception.owner} - {exception.acceptedUntil}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {exception.targetEvidence}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlatformAdminReleaseGateCard({
  gate,
}: {
  gate: PlatformAdminReleaseGate;
}) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-slate-500">
            Fase 14
          </p>
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">
            Platform-admin release gate
          </h2>
          <p className="mt-1 text-sm text-slate-500">{gate.summary}</p>
          <p className="mt-2 text-sm font-medium text-slate-800">
            {gate.command}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {gate.checklist} - {gate.reportDirectory}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600">
            {gate.decision}
          </span>
          <span
            className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(gate.status)}`}
          >
            {STATUS_LABELS[gate.status]}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {gate.items.map((item) => (
          <div
            key={item.id}
            className="rounded border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase text-slate-500">
                  {item.persona} - {item.owner}
                </p>
                <h3 className="mt-1 font-semibold text-slate-950">
                  {item.label}
                </h3>
              </div>
              <span
                className={`shrink-0 rounded border px-2 py-1 text-xs font-semibold ${statusClass(item.status)}`}
              >
                {STATUS_LABELS[item.status]}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 text-xs">
              <div className="rounded bg-white px-3 py-2">
                <dt className="font-medium text-slate-500">Host en route</dt>
                <dd className="mt-1 platform-long-text text-slate-700">
                  {item.host} - {item.route}
                </dd>
              </div>
              <div className="rounded bg-white px-3 py-2">
                <dt className="font-medium text-slate-500">Command</dt>
                <dd className="mt-1 platform-long-text text-slate-700">
                  {item.command}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-slate-600">{item.evidence}</p>
            <p className="mt-2 text-sm font-medium text-slate-800">
              Volgende actie
            </p>
            <p className="mt-1 text-sm text-slate-600">{item.nextAction}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.testIds.map((testId) => (
                <span
                  key={testId}
                  className="rounded bg-white px-2 py-1 text-xs font-medium text-slate-600"
                >
                  {testId}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-950">Verplichte commands</h3>
          <div className="mt-3 grid gap-2">
            {gate.requiredCommands.map((command) => (
              <p
                key={command}
                className="platform-long-text rounded bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700"
              >
                {command}
              </p>
            ))}
          </div>
        </div>
        <div className="rounded border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold text-amber-950">
              Open uitzonderingen
            </h3>
            <span className="rounded border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-950">
              {gate.exceptions.length}
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {gate.exceptions.map((exception) => (
              <div
                key={exception.id}
                className="rounded border border-amber-200 bg-white px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">
                    {exception.label}
                  </p>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                    {exception.severity}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {exception.owner} - {exception.acceptedUntil}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {exception.targetEvidence}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StagingPromotionGateCard({
  gate,
}: {
  gate: PlatformStagingPromotionGate;
}) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-slate-500">Fase 4</p>
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">
            Staging promotion gate
          </h2>
          <p className="mt-1 text-sm text-slate-500">{gate.summary}</p>
          <p className="mt-2 text-sm font-medium text-slate-800">
            {gate.command}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {gate.checklist} - {gate.reportDirectory}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600">
            {gate.decision}
          </span>
          <span
            className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(gate.status)}`}
          >
            {STATUS_LABELS[gate.status]}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {gate.signals.map((signal) => (
          <div
            key={signal.id}
            className="rounded border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase text-slate-500">
                  {signal.owner}
                </p>
                <h3 className="mt-1 font-semibold text-slate-950">
                  {signal.label}
                </h3>
              </div>
              <span
                className={`shrink-0 rounded border px-2 py-1 text-xs font-semibold ${statusClass(signal.status)}`}
              >
                {STATUS_LABELS[signal.status]}
              </span>
            </div>
            <p className="mt-3 platform-long-text rounded bg-white px-3 py-2 text-xs font-medium text-slate-700">
              {signal.command}
            </p>
            <p className="mt-3 text-sm text-slate-600">{signal.evidence}</p>
            <p className="mt-2 text-sm font-medium text-slate-800">
              Volgende actie
            </p>
            <p className="mt-1 text-sm text-slate-600">{signal.nextAction}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {signal.testIds.map((testId) => (
                <span
                  key={testId}
                  className="rounded bg-white px-2 py-1 text-xs font-medium text-slate-600"
                >
                  {testId}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-950">Verplichte commands</h3>
          <div className="mt-3 grid gap-2">
            {gate.requiredCommands.map((command) => (
              <p
                key={command}
                className="platform-long-text rounded bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700"
              >
                {command}
              </p>
            ))}
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-950">Evidence directories</h3>
          <div className="mt-3 grid gap-2">
            {gate.evidenceDirectories.map((directory) => (
              <p
                key={directory}
                className="platform-long-text rounded bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700"
              >
                {directory}
              </p>
            ))}
          </div>
          {gate.evidenceRuns.length > 0 && (
            <div className="mt-4 grid gap-2">
              {gate.evidenceRuns.map((run) => (
                <p
                  key={run.id}
                  className="platform-long-text rounded bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
                >
                  {run.label} - {run.artifactPath ?? run.source}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default async function PlatformStagingSmokePage() {
  const dashboard = await getPlatformStagingSmokeDashboard();
  const requiredChecks = new Set(dashboard.minimumGreen);
  const blockingChecks = dashboard.checks.filter(
    (check) => check.status === "blocked",
  ).length;
  const warningChecks = dashboard.checks.filter(
    (check) => check.status === "warning",
  ).length;
  const okChecks = dashboard.checks.filter(
    (check) => check.status === "ok",
  ).length;
  const liveReadyChecks = dashboard.liveSmokes.filter(
    (smoke) => smoke.status === "ok",
  ).length;

  return (
    <main className="platform-page min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-5">
          <Link
            href="/platform"
            className="text-sm text-slate-500 underline-offset-2 hover:underline"
          >
            Platformbeheer
          </Link>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Fieldgrid operatie
              </p>
              <h1 className="text-3xl font-semibold tracking-normal">
                Staging smoke dashboard
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                Read-only acceptatieoverzicht voor host, login, modules,
                sectoren, storage, PDF/downloads, migraties, support grants en
                audit.
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Gegenereerd: {formatDate(dashboard.generatedAt)}
              </p>
            </div>
            <Link
              href="/api/platform/staging-smoke"
              className="w-fit rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              JSON smoke API
            </Link>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Groene checks" value={okChecks} />
          <Stat label="Aandacht" value={warningChecks} />
          <Stat label="Blokkerend" value={blockingChecks} />
          <Stat
            label="Pilottenant"
            value={`${dashboard.totals.pilotTenants}/1`}
          />
          <Stat label="Run history" value={dashboard.runHistory.length} />
          <Stat
            label="Live smokes"
            value={`${liveReadyChecks}/${dashboard.liveSmokes.length}`}
          />
        </section>

        <section className="rounded border border-slate-200 bg-white p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Platformhost
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {dashboard.environment.platformHost}
              </p>
              <p className="text-xs text-slate-500">
                {dashboard.environment.platformHostKnown
                  ? "Bekend als platformhost"
                  : "Niet herkend als platformhost"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Staginghost
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {dashboard.environment.stagingHost}
              </p>
              <p className="text-xs text-slate-500">
                {dashboard.environment.stagingHostKnown
                  ? "Bekend als platformhost"
                  : "Niet herkend als platformhost"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Tenantdomeinen
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {dashboard.totals.verifiedTenantDomains}/
                {dashboard.totals.tenantDomains} verified
              </p>
              <p className="text-xs text-slate-500">
                Host-first smokebasis voor {dashboard.environment.pilotTenantHost}.
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Migration history
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {dashboard.totals.migrationHistoryTables}/2 tabellen
              </p>
              <p className="text-xs text-slate-500">
                Drizzle en SQL migration history aanwezig.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <Stat
            label="Actieve tenants"
            value={`${dashboard.totals.activeTenants}/${dashboard.totals.tenants}`}
          />
          <Stat
            label="Actieve modules"
            value={dashboard.totals.enabledTenantModules}
          />
          <Stat
            label="Actieve sectoren"
            value={dashboard.totals.tenantSectors}
          />
          <Stat
            label="Actieve regio's"
            value={dashboard.totals.tenantRegions}
          />
        </section>

        <section className="rounded border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-normal text-slate-950">
                Run history
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Laatste dashboard-, staging-smoke- en migration-smoke runs. JSON
                artifacts uit `artifacts/staging-smoke` en
                `artifacts/migration-smoke` verschijnen hier automatisch.
              </p>
            </div>
            <span className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600">
              FG-OPS-008
            </span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {dashboard.runHistory.map((run) => (
              <RunHistoryCard key={run.id} run={run} />
            ))}
          </div>
        </section>

        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">
            Live Playwright-smokes
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Live targets voor host, login, modules, sectoren, regio's, storage,
            PDF, portalen en personeelsplanning.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {dashboard.liveSmokes.map((smoke) => (
              <LiveSmokeCard key={smoke.id} smoke={smoke} />
            ))}
          </div>
        </section>

        <section className="rounded border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-normal text-slate-950">
                Migratie-smoke status
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {dashboard.migrationSmoke.nextAction}
              </p>
            </div>
            <span
              className={`w-fit rounded border px-2 py-1 text-xs font-semibold ${statusClass(dashboard.migrationSmoke.status)}`}
            >
              {STATUS_LABELS[dashboard.migrationSmoke.status]}
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {dashboard.migrationSmoke.targets.map((target) => (
              <div
                key={target.id}
                className="rounded border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950">{target.label}</p>
                  <span
                    className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(target.status)}`}
                  >
                    {STATUS_LABELS[target.status]}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {target.requiredSecret}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {target.confirmVar}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm font-medium text-slate-800">
            {dashboard.migrationSmoke.command}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Rapportmap: {dashboard.migrationSmoke.reportDirectory}
          </p>
        </section>

        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">
            Mutating checks en cleanup
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Muterende checks zijn alleen toegestaan op {dashboard.environment.pilotTenantSlug}
            met marker-scoped cleanup en expliciete confirm-env.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {dashboard.mutatingChecks.map((check) => (
              <MutatingCheckCard key={check.id} check={check} />
            ))}
          </div>
        </section>

        <FinalGateCard gate={dashboard.finalExternalTenantGate} />

        <PlatformAdminReleaseGateCard
          gate={dashboard.platformAdminReleaseGate}
        />

        <StagingPromotionGateCard gate={dashboard.stagingPromotionGate} />

        <div className="grid gap-5 xl:grid-cols-2">
          {dashboard.checks.map((check) => (
            <CheckCard
              key={check.id}
              check={check}
              required={requiredChecks.has(check.id)}
            />
          ))}
        </div>

        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">
            Operationele bronnen
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Gebruik deze playbooks samen met het dashboard voordat `main` naar
            staging of een eerste externe tenant gaat.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {dashboard.playbooks.map((playbook) => (
              <span
                key={playbook}
                className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
              >
                {playbook}
              </span>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
