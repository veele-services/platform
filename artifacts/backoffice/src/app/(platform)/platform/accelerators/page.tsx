import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  Archive,
  Bell,
  Camera,
  CheckCircle2,
  Download,
  FileText,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import {
  getPlatformAcceleratorsDashboard,
  requestDemoTenantReset,
  requestPlatformExportAudit,
  requestVisualRegressionSnapshot,
  type PlatformAcceleratorDemoTenant,
  type PlatformAcceleratorExportCenterItem,
  type PlatformAcceleratorHealthSignal,
  type PlatformAcceleratorNotificationSandboxEvent,
  type PlatformAcceleratorTenantHealthRow,
  type PlatformAcceleratorVisualSnapshotTarget,
} from "@/app/actions/platform-accelerators";
import type { PlatformSmokeStatus } from "@/app/actions/platform-smoke.types";

export const metadata = {
  title: "Platformversnellers",
};

type Tone = "neutral" | "good" | "warning" | "danger";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function statusTone(status: PlatformSmokeStatus): Tone {
  if (status === "ok") return "good";
  if (status === "blocked") return "danger";
  if (status === "warning") return "warning";
  return "neutral";
}

function statusLabel(status: PlatformSmokeStatus): string {
  if (status === "ok") return "Groen";
  if (status === "blocked") return "Geblokkeerd";
  if (status === "warning") return "Aandacht";
  return "Handmatig";
}

function toneClasses(tone: Tone): string {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function StatusPill({ status }: { status: PlatformSmokeStatus }) {
  return (
    <span className={`inline-flex w-fit items-center rounded border px-2.5 py-1 text-xs font-medium ${toneClasses(statusTone(status))}`}>
      {statusLabel(status)}
    </span>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className="flex min-h-32 flex-col justify-between rounded border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex size-9 items-center justify-center rounded border ${toneClasses(tone)}`}>
          <Icon aria-hidden="true" className="size-4" />
        </span>
      </div>
      <div>
        <p className="mt-5 text-2xl font-semibold tracking-normal text-slate-950">{value}</p>
        <p className="mt-1 text-sm font-medium text-slate-900">{label}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold tracking-normal text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{detail}</p>
      </div>
      {action}
    </div>
  );
}

function DemoTenantCard({ tenant }: { tenant: PlatformAcceleratorDemoTenant }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-950">{tenant.label}</p>
          <p className="mt-1 text-xs text-slate-500">{tenant.domain}</p>
        </div>
        <StatusPill status={tenant.healthStatus} />
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Bestaat</dt>
          <dd className="font-medium text-slate-800">{tenant.exists ? "Ja" : "Nee"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Plan</dt>
          <dd className="font-medium text-slate-800">{tenant.recommendedPlan}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Laatste resetrequest</dt>
          <dd className="max-w-44 truncate font-medium text-slate-800">{formatDate(tenant.lastResetRequestedAt)}</dd>
        </div>
      </dl>
      <form action={requestDemoTenantReset} className="mt-4 grid gap-3">
        <input type="hidden" name="slug" value={tenant.slug} />
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          Bevestiging
          <input
            name="confirmation"
            className="rounded border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950"
            placeholder="reset-demo-tenants"
          />
        </label>
        <button
          type="submit"
          className="inline-flex w-fit items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          <RefreshCcw aria-hidden="true" className="size-4" />
          Reset aanvragen
        </button>
      </form>
    </div>
  );
}

function DemoTenantGenerator({ tenants }: { tenants: PlatformAcceleratorDemoTenant[] }) {
  return (
    <section className="grid gap-4">
      <SectionHeader
        title="Demo-tenant generator"
        detail="Beheer demo-a, demo-b en veele als gecontroleerde reset-scope met auditbewijs."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {tenants.map((tenant) => (
          <DemoTenantCard key={tenant.slug} tenant={tenant} />
        ))}
      </div>
    </section>
  );
}

function NotificationSandboxCard({ event }: { event: PlatformAcceleratorNotificationSandboxEvent }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">{event.label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{event.description}</p>
        </div>
        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
          {event.estimatedRecipients}
        </span>
      </div>
      <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-medium text-slate-950">{event.title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">{event.body}</p>
      </div>
      <dl className="mt-4 grid gap-2 text-xs text-slate-600">
        <div className="flex justify-between gap-3">
          <dt>Audience</dt>
          <dd className="font-medium text-slate-800">{event.recommendedAudience}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Kanalen</dt>
          <dd className="font-medium text-slate-800">{event.channels.join(", ")}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Laatste dispatch</dt>
          <dd className="font-medium text-slate-800">{event.latestDispatchStatus ?? "-"}</dd>
        </div>
      </dl>
    </div>
  );
}

