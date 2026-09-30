"use client";
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
    key = `customer-scroll:${back}`;
  useEffect(() => {
    const y = sessionStorage.getItem(key);
    if (y) window.scrollTo(0, Number(y));
  }, [key]);
  const remember = () => sessionStorage.setItem(key, String(window.scrollY));
  const href = (id: string, edit = false) =>
    `/app/klanten/${id}?return=${encodeURIComponent(back)}${edit ? "&edit=1" : ""}`;
  const page = (next: number) => {
    const p = new URLSearchParams(params);
    p.set("page", String(next));
    router.push(`${path}?${p}`, { scroll: false });
  };
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
  const active = Object.entries(filters).some(
    ([k, v]) => !["page", "sort"].includes(k) && v,
  );
  return (
    <div className="customer-workspace">
      <header className="commercial-heading page-intro resource-intro">
        <div>
          <span className="eyebrow">RELATIES</span>
          <h1>Klanten</h1>
          <p>
            Relaties, contactpersonen en opvolging. Open een klant voor het
            volledige dossier.
          </p>
        </div>
        <button className="primary-button" onClick={() => setWizard(true)}>
          <Plus size={17} />
          Nieuwe klant
        </button>
      </header>
      <form
        className="panel customer-toolbar"
        aria-label="Klanten filteren"
        onSubmit={(e) => {
          e.preventDefault();
          const p = new URLSearchParams();
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
                ].map((t, i) => (
                  <th key={t}>
                    {i === 0 ? (
                      <button
                        onClick={() => {
                          const p = new URLSearchParams(params);
                          p.set(
                            "sort",
                            filters.sort === "name" ? "name_desc" : "name",
                          );
                          p.delete("page");
                          router.push(`${path}?${p}`);
                        }}
                      >
                        {t}
                        <ArrowDownAZ size={14} />
                      </button>
                    ) : (
                      t
                    )}
                  </th>
                ))}
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
                      <Link
                        className="resource-action"
                        onClick={remember}
                        href={href(c.id)}
                      >
                        <Eye size={13} />
                        <span>Bekijk</span>
                      </Link>
                      <Link
                        className="resource-action"
                        onClick={remember}
                        href={href(c.id, true)}
                      >
                        <Pencil size={13} />
                        <span>Bewerk</span>
                      </Link>
                      {canDelete && (
                        <button
                          className="resource-action danger"
                          disabled={pending}
                          onClick={() => remove(c, false)}
                        >
                          <Trash2 size={13} />
                          <span>Verwijder</span>
                        </button>
                      )}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="resource-action">
                            <MoreHorizontal size={13} />
                            <span>Meer</span>
                          </button>
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
          <div className="resource-empty">
            <Search size={26} />
            <strong>
              {active
                ? "Geen resultaten voor deze filters"
                : "Nog geen klanten"}
            </strong>
            <span>
              {active
                ? "Pas je zoekopdracht aan of wis de filters."
                : "Maak een eerste klant of prospect aan."}
            </span>
          </div>
        )}
        <footer className="object-pagination">
          <span>
            {data.total} {data.total === 1 ? "klant" : "klanten"} · pagina{" "}
            {data.page} van {Math.max(1, Math.ceil(data.total / 25))}
          </span>
          <button
            className="resource-action"
            disabled={data.page <= 1}
            onClick={() => page(data.page - 1)}
          >
            Vorige
          </button>
          <button
            className="resource-action"
            disabled={data.page * 25 >= data.total}
            onClick={() => page(data.page + 1)}
          >
            Volgende
          </button>
        </footer>
      </section>
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
