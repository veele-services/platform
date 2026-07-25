"use client";

import { FormEvent, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Filter, Search, SlidersHorizontal, X } from "lucide-react";
import type {
  PlatformTenantListFacetOption,
  PlatformTenantListResult,
  PlatformTenantListSavedView,
} from "@/app/actions/platform-tenants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type FilterState = {
  q: string;
  status: string;
  plan: string;
  module: string;
  sector: string;
  region: string;
  domainStatus: string;
  readiness: string;
  view: string;
  pageSize: string;
};

const SAVED_VIEWS: Array<{
  value: PlatformTenantListSavedView;
  label: string;
  description: string;
}> = [
  {
    value: "domain_problems",
    label: "Domeinproblemen",
    description: "Ontbrekende, wachtende of mislukte domeinkoppelingen.",
  },
  {
    value: "past_due",
    label: "Betalingsachterstand",
    description: "Abonnementen waarvoor een betaalactie nodig is.",
  },
  {
    value: "provisioning_blocked",
    label: "Inrichting geblokkeerd",
    description: "Mislukte of teruggedraaide inrichtingsruns.",
  },
  {
    value: "expiring_trial",
    label: "Proefperiode verloopt",
    description: "Proefabonnementen die binnen veertien dagen eindigen.",
  },
];

function stateFromResult(result: PlatformTenantListResult): FilterState {
  return {
    q: result.filters.q,
    status: result.filters.status,
    plan: result.filters.plan,
    module: result.filters.module || "all",
    sector: result.filters.sector || "all",
    region: result.filters.region || "all",
    domainStatus: result.filters.domainStatus,
    readiness: result.filters.readiness,
    view: result.filters.view,
    pageSize: String(result.filters.pageSize),
  };
}