function NotificationSandbox({ events }: { events: PlatformAcceleratorNotificationSandboxEvent[] }) {
  return (
    <section className="grid gap-4">
      <SectionHeader
        title="Notification preview sandbox"
        detail="Per eventtype staat voorbeeldcopy, recommended audience, kanalen en actuele recipient-inschatting klaar."
        action={
          <Link
            href="/platform/notifications"
            className="inline-flex w-fit items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <Bell aria-hidden="true" className="size-4" />
            Open dispatch
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {events.map((event) => (
          <NotificationSandboxCard key={event.key} event={event} />
        ))}
      </div>
    </section>
  );
}

function SignalGrid({ signals }: { signals: PlatformAcceleratorHealthSignal[] }) {
  return (
    <div className="grid min-w-[760px] grid-cols-7 gap-2">
      {signals.map((signal) => (
        <div key={signal.id} className={`rounded border px-2 py-2 ${toneClasses(statusTone(signal.status))}`}>
          <p className="truncate text-[11px] font-semibold">{signal.label}</p>
          <p className="mt-1 truncate text-[11px] opacity-80">{statusLabel(signal.status)}</p>
        </div>
      ))}
    </div>
  );
}

function TenantHealthScorecard({ tenants }: { tenants: PlatformAcceleratorTenantHealthRow[] }) {
  return (
    <section className="grid gap-4">
      <SectionHeader
        title="Tenant health scorecard"
        detail="Domeinen, mail, modules, users, errors, storage en smokes per tenant in één operationele rij."
      />
      <div className="platform-scroll-x rounded border border-slate-200 bg-white">
        <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Tenant</th>
              <th className="px-4 py-3 font-semibold">Score</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Domein</th>
              <th className="px-4 py-3 font-semibold">Mail</th>
              <th className="px-4 py-3 font-semibold">Storage</th>
              <th className="px-4 py-3 font-semibold">Signalen</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.tenantId} className="border-t border-slate-100 align-top">
                <td className="px-4 py-4">
                  <Link href={`/platform/tenants/${tenant.tenantId}`} className="font-semibold text-slate-950 underline-offset-2 hover:underline">
                    {tenant.tenantName}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">{tenant.tenantSlug} / {tenant.planKey} / {tenant.tenantStatus}</p>
                </td>
                <td className="px-4 py-4 text-2xl font-semibold text-slate-950">{tenant.score}</td>
                <td className="px-4 py-4"><StatusPill status={tenant.status} /></td>
                <td className="px-4 py-4 text-slate-600">
                  <p className="max-w-48 truncate">{tenant.primaryDomain ?? "-"}</p>
                  <p className="mt-1 text-xs text-slate-500">{tenant.metrics.verifiedDomains}/{tenant.metrics.domains} verified</p>
                </td>
                <td className="px-4 py-4 text-slate-600">
                  <p>{tenant.metrics.sentEmails7d} sent</p>
                  <p className="mt-1 text-xs text-slate-500">{tenant.metrics.failedEmails7d} failed / 7 dagen</p>
                </td>
                <td className="px-4 py-4 text-slate-600">
                  <p>{tenant.metrics.documents} docs</p>
                  <p className="mt-1 text-xs text-slate-500">{formatBytes(tenant.metrics.storageBytes)} / {tenant.metrics.legacyStoragePaths} legacy</p>
                </td>
                <td className="px-4 py-4">
                  <SignalGrid signals={tenant.signals} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VisualRegressionCard({ target }: { target: PlatformAcceleratorVisualSnapshotTarget }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-950">{target.label}</p>
          <p className="mt-1 text-xs text-slate-500">{target.baseUrlEnv}</p>
        </div>
        <Camera aria-hidden="true" className="size-5 text-slate-400" />
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-600">
        {target.routes.length} routes / {target.viewports.length} viewports / {target.artifactDirectory}
      </p>
      <code className="mt-3 block overflow-hidden text-ellipsis rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {target.command}
      </code>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Laatste request: {formatDate(target.latestRequestAt)}</span>
        <form action={requestVisualRegressionSnapshot}>
          <input type="hidden" name="target" value={target.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <Camera aria-hidden="true" className="size-4" />
            Snapshot aanvragen
          </button>
        </form>
      </div>
    </div>
  );
}

function VisualRegressionSnapshots({ targets }: { targets: PlatformAcceleratorVisualSnapshotTarget[] }) {
  return (
    <section className="grid gap-4">
      <SectionHeader
        title="Visual regression snapshots"
        detail="Backoffice en portalen krijgen dezelfde snapshot-contracten, routes, viewports en artifactlocatie."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {targets.map((target) => (
          <VisualRegressionCard key={target.id} target={target} />
        ))}
      </div>
    </section>
  );
}

function ExportCard({ item }: { item: PlatformAcceleratorExportCenterItem }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-950">{item.label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
        </div>
        <StatusPill status={item.status} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <form action={requestPlatformExportAudit}>
          <input type="hidden" name="exportId" value={item.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <Archive aria-hidden="true" className="size-4" />
            Audit markeren
          </button>
        </form>
        <Link
          href={item.href}
          className="inline-flex items-center gap-2 rounded bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <Download aria-hidden="true" className="size-4" />
          CSV downloaden
        </Link>
      </div>
      <p className="mt-3 text-xs text-slate-500">Owner: {item.owner} / laatste request: {formatDate(item.lastRequestedAt)}</p>
    </div>
  );
}

function ExportCenter({ items }: { items: PlatformAcceleratorExportCenterItem[] }) {
  return (
    <section className="grid gap-4">
      <SectionHeader
        title="Export center"
        detail="Platform-admin, audit/security en billing exports zijn downloadbaar en auditable."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {items.map((item) => (
          <ExportCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

export default async function PlatformAcceleratorsPage() {
  const dashboard = await getPlatformAcceleratorsDashboard();

  return (
    <main className="platform-page min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-slate-500">Fieldgrid platformbeheer</p>
            <h1 className="text-3xl font-semibold tracking-normal">Platformversnellers</h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-500">
              Demo reset, notificatiepreview, tenant health, visual snapshots en exports in één beheeroppervlak.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/platform/operations"
              className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <Activity aria-hidden="true" className="size-4" />
              Operations
            </Link>
            <Link
              href="/platform/staging-smoke"
              className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <ShieldCheck aria-hidden="true" className="size-4" />
              Smokes
            </Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Sparkles}
            label="Gezonde tenants"
            value={dashboard.summary.healthyTenants}
            detail={`${dashboard.summary.tenants} tenants totaal.`}
            tone="good"
          />
          <MetricCard
            icon={TriangleAlert}
            label="Aandacht of blokkade"
            value={dashboard.summary.warningTenants + dashboard.summary.blockedTenants}
            detail={`${dashboard.summary.warningTenants} aandacht, ${dashboard.summary.blockedTenants} geblokkeerd.`}
            tone={dashboard.summary.blockedTenants > 0 ? "danger" : dashboard.summary.warningTenants > 0 ? "warning" : "neutral"}
          />
          <MetricCard
            icon={Bell}
            label="Sandbox eventtypes"
            value={dashboard.summary.notificationEvents}
            detail="Previewcopy en recipient-inschatting."
            tone="neutral"
          />
          <MetricCard
            icon={FileText}
            label="Exportfeeds"
            value={dashboard.summary.exportFeeds}
            detail="Platform, audit/security en billing."
            tone="neutral"
          />
        </section>

        <DemoTenantGenerator tenants={dashboard.demoTenants} />
        <NotificationSandbox events={dashboard.notificationSandbox} />
        <TenantHealthScorecard tenants={dashboard.tenantHealth} />
        <VisualRegressionSnapshots targets={dashboard.visualRegression} />
        <ExportCenter items={dashboard.exportCenter} />

        <section className="rounded border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-slate-950">Laatst opgebouwd</p>
              <p className="mt-1 text-sm text-slate-500">{formatDate(dashboard.generatedAt)}</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
