"use client";
import { ActionIcon, ActionLink } from "../action-icon";
import { EmptyState } from "../empty-state";
import { PageHeading } from "../page-heading";
import { ListPagination } from "../list-pagination";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  Pencil,
  Trash2,
  MoreHorizontal,
  Plus,
  Search,
  ArrowDownAZ,
} from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import type { TenantContext } from "@/lib/auth/context";
import {
  customerStates,
  customerTypes,
  type CustomerList,
  type CustomerFilters,
  type Owner,
} from "@/lib/customers/model";
import { customerCommand } from "@/app/app/klanten/actions";
import { CustomerWizard } from "./forms";
import { customerScroll, rememberCustomerScroll } from "@/lib/auth/browser-state";
import { CompactFilterMenu } from "../compact-filter-menu";

export function CustomersList({
  data,
  filters,
  owners,
  tenant,
  defaultPaymentTermsDays,
  create = false,
}: {
  data: CustomerList;
  filters: CustomerFilters;
  owners: Owner[];
  tenant: TenantContext;
  defaultPaymentTermsDays: number;
  create?: boolean;
}) {
  const router = useRouter(),
    params = useSearchParams(),
    path = usePathname();
  const [wizard, setWizard] = useState(create),
    [pending, start] = useTransition();
  const back = `${path}${params.size ? `?${params}` : ""}`,
    key = `${tenant.id}:${back}`;
  useEffect(() => {
    const y = customerScroll(key);
    if (y) window.scrollTo(0, Number(y));
  }, [key]);
  const remember = () => rememberCustomerScroll(key, window.scrollY);
  const href = (id: string, edit = false) =>
    `/app/klanten/${id}?return=${encodeURIComponent(back)}${edit ? "&edit=1" : ""}`;
  const remove = (c: CustomerList["rows"][number], archive: boolean) => {
    if (
      !confirm(
        archive
          ? "Deze klant archiveren? Alle historie blijft behouden."
          : "Deze ongebruikte klant verwijderen? Bij gekoppelde gegevens moet je archiveren.",
      )
    )
      return;
    start(async () => {
      const r = await customerCommand(
        archive ? "customer_archive" : "customer_delete",
        { id: c.id, version: c.version },
        crypto.randomUUID(),
      );
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(archive ? "Klant gearchiveerd" : "Klant verwijderd");
        router.refresh();
      }
    });
  };
  const canDelete = tenant.roles.some((r) =>
    ["tenant_admin", "management"].includes(r),
  );
  const activeFilters = Object.entries(filters).filter(
    ([k, v]) => !["page", "pageSize", "sort"].includes(k) && v,
  );
  const active = activeFilters.length > 0;
  const columnSort: Record<string, string> = {"Nummer / klant":"name",Status:"status",Plaats:"city","Volgende afspraak":"next_visit",Aandacht:"attention"};
  return (
    <div className="customer-workspace">
      <PageHeading eyebrow="RELATIES" title="Klanten" help="Relaties, contactpersonen en opvolging. Open een klant voor het volledige dossier." actions={<>
        <CompactFilterMenu activeCount={activeFilters.length} contentClassName="customer-filter-popover">
      <form
        className="customer-toolbar"
        aria-label="Klanten filteren"
        onSubmit={(e) => {
          e.preventDefault();
          const p = new URLSearchParams();
          p.set("pageSize", String(filters.pageSize));
          new FormData(e.currentTarget).forEach((v, k) => {
            if (v) p.set(k, String(v));
          });
          router.push(`${path}?${p}`);
        }}
      >
        <label className="customer-search">
          <span>
            <Search size={15} />
            Zoeken
          </span>
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Naam, nummer, contact of plaats…"
          />
        </label>
        <label>
          Status
          <select name="status" defaultValue={filters.status}>
            <option value="">Alle statussen</option>
            {Object.entries(customerStates).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select name="type" defaultValue={filters.type}>
            <option value="">Alle typen</option>
            {Object.entries(customerTypes).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Plaats
          <input name="city" defaultValue={filters.city} />
        </label>
        <label>
          Verantwoordelijke
          <select name="owner" defaultValue={filters.owner}>
            <option value="">Iedereen</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dienst
          <input name="service" defaultValue={filters.service} />
        </label>
        <label>
          Aandacht / selectie
          <select name="attention" defaultValue={filters.attention}>
            <option value="">Alle klanten</option>
            <option value="objects">Met actieve objecten</option>
            <option value="requests">Open aanvragen</option>
            <option value="commercial">Commerciële deadline</option>
            <option value="actions">Open opvolgacties</option>
            {data.finance && (
              <option value="finance">Openstaande facturen</option>
            )}
          </select>
        </label>
        <label>
          Sortering
          <select name="sort" defaultValue={filters.sort}>
            <option value="name">Naam A–Z</option>
            <option value="name_desc">Naam Z–A</option>
            <option value="number">Klantnummer</option>
            <option value="city">Plaats</option>
            <option value="status">Status</option>
            <option value="next_visit">Eerstvolgende afspraak</option>
            <option value="attention">Aandacht eerst</option>
          </select>
        </label>
        <div className="object-actions">
          <button className="secondary-button">Filters toepassen</button>
          {active && (
            <Link className="text-link" href="/app/klanten">
              Filters wissen
            </Link>
          )}
        </div>
      </form>
        </CompactFilterMenu>
        <ActionIcon className="primary-button" label="Nieuwe klant" icon={<Plus size={17}/>} onClick={() => setWizard(true)}/>
      </>}/>
      <section className="panel resource-table-panel" aria-label="Klantenlijst">
        <div className="table-scroll">
          <table className="resource-table customer-table">
            <thead>
              <tr>
                {[
                  "Nummer / klant",
                  "Type",
                  "Status",
                  "Plaats",
                  "Primair contact",
                  "Verantwoordelijke",
                  "Actieve objecten",
                  "Volgende afspraak",
                  "Aandacht",
                  ...(data.finance ? ["Financieel"] : []),
                  "Acties",
                ].map(t => {
                  const sort=columnSort[t];
                  const selected=filters.sort===sort || sort==="name" && filters.sort==="name_desc";
                  return <th key={t} scope="col" aria-sort={sort ? selected ? filters.sort==="name_desc" || filters.sort==="attention" ? "descending" : "ascending" : "none" : undefined}>
                    {sort ? <button onClick={() => {
                      const p=new URLSearchParams(params);
                      p.set("sort",sort==="name" && filters.sort==="name" ? "name_desc" : sort);
                      p.delete("page");
                      router.push(`${path}?${p}`);
                    }}>{t}<ArrowDownAZ size={14}/></button> : t}
                  </th>;
                })}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link onClick={remember} href={href(c.id)}>
                      <strong>{c.name}</strong>
                    </Link>
                    <small>{c.customer_number}</small>
                  </td>
                  <td>{customerTypes[c.customer_type]}</td>
                  <td>
                    <span
                      className={`resource-status resource-status-${c.status === "active" ? "green" : "neutral"}`}
                    >
                      {customerStates[c.status]}
                    </span>
                  </td>
                  <td>{c.city || "Nog aanvullen"}</td>
                  <td>{c.contact || "Niet vastgelegd"}</td>
                  <td>
                    {owners.find((o) => o.id === c.owner_user_id)?.label ||
                      "Nog toewijzen"}
                  </td>
                  <td>{c.objects}</td>
                  <td>
                    {c.next_visit
                      ? new Intl.DateTimeFormat("nl-NL", {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: tenant.timezone,
                        }).format(new Date(c.next_visit))
                      : "Nog geen afspraak"}
                  </td>
                  <td>
                    {c.requests + c.actions
                      ? `${c.requests} aanvragen · ${c.actions} acties`
                      : "Geen open acties"}
                  </td>
                  {data.finance && (
                    <td>
                      {c.financial_attention
                        ? `${c.financial_attention} openstaand`
                        : "Geen openstaande facturen"}
                    </td>
                  )}
                  <td>
                    <div className="resource-actions">
                      <ActionLink className="resource-action" label="Bekijk" title={`Bekijk ${c.name}`} icon={<Eye size={14}/>} onClick={remember} href={href(c.id)}/>
                      <ActionLink className="resource-action" label="Bewerk" title={`Bewerk ${c.name}`} icon={<Pencil size={14}/>} onClick={remember} href={href(c.id, true)}/>
                      {canDelete && <ActionIcon className="resource-action danger" label="Verwijder" title={`Verwijder ${c.name}`} icon={<Trash2 size={14}/>} disabled={pending} onClick={() => remove(c, false)}/>}
                      <Popover>
                        <PopoverTrigger asChild>
                          <ActionIcon className="resource-action" label="Meer" title={`Meer acties voor ${c.name}`} icon={<MoreHorizontal size={14}/>} />
                        </PopoverTrigger>
                        <PopoverContent
                          className="resource-more-content"
                          aria-label="Meer informatie en acties"
                          align="end"
                        >
                          <Link
                            href={`/app/klanten/${c.id}?tab=contactpersonen`}
                          >
                            Contactpersonen beheren
                          </Link>
                          <Link href={`/app/objecten?new=1&customer=${c.id}`}>
                            Nieuw object
                          </Link>
                          <Link
                            href={`/app/aanvragen?new=request&customer=${c.id}`}
                          >
                            Nieuwe aanvraag
                          </Link>
                          {canDelete && c.status !== "archived" && (
                            <button
                              disabled={pending}
                              onClick={() => remove(c, true)}
                            >
                              Relatie archiveren
                            </button>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.rows.length && (
          <EmptyState title={active ? "Geen resultaten voor deze filters" : "Nog geen klanten"} description={active ? "Pas je zoekopdracht aan of wis de filters." : "Gebruik de plusknop bovenaan om een klant of prospect toe te voegen."}/>
        )}
      </section>
      <ListPagination total={data.total} page={data.page} pageSize={data.pageSize ?? filters.pageSize} noun="klanten" preferenceKey={`backoffice:${tenant.id}:customers`} href={back}/>
      {wizard && (
        <CustomerWizard
          tenant={tenant}
          owners={owners}
          defaultPaymentTermsDays={defaultPaymentTermsDays}
          onClose={() => setWizard(false)}
        />
      )}
    </div>
  );
}
