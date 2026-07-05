export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  Building2,
  KeyRound,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { getMyObjects } from "@/actions/objects";
import {
  PortalActionMenu,
  PortalActionMenuLink,
} from "@/components/PortalActionMenu";
import { PortalFilterSheet } from "@/components/PortalFilterSheet";
import {
  PortalActiveFilterChips,
  PortalDataList,
  PortalPageShell,
  PortalToolbar,
  PortalToolbarSearch,
  PortalToolbarSelect,
  type PortalDataColumn,
} from "@/components/portal-ui";

type CustomerObject = Awaited<ReturnType<typeof getMyObjects>>[number];
type ObjectStatusFilter = "all" | "active" | "inactive";

function normalizeQuery(value?: string): string {
  return value?.trim().slice(0, 80) ?? "";
}

function normalizeStatus(value?: string): ObjectStatusFilter {
  return value === "active" || value === "inactive" ? value : "all";
}

function normalizeService(value?: string): string {
  return value?.trim().slice(0, 80) ?? "all";
}

function objectAddress(object: CustomerObject) {
  return [object.address, object.postalCode, object.city].filter(Boolean).join(" ");
}

function matchesObjectSearch(object: CustomerObject, query: string) {
  if (!query) return true;
  const haystack = [
    object.name,
    object.code,
    objectAddress(object),
    object.contactName,
    object.contactPhone,
    object.sectorName,
    object.serviceType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function filterObjects(
  objects: CustomerObject[],
  query: string,
  status: ObjectStatusFilter,
  service: string,
) {
  return objects.filter((object) => {
    const matchesStatus =
      status === "all" ||
      (status === "active" ? object.isActive : !object.isActive);
    const matchesService =
      service === "all" || (object.serviceType ?? "Geen dienst") === service;

    return matchesStatus && matchesService && matchesObjectSearch(object, query);
  });
}

function filterHref({
  query,
  status,
  service,
  remove,
}: {
  query: string;
  status: ObjectStatusFilter;
  service: string;
  remove: "query" | "status" | "service";
}) {
  const params = new URLSearchParams();
  if (remove !== "query" && query) params.set("q", query);
  if (remove !== "status" && status !== "all") params.set("status", status);
  if (remove !== "service" && service !== "all") params.set("service", service);
  const value = params.toString();
  return value ? `/objecten?${value}` : "/objecten";
}

function objectColumns(): Array<PortalDataColumn<CustomerObject>> {
  return [
    {
      key: "object",
      header: "Object",
      render: (object) => (
        <span className="flex min-w-[16rem] items-center gap-3">
          <ObjectIcon />
          <span className="min-w-0">
            <span
              className="block truncate text-sm font-black"
              style={{ color: "var(--color-primary)" }}
            >
              {object.name}
            </span>
            <span
              className="mt-0.5 block font-mono text-xs font-black"
              style={{ color: "var(--color-muted-fg)" }}
            >
              {object.code}
            </span>
            {object.sectorName ? (
              <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
                {object.sectorName}
              </span>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "address",
      header: "Adres",
      render: (object) => (
        <span
          className="block min-w-[14rem] text-sm font-semibold leading-5"
          style={{ color: objectAddress(object) ? "var(--color-secondary)" : "var(--color-muted-fg)" }}
        >
          {objectAddress(object) || "Niet ingevuld"}
        </span>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (object) => (
        <span className="block min-w-[12rem]">
          <span
            className="block truncate text-sm font-bold"
            style={{
              color: object.contactName ? "var(--color-primary)" : "var(--color-muted-fg)",
            }}
          >
            {object.contactName ?? "Geen contactpersoon"}
          </span>
          <span
            className="mt-0.5 block truncate text-xs font-semibold"
            style={{ color: "var(--color-secondary)" }}
          >
            {object.contactPhone ?? "Geen telefoonnummer"}
          </span>
        </span>
      ),
    },
    {
      key: "service",
      header: "Dienst",
      render: (object) => (
        <span
          className="block min-w-[8rem] truncate text-sm font-semibold"
          style={{ color: object.serviceType ? "var(--color-primary)" : "var(--color-muted-fg)" }}
        >
          {object.serviceType ?? "Niet ingesteld"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (object) => <ObjectStatusBadge active={object.isActive} />,
    },
    {
      key: "actions",
      header: "Acties",
      align: "right",
      render: (object) => (
        <PortalActionMenu label={`Acties voor ${object.name}`}>
          <PortalActionMenuLink href={`/objecten/${object.id}`}>
            Details bekijken
          </PortalActionMenuLink>
          <PortalActionMenuLink href={`/opdrachten/aanvragen?object=${object.id}`}>
            Opdracht aanvragen
          </PortalActionMenuLink>
        </PortalActionMenu>
      ),
    },
  ];
}

export default async function ObjectenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; service?: string }>;
}) {
  const params = await searchParams;
  const query = normalizeQuery(params.q);
  const status = normalizeStatus(params.status);
  const service = normalizeService(params.service);
  const objects = await getMyObjects();
  const visibleObjects = filterObjects(objects, query, status, service);
  const serviceOptions = Array.from(
    new Set(objects.map((object) => object.serviceType ?? "Geen dienst")),
  ).sort((a, b) => a.localeCompare(b, "nl"));

  const activeFilters = [
    query
      ? {
          label: `Zoeken: ${query}`,
          href: filterHref({ query, status, service, remove: "query" }),
        }
      : null,
    status !== "all"
      ? {
          label: status === "active" ? "Actief" : "Inactief",
          href: filterHref({ query, status, service, remove: "status" }),
        }
      : null,
    service !== "all"
      ? {
          label: `Dienst: ${service}`,
          href: filterHref({ query, status, service, remove: "service" }),
        }
      : null,
  ].filter((filter): filter is { label: string; href: string } => Boolean(filter));

  return (
    <PortalPageShell
      title="Mijn objecten"
      subtitle="Uw locaties, contactpersonen en toegangsinformatie."
      status={{ label: `${objects.length} objecten`, tone: objects.length > 0 ? "accent" : "neutral" }}
      primaryAction={{ label: "Object toevoegen", href: "/objecten/nieuw" }}
    >
      <PortalToolbar
        resultLabel={`${visibleObjects.length} van ${objects.length} objecten`}
        activeFilters={<PortalActiveFilterChips filters={activeFilters} clearHref="/objecten" />}
        actions={
          <PortalFilterSheet
            title="Objectfilters"
            description="Filter op status, dienst en locatiegegevens."
            activeCount={activeFilters.length}
          >
            <ObjectFilterForm
              query={query}
              status={status}
              service={service}
              serviceOptions={serviceOptions}
            />
          </PortalFilterSheet>
        }
      >
        <form action="/objecten" className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
          <PortalToolbarSearch
            name="q"
            defaultValue={query}
            placeholder="Zoek object, code of plaats"
          />
          <PortalToolbarSelect name="status" label="Status" defaultValue={status}>
            <option value="all">Alle statussen</option>
            <option value="active">Actief</option>
            <option value="inactive">Inactief</option>
          </PortalToolbarSelect>
          <input type="hidden" name="service" value={service} />
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-black text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Toepassen
          </button>
        </form>
      </PortalToolbar>

      <PortalDataList
        items={visibleObjects}
        columns={objectColumns()}
        getItemKey={(object) => object.id}
        tableLabel="Objecten"
        emptyState={{
          icon: <MapPin size={34} style={{ color: "var(--color-accent)" }} />,
          title: activeFilters.length > 0 ? "Geen objecten gevonden" : "Nog geen objecten",
          description:
            activeFilters.length > 0
              ? "Pas uw zoekopdracht of filters aan om de objecten opnieuw te bekijken."
              : "Voeg uw eerste locatie toe met adresgegevens, contactpersoon en vaste instructies.",
          action: (
            <Link
              href="/objecten/nieuw"
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black text-white"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              <Plus size={16} />
              Object toevoegen
            </Link>
          ),
        }}
        renderMobileCard={(object) => (
          <article
            className="rounded-2xl border bg-white p-4 shadow-sm"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="flex items-start gap-3">
              <ObjectIcon />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-black" style={{ color: "var(--color-primary)" }}>
                      {object.name}
                    </p>
                    <p
                      className="mt-0.5 font-mono text-xs font-black"
                      style={{ color: "var(--color-secondary)" }}
                    >
                      {object.code}
                    </p>
                  </div>
                  <ObjectStatusBadge active={object.isActive} />
                </div>
                {objectAddress(object) ? (
                  <p
                    className="mt-3 flex items-start gap-2 text-sm font-semibold leading-5"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    <MapPin size={15} className="mt-0.5 shrink-0" />
                    {objectAddress(object)}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {object.sectorName ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
                      {object.sectorName}
                    </span>
                  ) : null}
                  {object.serviceType ? (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">
                      {object.serviceType}
                    </span>
                  ) : null}
                  {object.accessInfo || object.keyInfo || object.alarmInfo ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700">
                      <KeyRound size={12} />
                      Toegang ingesteld
                    </span>
                  ) : null}
                </div>
                <div
                  className="mt-4 grid gap-2 text-xs font-bold sm:grid-cols-2"
                  style={{ color: "var(--color-secondary)" }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <UserRound size={14} className="shrink-0" />
                    <span className="truncate">
                      {object.contactName ?? "Geen contactpersoon"}
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <Phone size={14} className="shrink-0" />
                    <span className="truncate">
                      {object.contactPhone ?? "Geen telefoonnummer"}
                    </span>
                  </span>
                </div>
                <div
                  className="mt-4 flex items-center justify-between border-t pt-3"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <Link
                    href={`/objecten/${object.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-black"
                    style={{ color: "var(--color-accent)" }}
                  >
                    <ShieldCheck size={14} />
                    Gegevens beheren
                  </Link>
                  <PortalActionMenu label={`Acties voor ${object.name}`}>
                    <PortalActionMenuLink href={`/objecten/${object.id}`}>
                      Details bekijken
                    </PortalActionMenuLink>
                    <PortalActionMenuLink href={`/opdrachten/aanvragen?object=${object.id}`}>
                      Opdracht aanvragen
                    </PortalActionMenuLink>
                  </PortalActionMenu>
                </div>
              </div>
            </div>
          </article>
        )}
      />
    </PortalPageShell>
  );
}

function ObjectFilterForm({
  query,
  status,
  service,
  serviceOptions,
}: {
  query: string;
  status: ObjectStatusFilter;
  service: string;
  serviceOptions: string[];
}) {
  return (
    <form action="/objecten" className="space-y-4">
      <FilterField label="Zoeken" id="object-filter-query">
        <input
          id="object-filter-query"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Object, code, plaats of contact"
          className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-semibold outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        />
      </FilterField>
      <FilterField label="Status" id="object-filter-status">
        <select
          id="object-filter-status"
          name="status"
          defaultValue={status}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-black outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        >
          <option value="all">Alle statussen</option>
          <option value="active">Actief</option>
          <option value="inactive">Inactief</option>
        </select>
      </FilterField>
      <FilterField label="Dienst" id="object-filter-service">
        <select
          id="object-filter-service"
          name="service"
          defaultValue={service}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-black outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        >
          <option value="all">Alle diensten</option>
          {serviceOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </FilterField>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <Link
          href="/objecten"
          className="inline-flex h-10 items-center justify-center rounded-xl border text-sm font-black"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        >
          Wissen
        </Link>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-xl text-sm font-black text-white"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          Toepassen
        </button>
      </div>
    </form>
  );
}

function FilterField({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-black" style={{ color: "var(--color-secondary)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ObjectIcon() {
  return (
    <span
      className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: "rgba(0,183,179,0.10)" }}
    >
      <Building2 size={18} style={{ color: "var(--color-accent)" }} />
    </span>
  );
}

function ObjectStatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black"
      style={{
        backgroundColor: active ? "#E8FBFA" : "#F1F5F9",
        color: active ? "#087C79" : "#64748B",
      }}
    >
      {active ? "Actief" : "Inactief"}
    </span>
  );
}