function FilterSelect({
  id,
  label,
  value,
  options,
  allLabel = "Alle",
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: PlatformTenantListFacetOption[];
  allLabel?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function buildQuery(state: FilterState): URLSearchParams {
  const query = new URLSearchParams();
  const entries: Array<[keyof FilterState, string]> = [
    ["q", state.q.trim()],
    ["status", state.status],
    ["plan", state.plan],
    ["module", state.module],
    ["sector", state.sector],
    ["region", state.region],
    ["domainStatus", state.domainStatus],
    ["readiness", state.readiness],
    ["view", state.view],
    ["pageSize", state.pageSize],
  ];

  for (const [key, value] of entries) {
    if (!value || value === "all" || (key === "pageSize" && value === "25"))
      continue;
    query.set(key, value);
  }
  return query;
}

export function PlatformTenantFilters({
  result,
}: {
  result: PlatformTenantListResult;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<FilterState>(() =>
    stateFromResult(result),
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const activeFilters = useMemo(() => {
    const labels: Array<{ key: keyof FilterState; label: string }> = [];
    if (state.q.trim())
      labels.push({ key: "q", label: `Zoeken: ${state.q.trim()}` });
    if (state.status !== "all") {
      labels.push({
        key: "status",
        label:
          result.facets.statuses.find((option) => option.value === state.status)
            ?.label ?? state.status,
      });
    }
    if (state.plan !== "all") labels.push({ key: "plan", label: state.plan });
    if (state.view !== "all") {
      labels.push({
        key: "view",
        label:
          SAVED_VIEWS.find((view) => view.value === state.view)?.label ??
          state.view,
      });
    }
    for (const key of [
      "module",
      "sector",
      "region",
      "domainStatus",
      "readiness",
    ] as const) {
      if (state[key] !== "all") labels.push({ key, label: state[key] });
    }
    return labels;
  }, [result.facets.statuses, state]);

  function update<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  function navigate(next: FilterState) {
    const query = buildQuery(next).toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function apply(event?: FormEvent) {
    event?.preventDefault();
    setAdvancedOpen(false);
    navigate(state);
  }

  function clearFilter(key: keyof FilterState) {
    const next = {
      ...state,
      [key]: key === "q" ? "" : "all",
    };
    setState(next);
    navigate(next);
  }

  function reset() {
    const next = stateFromResult({
      ...result,
      filters: {
        ...result.filters,
        q: "",
        status: "all",
        plan: "all",
        module: "",
        sector: "",
        region: "",
        domainStatus: "all",
        readiness: "all",
        view: "all",
        page: 1,
        pageSize: 25,
      },
    });
    setState(next);
    setAdvancedOpen(false);
    router.push(pathname);
  }

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-4"
      aria-label="Organisaties filteren"
    >
      <form onSubmit={apply} className="grid gap-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_220px_220px_auto] lg:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="platform-tenant-search">Zoeken</Label>
            <span className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <Input
                id="platform-tenant-search"
                value={state.q}
                onChange={(event) => update("q", event.target.value)}
                className="pl-9"
                placeholder="Naam, slug, domein of eigenaar"
              />
            </span>
          </div>
          <FilterSelect
            id="platform-tenant-status"
            label="Status"
            value={state.status}
            options={result.facets.statuses}
            onChange={(value) => update("status", value)}
          />
          <FilterSelect
            id="platform-tenant-plan"
            label="Abonnement"
            value={state.plan}
            options={result.facets.plans}
            onChange={(value) => update("plan", value)}
          />
          <div className="flex gap-2">
            <Sheet open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" className="flex-1">
                  <SlidersHorizontal aria-hidden="true" />
                  Meer filters
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Uitgebreide filters</SheetTitle>
                  <SheetDescription>
                    Verfijn op modules, werkgebied, domeinstatus en gereedheid.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 grid gap-4">
                  <FilterSelect
                    id="platform-tenant-module"
                    label="Module"
                    value={state.module}
                    options={result.facets.modules}
                    onChange={(value) => update("module", value)}
                  />
                  <FilterSelect
                    id="platform-tenant-sector"
                    label="Sector"
                    value={state.sector}
                    options={result.facets.sectors}
                    onChange={(value) => update("sector", value)}
                  />
                  <FilterSelect
                    id="platform-tenant-region"
                    label="Regio"
                    value={state.region}
                    options={result.facets.regions}
                    onChange={(value) => update("region", value)}
                  />
                  <FilterSelect
                    id="platform-tenant-domain"
                    label="Domeinstatus"
                    value={state.domainStatus}
                    options={result.facets.domainStatuses}
                    onChange={(value) => update("domainStatus", value)}
                  />
                  <FilterSelect
                    id="platform-tenant-readiness"
                    label="Gereedheid"
                    value={state.readiness}
                    options={result.facets.readinessStatuses}
                    onChange={(value) => update("readiness", value)}
                  />
                  <FilterSelect
                    id="platform-tenant-page-size"
                    label="Resultaten per pagina"
                    value={state.pageSize}
                    allLabel="25"
                    options={[
                      { value: "10", label: "10" },
                      { value: "50", label: "50" },
                    ]}
                    onChange={(value) =>
                      update("pageSize", value === "all" ? "25" : value)
                    }
                  />
                  <Button type="button" onClick={() => apply()}>
                    <Filter aria-hidden="true" />
                    Filters toepassen
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <Button type="submit">
              <Filter aria-hidden="true" />
              Toepassen
            </Button>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Opgeslagen weergaven
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SAVED_VIEWS.map((view) => (
              <Button
                key={view.value}
                type="button"
                size="sm"
                variant={state.view === view.value ? "secondary" : "outline"}
                aria-pressed={state.view === view.value}
                title={view.description}
                onClick={() => {
                  const next = {
                    ...state,
                    view: state.view === view.value ? "all" : view.value,
                  };
                  setState(next);
                  navigate(next);
                }}
              >
                {view.label}
              </Button>
            ))}
          </div>
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className="text-xs font-medium text-slate-500">Actief:</span>
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => clearFilter(filter.key)}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
              >
                {filter.label}
                <X className="size-3.5" aria-hidden="true" />
                <span className="sr-only">filter verwijderen</span>
              </button>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Alles wissen
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}
