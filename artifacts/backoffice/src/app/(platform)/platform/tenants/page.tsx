import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  SlidersHorizontal,
} from "lucide-react";
import {
  listPlatformTenantList,
  type PlatformTenantListResult,
  type PlatformTenantListRow,
} from "@/app/actions/platform-tenants";
import { ResolvedFeatureHelp } from "@/components/knowledgebase/ResolvedFeatureHelp";
import { PlatformTenantFilters } from "@/components/platform/PlatformTenantFilters";

export const metadata = {
  title: "Tenants",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const value = params[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function numberParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): number | undefined {
  const value = Number(firstParam(params, key));
  return Number.isFinite(value) ? value : undefined;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortText(value: string | null, fallback = "-"): string {
  return value && value.trim() ? value : fallback;
}

function chipClass(tone: "neutral" | "good" | "warning" | "danger"): string {
  if (tone === "good")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function tenantStatusTone(
  status: PlatformTenantListRow["status"],
): "neutral" | "good" | "warning" | "danger" {
  if (status === "active") return "good";
  if (status === "trial" || status === "provisioning") return "warning";
  if (status === "suspended" || status === "archived") return "danger";
  return "neutral";
}

function readinessTone(
  status: PlatformTenantListRow["readinessStatus"],
): "neutral" | "good" | "warning" | "danger" {
  if (status === "ready") return "good";
  if (status === "warning") return "warning";
  return "danger";
}

function domainTone(
  status: PlatformTenantListRow["domainStatus"],
): "neutral" | "good" | "warning" | "danger" {
  if (status === "verified") return "good";
  if (status === "pending" || status === "missing") return "warning";
  return "danger";
}

function tenantPageHref(
  result: PlatformTenantListResult,
  page: number,
): string {
  const params = new URLSearchParams();
  const { filters } = result;

  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.plan !== "all") params.set("plan", filters.plan);
  if (filters.module) params.set("module", filters.module);
  if (filters.sector) params.set("sector", filters.sector);
  if (filters.region) params.set("region", filters.region);
  if (filters.domainStatus !== "all")
    params.set("domainStatus", filters.domainStatus);
  if (filters.readiness !== "all") params.set("readiness", filters.readiness);
  if (filters.view !== "all") params.set("view", filters.view);
  if (filters.pageSize !== 25) params.set("pageSize", String(filters.pageSize));
  if (page > 1) params.set("page", String(page));

  const query = params.toString();
  return query ? `/platform/tenants?${query}` : "/platform/tenants";
}

function tenantStatusLabel(status: PlatformTenantListRow["status"]): string {
  if (status === "provisioning") return "Wordt ingericht";
  if (status === "trial") return "Proefperiode";
  if (status === "active") return "Actief";
  if (status === "suspended") return "Gepauzeerd";
  return "Gearchiveerd";
}

function readinessLabel(
  status: PlatformTenantListRow["readinessStatus"],
): string {
  if (status === "ready") return "Klaar";
  if (status === "warning") return "Aandacht";
  return "Geblokkeerd";
}

function domainStatusLabel(
  status: PlatformTenantListRow["domainStatus"],
): string {
  if (status === "verified") return "Domein geverifieerd";
  if (status === "pending") return "Domein in afwachting";
  if (status === "failed") return "Domein mislukt";
  return "Domein ontbreekt";
}

function ActionChips({ actions }: { actions: string[] }) {
  if (actions.length === 0) {
    return (
      <span
        className={`inline-flex rounded border px-2 py-1 text-xs font-medium ${chipClass("good")}`}
      >
        Geen
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.map((action) => (
        <span
          key={action}
          className={`inline-flex rounded border px-2 py-1 text-xs font-medium ${chipClass("warning")}`}
        >
          {action}
        </span>
      ))}
    </div>
  );
}

function TenantDesktopTable({ rows }: { rows: PlatformTenantListRow[] }) {
  return (
    <section className="hidden overflow-hidden rounded border border-slate-200 bg-white lg:block">
      <div className="platform-scroll-x">
        <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Organisatie</th>
              <th className="px-4 py-3 font-semibold">Slug</th>
              <th className="px-4 py-3 font-semibold">Primair domein</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Eigenaar</th>
              <th className="px-4 py-3 font-semibold">Modules</th>
              <th className="px-4 py-3 font-semibold">Laatste activiteit</th>
              <th className="px-4 py-3 font-semibold">Open acties</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tenant) => (
              <tr
                key={tenant.id}
                className="relative border-t border-slate-100 align-top hover:bg-slate-50"
              >
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/platform/tenants/${tenant.id}`}
                    className="text-slate-950 underline-offset-2 after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  >
                    {tenant.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span
                      className={`rounded border px-2 py-0.5 text-[11px] font-medium ${chipClass(readinessTone(tenant.readinessStatus))}`}
                    >
                      {readinessLabel(tenant.readinessStatus)}
                    </span>
                    <span
                      className={`rounded border px-2 py-0.5 text-[11px] font-medium ${chipClass(domainTone(tenant.domainStatus))}`}
                    >
                      {domainStatusLabel(tenant.domainStatus)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{tenant.slug}</td>
                <td className="max-w-56 px-4 py-3 text-slate-600">
                  <span className="block break-all">
                    {shortText(tenant.primaryDomain)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded border px-2 py-1 text-xs font-medium ${chipClass(tenantStatusTone(tenant.status))}`}
                  >
                    {tenantStatusLabel(tenant.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{tenant.planKey}</td>
                <td className="max-w-56 px-4 py-3 text-slate-600">
                  <span className="block truncate">
                    {shortText(tenant.ownerEmail)}
                  </span>
                  {tenant.ownerStatus && (
                    <span className="text-xs text-slate-400">
                      {tenant.ownerStatus}
                    </span>
                  )}
                </td>
                <td className="max-w-60 px-4 py-3 text-slate-600">
                  <span className="block truncate">
                    {tenant.enabledModules} ·{" "}
                    {shortText(tenant.moduleSummary, "Geen modules")}
                  </span>
                  <span className="text-xs text-slate-400">
                    {tenant.enabledSectors} sector(en), {tenant.activeRegions}{" "}
                    regio(s)
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatDateTime(tenant.latestActivityAt)}
                </td>
                <td className="px-4 py-3">
                  <ActionChips actions={tenant.openActions} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  Geen tenants gevonden met deze filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TenantMobileList({ rows }: { rows: PlatformTenantListRow[] }) {
  return (
    <section className="grid gap-3 lg:hidden">
      {rows.map((tenant) => (
        <Link
          key={tenant.id}
          href={`/platform/tenants/${tenant.id}`}
          className="rounded border border-slate-200 bg-white p-4 transition hover:border-slate-300"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold tracking-normal text-slate-950">
                {tenant.name}
              </h3>
              <p className="mt-1 truncate text-sm text-slate-500">
                {tenant.slug} · {tenant.planKey}
              </p>
            </div>
            <ExternalLink
              className="mt-1 size-4 shrink-0 text-slate-300"
              aria-hidden="true"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <span
              className={`rounded border px-2 py-1 text-xs font-medium ${chipClass(tenantStatusTone(tenant.status))}`}
            >
              {tenantStatusLabel(tenant.status)}
            </span>
            <span
              className={`rounded border px-2 py-1 text-xs font-medium ${chipClass(readinessTone(tenant.readinessStatus))}`}
            >
              {readinessLabel(tenant.readinessStatus)}
            </span>
            <span
              className={`rounded border px-2 py-1 text-xs font-medium ${chipClass(domainTone(tenant.domainStatus))}`}
            >
              {domainStatusLabel(tenant.domainStatus)}
            </span>
          </div>

          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase text-slate-400">
                Domein
              </dt>
              <dd className="mt-1 break-all text-slate-700">
                {shortText(tenant.primaryDomain)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-400">
                Eigenaar
              </dt>
              <dd className="mt-1 truncate text-slate-700">
                {shortText(tenant.ownerEmail)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-400">
                Modules en scope
              </dt>
              <dd className="mt-1 text-slate-700">
                {tenant.enabledModules} module(s), {tenant.enabledSectors}{" "}
                sector(en), {tenant.activeRegions} regio(s)
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-slate-400">
                Laatste activiteit
              </dt>
              <dd className="mt-1 text-slate-700">
                {formatDateTime(tenant.latestActivityAt)}
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            <ActionChips actions={tenant.openActions} />
          </div>
        </Link>
      ))}
      {rows.length === 0 && (
        <div className="rounded border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Geen tenants gevonden met deze filters.
        </div>
      )}
    </section>
  );
}

function Pagination({ result }: { result: PlatformTenantListResult }) {
  const { pagination } = result;
  const from =
    pagination.total === 0
      ? 0
      : (pagination.page - 1) * pagination.pageSize + 1;
  const to = Math.min(pagination.total, pagination.page * pagination.pageSize);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <p>
        {from}-{to} van {pagination.total} organisaties
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={tenantPageHref(result, Math.max(1, pagination.page - 1))}
          aria-disabled={!pagination.hasPreviousPage}
          className={`inline-flex h-9 items-center gap-2 rounded border px-3 font-medium ${
            pagination.hasPreviousPage
              ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              : "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"
          }`}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Vorige
        </Link>
        <span className="min-w-16 text-center text-xs font-medium text-slate-500">
          {pagination.page}/{pagination.totalPages}
        </span>
        <Link
          href={tenantPageHref(result, pagination.page + 1)}
          aria-disabled={!pagination.hasNextPage}
          className={`inline-flex h-9 items-center gap-2 rounded border px-3 font-medium ${
            pagination.hasNextPage
              ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              : "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"
          }`}
        >
          Volgende
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

export default async function PlatformTenantsPage({ searchParams }: Props) {
  const params = await searchParams;
  const result = await listPlatformTenantList({
    q: firstParam(params, "q"),
    status: firstParam(
      params,
      "status",
    ) as PlatformTenantListResult["filters"]["status"],
    plan: firstParam(
      params,
      "plan",
    ) as PlatformTenantListResult["filters"]["plan"],
    module: firstParam(params, "module"),
    sector: firstParam(params, "sector"),
    region: firstParam(params, "region"),
    domainStatus: firstParam(
      params,
      "domainStatus",
    ) as PlatformTenantListResult["filters"]["domainStatus"],
    readiness: firstParam(
      params,
      "readiness",
    ) as PlatformTenantListResult["filters"]["readiness"],
    view: firstParam(
      params,
      "view",
    ) as PlatformTenantListResult["filters"]["view"],
    page: numberParam(params, "page"),
    pageSize: numberParam(params, "pageSize"),
  });

  return (
    <main className="platform-page min-h-full bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">
              Fieldgrid platform
            </p>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-normal text-slate-950">
                Organisaties
              </h2>
              <ResolvedFeatureHelp
                surface="platform"
                featureKey="platform.tenants"
                moduleKey="knowledgebase"
              />
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Zoek en filter veilig op organisatie, domein, eigenaar, modules,
              sectoren, regio&apos;s en gereedheid.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {result.pagination.total} resultaat/resultaten
          </div>
        </header>

        <PlatformTenantFilters result={result} />

        <TenantDesktopTable rows={result.rows} />
        <TenantMobileList rows={result.rows} />
        <Pagination result={result} />
      </div>
    </main>
  );
}
