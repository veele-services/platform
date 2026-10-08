"use client";
import { DossierNavigation } from "../dossier-navigation";
import { DossierActions } from "../dossier-actions";
import { PageHeading } from "../page-heading";
import { EmptyState } from "../empty-state";
import { ActionIcon, ActionLink } from "../action-icon";
import "../dossier-consistency.css";
import { ContentSection } from "../content-section";
import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Pencil,
  CalendarDays,
  Building2,
  ListChecks,
  Wallet,
  MoreHorizontal,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { TenantContext } from "@/lib/auth/context";
import {
  customerTabs,
  customerStates,
  customerTypes,
  contactLabels,
  documentCategories,
  canReadFinance,
  type CustomerData,
  type CustomerTab,
  type CustomerDocument,
} from "@/lib/customers/model";
import {
  addressLine,
  objectTypes,
  objectStates,
  recordStates,
  type Row,
} from "@/lib/objects/model";
import { businessToday } from "@/lib/personnel/dossier";
import { commercialDate, money } from "@/lib/commercial/model";
import { executionLabels, isClosedAction } from "@/lib/dossiers/status";
import {
  CustomerWizard,
  ContactEditor,
  CustomerDialog,
  CommunicationForm,
} from "./forms";
import { CustomerAgreements } from "./agreements";
import { CommercialDossierPanel } from "../commercial/dossier-panel";
import { DossierChainPanel } from "../dossier-chain";
import { TicketContextPanel } from "../tickets/context";
import { ObjectForm } from "../objects/forms";
import { uploadCustomerDocument } from "@/app/app/operations-actions";
import { customerCommand, updateCustomerDocumentMetadata } from "@/app/app/klanten/actions";
import { CUSTOMER_DOCUMENT_ACCEPT } from "@/lib/customers/documents";
import { CustomerPortalAccess } from "./portal-access";
import { CompactFilterMenu } from "../compact-filter-menu";

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <EmptyState title={title} description={children}/>;
}
export function CustomerDossier({
  data,
  tenant,
  tab,
  back,
  edit = false,
}: {
  data: CustomerData;
  tenant: TenantContext;
  tab: CustomerTab;
  back: string;
  edit?: boolean;
}) {
  const c = data.customer,
    router = useRouter();
  const [editing, setEditing] = useState(edit),
    [contact, setContact] = useState<Row<"customer_contacts"> | "new" | null>(
      null,
    ),
    [doc, setDoc] = useState<CustomerDocument | "new" | null>(null),
    [communication, setCommunication] = useState(false),
    [pending, start] = useTransition();
  const [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [object, setObject] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [service, setService] = useState(""),
    [calendar, setCalendar] = useState(false);
  const finance =
      canReadFinance(tenant.roles) &&
      tenant.enabledServices.includes("finance"),
    commercial = canReadFinance(tenant.roles),
    today = businessToday(new Date(), tenant.timezone);
  const href = (target: CustomerTab) =>
    `/app/klanten/${c.id}?tab=${target}&return=${encodeURIComponent(back)}`;
  const date = (s: string | null | undefined) =>
    commercialDate(s, tenant.timezone, Boolean(s?.includes("T")));
  const billing = (c.billing_preferences ?? {}) as Record<
    string,
    string | boolean
  >;
  const owner = (id: string | null) =>
    data.owners.find((o) => o.id === id)?.label || "Nog toewijzen";
  const activeObjects = data.objects.filter(
      (o) => o.dossier_status === "active",
    ),
    programmes = data.records.filter(
      (r) => r.kind === "programme" && r.state === "active",
    );
  const nextOrders = data.orders
    .filter(
      (o) =>
        o.projected_start_at &&
        o.projected_start_at >= new Date().toISOString() &&
        o.status !== "cancelled",
    )
    .sort((a, b) => a.projected_start_at!.localeCompare(b.projected_start_at!));
  const actions = data.chain.actions.filter((a) => !isClosedAction(a.status));
  const notes = data.notes.filter(
    (n) => n.kind === "action" && n.state === "open",
  );
  const dueContracts = data.agreements.filter(
    (a) =>
      a.state === "active" &&
      !data.agreements.some(
        (n) => n.previous_id === a.id && n.state === "active",
      ) &&
      [a.review_on, a.notice_on, a.renewal_on, a.ends_on].some(
        (d) => d && d <= today,
      ),
  );
  const staleDocs = data.documents.filter(
    (d) =>
      !d.archived &&
      d.valid_until &&
      d.valid_until < today &&
      !data.documents.some((n) => n.previous_id === d.id),
  );
  const activeContacts = data.contacts.filter(
    (p) =>
      p.active &&
      (!p.active_from || p.active_from <= today) &&
      (!p.active_until || p.active_until >= today),
  );
  const primary = activeContacts.find((p) => p.is_primary) || activeContacts[0];
  const openInvoices = data.invoices.filter(
    (i) =>
      !["draft", "paid", "void", "credited"].includes(i.status) &&
      i.total_cents > i.paid_cents,
  );
  const complete = (id: string, version: number) =>
    start(async () => {
      const r = await customerCommand(
        "note_complete",
        { id, version },
        crypto.randomUUID(),
      );
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  const toolbar = (children?: ReactNode) => (
    <div className="compact-filter-bar customer-dossier-filter">
      <span className="compact-filter-result">Overzicht verfijnen</span>
      <CompactFilterMenu activeCount={[q, status, object, from, to, service].filter(Boolean).length}>
        <div className="compact-filter-grid">
          <label className="wide">
            Zoeken
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Zoeken in dit tabblad…"
            />
          </label>
          {children}
        </div>
      </CompactFilterMenu>
    </div>
  );
  const selectedObjects = data.objects.filter(
    (o) =>
      (!status || o.dossier_status === status) &&
      `${o.name} ${o.object_number} ${addressLine(o.address)}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const selectedOrders = data.orders.filter(
    (o) =>
      (!status || o.status === status) &&
      (!object || o.object_id === object) &&
      (!service || o.discipline === service) &&
      (!from ||
        (!!o.projected_start_at &&
          businessToday(new Date(o.projected_start_at), tenant.timezone) >=
            from)) &&
      (!to ||
        (!!o.projected_start_at &&
          businessToday(new Date(o.projected_start_at), tenant.timezone) <=
            to)) &&
      `${o.work_order_number} ${o.discipline} ${data.objects.find((x) => x.id === o.object_id)?.name}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const quality = data.records.filter(
    (r) =>
      r.kind === "quality" &&
      (!status || r.state === status) &&
      (!object || r.object_id === object) &&
      `${r.title} ${r.body}`.toLowerCase().includes(q.toLowerCase()),
  );
  const selectedContacts = data.contacts.filter(
    (p) =>
      (!status || p.active === (status === "active")) &&
      `${p.full_name} ${p.email} ${p.role}`.toLowerCase().includes(q.toLowerCase()),
  );
  const selectedInvoices = data.invoices.filter(
    (i) =>
      (!status || i.status === status) &&
      (i.invoice_number || "concept").toLowerCase().includes(q.toLowerCase()) &&
      (!object || data.invoiceLines.some(
        (l) => l.invoice_id === i.id && data.orders.some(
          (w) => w.id === l.work_order_id && w.object_id === object,
        ),
      )),
  );
  const selectedDocuments = data.documents.filter(
    (d) => (!status || d.category === status) && d.title.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="customer-dossier object-dossier">
      <Link className="dossier-back" href={back}>
        <ArrowLeft size={16} />
        Terug naar klanten
      </Link>
      <PageHeading eyebrow={`${c.customer_number} · ${customerTypes[c.customer_type]}`} title={c.name} description={<div className="dossier-heading-facts"><span className="resource-status">{customerStates[c.status]}</span><span>Verantwoordelijke: {owner(c.owner_user_id)}</span><span>Primair contact: {primary?.full_name || "Nog vastleggen"}</span></div>} actions={<DossierActions primary={<ActionIcon className="primary-button" label="Document toevoegen" icon={<Plus size={16}/>} onClick={() => setDoc("new")}/>}>
          <button className="secondary-button" onClick={() => setEditing(true)}>
            <Pencil size={15} />
            Bewerken
          </button>
          <button
            className="secondary-button"
            onClick={() => setContact("new")}
          >
            <Plus size={15} />
            Contactpersoon
          </button>
          <Link
            className="secondary-button"
            href={`/app/objecten?new=1&customer=${c.id}`}
          >
            <Building2 size={15} />
            Object toevoegen
          </Link>
          <Popover>
            <PopoverTrigger asChild>
              <button className="resource-action">
                <MoreHorizontal size={15} />
                Meer
              </button>
            </PopoverTrigger>
            <PopoverContent className="resource-more-content" align="end">
              <Link
                href={`/app/aanvragen?new=request&customer=${c.id}&return=${encodeURIComponent(href("offertes"))}`}
              >
                Nieuwe aanvraag
              </Link>
              <Link
                href={`/app/aanvragen?new=quote&tab=quotes&customer=${c.id}&return=${encodeURIComponent(href("offertes"))}`}
              >
                Nieuwe offerte
              </Link>
              <button onClick={() => setCommunication(true)}>
                Communicatie / actie vastleggen
              </button>
            </PopoverContent>
          </Popover>
        </DossierActions>}/>
      <div className="dossier-tabbed-content">
      <DossierNavigation label="Klantdossier" current={tab} tabs={customerTabs.map(([id,title])=>({id,title,href:href(id)}))}/>
      <div className="dossier-tab-surface">
      {tab === "overzicht" && (
        <>
          <div className="customer-overview-cards">
            {[
              {
                title: "Actieve dienstverlening",
                value: programmes.length,
                detail: `${activeObjects.length} actieve objecten`,
                tab: "objecten",
                icon: <Building2 />,
              },
              {
                title: "Komende bezoeken",
                value: nextOrders.length,
                detail: nextOrders[0]
                  ? date(nextOrders[0].projected_start_at)
                  : "Nog geen bezoek gepland",
                tab: "afspraken",
                icon: <CalendarDays />,
              },
              {
                title: "Acties & aandacht",
                value:
                  actions.length +
                  notes.length +
                  dueContracts.length +
                  staleDocs.length +
                  data.commercialFollowup.length,
                detail: "Verzoeken, deadlines en ontbrekende opvolging",
                tab: "communicatie",
                icon: <ListChecks />,
              },
              {
                title: "Financieel",
                value: finance
                  ? money(
                      openInvoices.reduce(
                        (sum, i) => sum + i.total_cents - i.paid_cents,
                        0,
                      ),
                    )
                  : "Afgeschermd",
                detail: finance
                  ? `${openInvoices.length} openstaande facturen`
                  : "Geen financiële toegang",
                tab: "facturen",
                icon: <Wallet />,
              },
            ].map((card) => (
              <Link
                className="dossier-card customer-overview-card"
                href={href(card.tab as CustomerTab)}
                key={card.title}
              >
                {card.icon}
                <span>{card.title}</span>
                <strong>{card.value}</strong>
                <small>{card.detail}</small>
              </Link>
            ))}
          </div>
          <ContentSection title={"Aandacht & opvolging"} description={"Open de bronregistratie om een afspraak of actie bij te werken."} actions={<button
                className="secondary-button"
                onClick={() => setCommunication(true)}
              >
                Actie toevoegen
              </button>} bodyClassName="dossier-section-body">

            {!c.owner_user_id && (
              <p className="dossier-notice">
                Accountverantwoordelijke ontbreekt.{" "}
                <button className="text-link" onClick={() => setEditing(true)}>
                  Klantgegevens aanvullen
                </button>
              </p>
            )}
            {!primary && (
              <p className="dossier-notice">
                Nog geen actieve contactpersoon.{" "}
                <button className="text-link" onClick={() => setContact("new")}>
                  Contactpersoon toevoegen
                </button>
              </p>
            )}
            {actions.slice(0, 12).map((a) => (
              <Link
                className="dossier-event"
                key={`${a.kind}:${a.id}`}
                href={a.href}
              >
                <div>
                  <strong>{a.title}</strong>
                  <small>
                    {owner(a.owner_id)} · deadline {date(a.due_on)}
                  </small>
                </div>
                <span>Openen →</span>
              </Link>
            ))}
            {notes.map((n) => (
              <div className="dossier-event" key={n.id}>
                <div>
                  <strong>{n.title || "Opvolgactie"}</strong>
                  <p>{n.body}</p>
                  <small>
                    {owner(n.owner_user_id)} · {date(n.due_on)}
                  </small>
                </div>
                <button
                  className="resource-action"
                  disabled={pending}
                  onClick={() => complete(n.id, n.version)}
                >
                  Afronden
                </button>
              </div>
            ))}
            {dueContracts.map((a) => (
              <Link
                className="dossier-event"
                key={a.id}
                href={href("contracten")}
              >
                {a.title} · contractdeadline beoordelen →
              </Link>
            ))}
            {data.commercialFollowup.slice(0, 12).map((r) => (
              <Link
                className="dossier-event"
                key={r.id}
                href={`/app/aanvragen?tab=${r.tab}&kind=${r.source_kind}&record=${r.id}&customer=${c.id}&return=${encodeURIComponent(href("offertes"))}`}
              >
                <div>
                  <strong>
                    {r.number} · {r.subject}
                  </strong>
                  <p>{r.next_action || "Opvolging beoordelen"}</p>
                  <small>
                    {r.owner || "Nog toewijzen"} · {date(r.followup_on)}
                  </small>
                </div>
                <span>Opvolgen →</span>
              </Link>
            ))}
            {data.commercialFollowup.length > 12 && (
              <Link href={href("offertes")}>
                Alle commerciële opvolging bekijken →
              </Link>
            )}
            {staleDocs.map((d) => (
              <Link
                className="dossier-event"
                key={d.id}
                href={href("documenten")}
              >
                {d.title} · geldigheid verlopen →
              </Link>
            ))}
            {!actions.length &&
              !notes.length &&
              !dueContracts.length &&
              !staleDocs.length &&
              !data.commercialFollowup.length && (
                <Empty title="Alles bijgewerkt">Geen open dossieracties of verstreken deadlines.</Empty>
              )}
          </ContentSection>
          <ContentSection title={"Recente activiteit"} description={"Zakelijke registraties en wijzigingen binnen deze klantrelatie."} bodyClassName="dossier-section-body">
            {" "}
            {data.notes.slice(0, 3).map((n) => (
              <article className="dossier-event" key={n.id}>
                <div>
                  <strong>{n.title || "Interne notitie"}</strong>
                  <p>{n.body}</p>
                  <small>{date(n.created_at)}</small>
                </div>
              </article>
            ))}
            {data.history.slice(0, 5).map((h) => (
              <p key={h.id}>
                {historyLabel(h.source)}{" "}
                {h.action === "created" ? "toegevoegd" : "bijgewerkt"} ·{" "}
                {h.actor} · {date(h.at)}
              </p>
            ))}
            {!data.notes.length && !data.history.length && <Empty title="Nog geen activiteit">Zakelijke registraties en wijzigingen verschijnen hier zodra ze zijn vastgelegd.</Empty>}
            <Link className="text-link" href={href("communicatie")}>
              Volledige tijdlijn →
            </Link>
          </ContentSection>
        </>
      )}
      {tab === "gegevens" && (
        <ContentSection title={"Klantgegevens"} description={"De relatiegegevens worden hergebruikt in de bestaande klant-, offerte- en facturatiestroom."} actions={<button
              className="secondary-button"
              onClick={() => setEditing(true)}
            >
              Gegevens bewerken
            </button>} bodyClassName="dossier-section-body">

          <dl className="customer-facts">
            {[
              ["Klantnummer", c.customer_number],
              ["Klanttype", customerTypes[c.customer_type]],
              ["Juridische naam", c.legal_name],
              ["Handelsnaam", c.trade_name],
              ["Algemeen e-mailadres", c.email],
              ["Telefoon", c.phone],
              ["Website", c.website],
              ["KvK-nummer", c.company_number],
              ["Btw-nummer", c.vat_number],
              ["Bezoekadres", addressLine(c.visit_address)],
              ["Factuuradres", addressLine(c.billing_address)],
              ["Factuurmail", c.billing_email],
              [
                "Factuurkanaal",
                {
                  email: "E-mail",
                  portal: "Klantportaal",
                  post: "Post (handmatig)",
                }[String(billing.channel) as "email" | "portal" | "post"] ||
                  "E-mail",
              ],
              ["Factuurcontact / afdeling", String(billing.contact || "")],
              ["Referentie / inkoopnummer", String(billing.reference || "")],
              [
                "Referentie verplicht",
                billing.referenceRequired ? "Ja" : "Nee",
              ],
              ["Kostenplaats", String(billing.costCenter || "")],
              [
                "Betaaltermijn",
                `${c.payment_terms_days ?? data.defaultPaymentTermsDays} dagen`,
              ],
              ["Relatie sinds", date(c.relationship_since)],
              ["Relatiestatus", customerStates[c.status]],
              ["Accountverantwoordelijke", owner(c.owner_user_id)],
              ["Diensten", c.services.join(", ")],
              ["Voorkeuren", c.preferences],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || "Niet ingevuld"}</dd>
              </div>
            ))}
          </dl>
          <p className="dossier-muted">
            Gegevensversie {c.version} · bijgewerkt {date(c.updated_at)}.
            Afgesloten documenten behouden hun eigen aangeboden gegevens.
          </p>
        </ContentSection>
      )}
      {tab === "contactpersonen" && tenant.roles.some(role=>["tenant_admin","management"].includes(role)) && <CustomerPortalAccess key={c.id} customerId={c.id} contacts={data.contacts}/> }
      {tab === "contactpersonen" && (
        <ContentSection title={"Contactpersonen"} description={"Functionele labels zijn geen portaalrechten of onbeperkte toestemming voor meerwerk."} actions={<ActionIcon className="primary-button" label="Contactpersoon toevoegen" icon={<Plus size={16}/>} onClick={() => setContact("new")}/>} bodyClassName="dossier-section-body">

          {toolbar(
            <label>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Alle contacten</option>
                <option value="active">Actief</option>
                <option value="inactive">Niet actief</option>
              </select>
            </label>,
          )}
          <div className="table-scroll">
            <table className="resource-table">
              <thead>
                <tr>
                  {[
                    "Naam / functie",
                    "Contactgegevens",
                    "Bereikbaarheid",
                    "Functionele labels",
                    "Objecten",
                    "Actief",
                    "Acties",
                  ].map((s) => (
                    <th key={s} scope="col">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedContacts.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.full_name}</strong>
                        <small>
                          {p.role} {p.is_primary && "· Primair contact"}
                        </small>
                        {p.organization}
                      </td>
                      <td>
                        {p.email || "—"}
                        <small>{p.phone}</small>
                      </td>
                      <td>{p.availability || "Niet vastgelegd"}</td>
                      <td>
                        {p.labels.map((l) => contactLabels[l]).join(", ") ||
                          "—"}
                      </td>
                      <td>
                        {p.object_ids
                          .map(
                            (id) => data.objects.find((o) => o.id === id)?.name,
                          )
                          .filter(Boolean)
                          .join(", ") || "Algemeen"}
                      </td>
                      <td>
                        {p.active ? "Actief" : "Niet actief"}
                        <small>
                          {date(p.active_from)} – {date(p.active_until)}
                        </small>
                      </td>
                      <td>
                        <button
                          className="resource-action"
                          onClick={() => setContact(p)}
                        >
                          <Pencil size={13} />
                          Bewerk
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!selectedContacts.length && (
            <Empty title={data.contacts.length ? "Geen contactpersonen gevonden" : "Nog geen contactpersonen"}>{data.contacts.length ? "Geen contactpersonen voor deze selectie. Pas de filters aan." : "Nog geen contactpersonen vastgelegd."}</Empty>
          )}
        </ContentSection>
      )}
      {tab === "objecten" && (
        <ContentSection title={"Objecten"} description={"Fysieke locaties van deze klant; het factuuradres is geen uitvoeringsadres."} actions={<ActionLink className="primary-button" label="Nieuw object" icon={<Plus size={16}/>} href={`/app/objecten?new=1&customer=${c.id}`}/>} bodyClassName="dossier-section-body">

          {toolbar(
            <label>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Alle statussen</option>
                {Object.entries(objectStates).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>,
          )}
          <div className="table-scroll">
            <table className="resource-table">
              <thead>
                <tr>
                  {[
                    "Nummer / object",
                    "Adres",
                    "Type",
                    "Status",
                    "Diensten",
                    "Volgend bezoek",
                    "Aandacht",
                    "Acties",
                  ].map((s) => (
                    <th key={s} scope="col">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedObjects.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/app/objecten/${o.id}`}>
                        <strong>{o.name}</strong>
                      </Link>
                      <small>{o.object_number}</small>
                    </td>
                    <td>{addressLine(o.address) || "Adres ontbreekt"}</td>
                    <td>
                      {objectTypes[o.object_type as keyof typeof objectTypes]}
                    </td>
                    <td>
                      {
                        objectStates[
                          o.dossier_status as keyof typeof objectStates
                        ]
                      }
                    </td>
                    <td>
                      {[
                        ...new Set(
                          programmes
                            .filter((p) => p.object_id === o.id)
                            .map((p) => p.service)
                            .filter(Boolean),
                        ),
                      ].join(", ") || "Nog geen programma"}
                    </td>
                    <td>
                      {date(
                        nextOrders.find((w) => w.object_id === o.id)
                          ?.projected_start_at,
                      )}
                    </td>
                    <td>
                      {actions.filter((a) => a.object_id === o.id).length}{" "}
                      acties
                    </td>
                    <td>
                      <Link
                        className="resource-action"
                        href={`/app/objecten/${o.id}`}
                      >
                        Bekijk object
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!selectedObjects.length && (
            <Empty title="Geen objecten gevonden">Geen objecten bij deze selectie.</Empty>
          )}
        </ContentSection>
      )}
      {tab === "contracten" &&
        (commercial ? (
          <CustomerAgreements data={data} tenant={tenant} />
        ) : (
          <section className="dossier-card">
            <p className="dossier-notice">
              Contractprijzen en akkoordbewijzen zijn afgeschermd. Raadpleeg de
              accountverantwoordelijke.
            </p>
          </section>
        ))}
      {tab === "afspraken" && (
        <>
          <ContentSection title={"Afspraken & opdrachten"} description={"Dezelfde concrete bezoeken als op het planbord. Uitvoering, akkoord en betaling behouden elk hun eigen status."} actions={<>
                <button
                  className="secondary-button"
                  onClick={() => setCalendar((v) => !v)}
                >
                  {calendar ? "Lijstweergave" : "Agendaweergave"}
                </button>
                <Link className="primary-button" href="/app/planning">
                  Planbord openen
                </Link>
              </>} bodyClassName="dossier-section-body">

            {toolbar(
              <>
                <label>
                  Object
                  <select
                    value={object}
                    onChange={(e) => setObject(e.target.value)}
                  >
                    <option value="">Alle objecten</option>
                    {data.objects.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">Alle statussen</option>
                    {Object.entries(executionLabels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Dienst
                  <select
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                  >
                    <option value="">Alle diensten</option>
                    {[...new Set(data.orders.map((o) => o.discipline))].map(
                      (d) => (
                        <option key={d}>{d}</option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Vanaf
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  Tot en met
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </>,
            )}
            {calendar ? (
              <div className="customer-agenda">
                {[...selectedOrders]
                  .sort((a, b) =>
                    (a.projected_start_at || "z").localeCompare(
                      b.projected_start_at || "z",
                    ),
                  )
                  .map((w) => (
                    <Link
                      className="dossier-event"
                      key={w.id}
                      href={`/app/werkbonnen/${w.id}`}
                    >
                      <CalendarDays />
                      <div>
                        <strong>
                          {date(w.projected_start_at)} · {w.work_order_number}
                        </strong>
                        <small>
                          {data.objects.find((o) => o.id === w.object_id)?.name}{" "}
                          · {w.discipline} · {executionLabels[w.status]}
                        </small>
                      </div>
                    </Link>
                  ))}
              </div>
            ) : (
              <div className="table-scroll">
                <table className="resource-table">
                  <thead>
                    <tr>
                      {[
                        "Afspraak / object",
                        "Dienst",
                        "Wanneer",
                        "Uitvoering",
                        "Inzet",
                        "Open verzoeken",
                        "Acties",
                      ].map((s) => (
                        <th key={s} scope="col">{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrders.map((w) => (
                      <tr key={w.id}>
                        <td>
                          <strong>{w.work_order_number}</strong>
                          <small>
                            {
                              data.objects.find((o) => o.id === w.object_id)
                                ?.name
                            }
                          </small>
                        </td>
                        <td>{w.discipline}</td>
                        <td>
                          {date(w.projected_start_at)}
                          <small>Tot {date(w.projected_end_at)}</small>
                        </td>
                        <td>{executionLabels[w.status] || w.status}</td>
                        <td>
                          {data.assignments
                            .filter((a) => a.work_order_id === w.id)
                            .map(
                              (a) =>
                                data.personnel.find(
                                  (p) => p.id === a.personnel_id,
                                )?.full_name,
                            )
                            .filter(Boolean)
                            .join(", ") || "Nog toewijzen"}
                        </td>
                        <td>
                          {
                            data.chain.requests.filter(
                              (r) =>
                                r.work_order_id === w.id &&
                                !isClosedAction(r.state),
                            ).length
                          }
                        </td>
                        <td>
                          <Link
                            className="resource-action"
                            href={`/app/werkbonnen/${w.id}`}
                          >
                            Werkbon / rapport
                          </Link>
                          <Link
                            className="resource-action"
                            href={`/app/objecten/${w.object_id}?tab=instructies`}
                          >
                            Instructies
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!selectedOrders.length && (
              <Empty title="Geen afspraken gevonden">Geen afspraken bij deze selectie.</Empty>
            )}
          </ContentSection>
          <DossierChainPanel
            scope={{ customerId: c.id }}
            view="requests"
            timezone={tenant.timezone}
          />
        </>
      )}
      {tab === "offertes" && (
        <>
          <CommercialDossierPanel
            customerId={c.id}
            timezone={tenant.timezone}
          />
          <DossierChainPanel
            scope={{ customerId: c.id }}
            view="requests"
            timezone={tenant.timezone}
          />
        </>
      )}
      {tab === "facturen" && (
        <ContentSection title={"Facturen & betalingen"} description={"Alleen daadwerkelijke facturen en betaalregistraties. Een akkoord of afgeronde werkbon is nog geen betaling."} bodyClassName="dossier-section-body">

          {finance ? (
            <>
              {toolbar(
                <>
                  <label>
                    Status
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="">Alle statussen</option>
                      {Object.entries(invoiceStates).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Object
                    <select
                      value={object}
                      onChange={(e) => setObject(e.target.value)}
                    >
                      <option value="">Alle objecten</option>
                      {data.objects.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>,
              )}
              <div className="table-scroll">
                <table className="resource-table">
                  <thead>
                    <tr>
                      {[
                        "Factuur",
                        "Datum / vervalt",
                        "Bedrag",
                        "Betaald / open",
                        "Status",
                        "Herkomst",
                        "Acties",
                      ].map((s) => (
                        <th key={s} scope="col">{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInvoices.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <strong>{i.invoice_number || "Concept"}</strong>
                          </td>
                          <td>
                            {date(i.issued_on)}
                            <small>{date(i.due_on)}</small>
                          </td>
                          <td>{money(i.total_cents)}</td>
                          <td>
                            {money(i.paid_cents)}
                            <small>
                              Open: {money(i.total_cents - i.paid_cents)}
                            </small>
                          </td>
                          <td>{invoiceStates[i.status]}</td>
                          <td>
                            {[
                              ...new Set(
                                data.invoiceLines
                                  .filter((l) => l.invoice_id === i.id)
                                  .map((l) => l.work_order_id)
                                  .filter(Boolean),
                              ),
                            ].map((id) => (
                              <Link
                                className="resource-action"
                                key={id}
                                href={`/app/werkbonnen/${id}`}
                              >
                                {data.orders.find((w) => w.id === id)
                                  ?.work_order_number || "Werkbon"}
                              </Link>
                            ))}
                          </td>
                          <td>
                            <Link
                              className="resource-action"
                              href={`/app/facturen?record=${i.id}`}
                            >
                              Bekijk
                            </Link>
                            {i.pdf_storage_path && (
                              <a
                                className="resource-action"
                                href={`/api/customer-files/invoice/${i.id}`}
                              >
                                <Download size={13} />
                                PDF
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!selectedInvoices.length && <Empty title={data.invoices.length ? "Geen facturen gevonden" : "Nog geen facturen"}>{data.invoices.length ? "Geen facturen voor deze selectie. Pas de filters aan." : "Nog geen facturen."}</Empty>}
              <p className="dossier-muted">
                Correctieboekingen en creditnota’s hebben nog geen aparte
                invoerflow. Een definitieve factuur kan hier niet worden
                overschreven.
              </p>
            </>
          ) : (
            <p className="dossier-notice">Je hebt geen toegang tot financiële gegevens.</p>
          )}
        </ContentSection>
      )}
      {tab === "kwaliteit" && (
        <ContentSection title={"Kwaliteit & meldingen"} description={"Klachten, complimenten, controles en herstelacties blijven bij de oorspronkelijke locatie en afspraak."} bodyClassName="dossier-section-body">

          {toolbar(
            <>
              <label>
                Object
                <select
                  value={object}
                  onChange={(e) => setObject(e.target.value)}
                >
                  <option value="">Alle objecten</option>
                  {data.objects.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">Alle statussen</option>
                  {Object.entries(recordStates).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              {object && (
                <Link
                  className="primary-button"
                  href={`/app/objecten/${object}?tab=kwaliteit`}
                >
                  Melding toevoegen bij object
                </Link>
              )}
            </>,
          )}
          <div className="table-scroll">
            <table className="resource-table">
              <thead>
                <tr>
                  {[
                    "Melding / object",
                    "Categorie",
                    "Status",
                    "Verantwoordelijke",
                    "Deadline",
                    "Afspraak",
                    "Acties",
                  ].map((s) => (
                    <th key={s} scope="col">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quality.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.title}</strong>
                      <small>
                        {data.objects.find((o) => o.id === r.object_id)?.name}
                      </small>
                    </td>
                    <td>
                      {qualityLabels[
                        String((r.details as Record<string, unknown>).category)
                      ] || "Kwaliteitsmelding"}
                    </td>
                    <td>{recordStates[r.state] || r.state}</td>
                    <td>{owner(r.owner_user_id)}</td>
                    <td>
                      {date(r.due_on)}
                      {r.due_on &&
                        r.due_on < today &&
                        !isClosedAction(r.state) && (
                          <small>Deadline overschreden</small>
                        )}
                    </td>
                    <td>
                      {r.work_order_id ? (
                        <Link href={`/app/werkbonnen/${r.work_order_id}`}>
                          {
                            data.orders.find((w) => w.id === r.work_order_id)
                              ?.work_order_number
                          }
                        </Link>
                      ) : (
                        "Niet gekoppeld"
                      )}
                    </td>
                    <td>
                      <Link
                        className="resource-action"
                        href={`/app/objecten/${r.object_id}?tab=kwaliteit#record-${r.id}`}
                      >
                        Bekijk / opvolgen
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!quality.length && (
            <Empty title="Geen meldingen gevonden">
              Geen meldingen bij deze selectie. Selecteer een object om een
              melding te registreren.
            </Empty>
          )}
        </ContentSection>
      )}
      {tab === "documenten" && (
        <>
          <ContentSection title={"Documenten"} description={"Originele bestanden en versiehistorie. Alleen expliciet gedeelde documenten komen in het klantportaal."} actions={<ActionIcon className="primary-button" label="Document uploaden" icon={<Plus size={16}/>} onClick={() => setDoc("new")}/>} bodyClassName="dossier-section-body">

            {toolbar(
              <label>
                Categorie
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">Alle categorieën</option>
                  {Object.entries(documentCategories).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>,
            )}
            <div className="table-scroll">
              <table className="resource-table">
                <thead>
                  <tr>
                    {[
                      "Document",
                      "Categorie",
                      "Versie / datum",
                      "Geldig tot",
                      "Zichtbaarheid",
                      "Acties",
                    ].map((s) => (
                      <th key={s} scope="col">{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedDocuments.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <strong>{d.title}</strong>
                          <small>{d.file_name}</small>
                        </td>
                        <td>{documentCategories[d.category]}</td>
                        <td>
                          v{d.version}
                          <small>{date(d.document_on || d.created_at)}</small>
                        </td>
                        <td>{date(d.valid_until)}</td>
                        <td>
                          {d.archived
                            ? "Gearchiveerd"
                            : d.visibility === "customer"
                              ? `Gedeeld voor ${data.objects.find((o) => o.id === d.portal_object_id)?.name ?? "gekozen object"}`
                              : "Intern"}
                        </td>
                        <td>
                          <a
                            className="resource-action"
                            href={`/api/customer-files/document/${d.id}?preview=1`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Bekijk
                          </a>
                          <a
                            className="resource-action"
                            href={`/api/files/customer-document/${d.id}`}
                          >
                            Download
                          </a>
                          {!data.documents.some(
                            (n) => n.previous_id === d.id,
                          ) && (
                            <button
                              className="resource-action"
                              onClick={() => setDoc(d)}
                            >
                              Nieuwe versie
                            </button>
                          )}
                          <DocumentMetadata document={d} objects={data.objects} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!selectedDocuments.length && <Empty title={data.documents.length ? "Geen klantdocumenten gevonden" : "Nog geen klantdocumenten"}>{data.documents.length ? "Geen klantdocumenten voor deze selectie. Pas de filters aan." : "Nog geen klantdocumenten."}</Empty>}
          </ContentSection>
          <DossierChainPanel
            scope={{ customerId: c.id }}
            view="documents"
            excludeSource="customer"
            timezone={tenant.timezone}
          />
        </>
      )}
      {tab === "communicatie" && <TicketContextPanel kind="customer" id={c.id}/>}
      {tab === "communicatie" && (
        <>
          <ContentSection title={"Communicatie & tijdlijn"} description={"Interne zakelijke notities, gesprekken en opvolging. Dit overzicht verzendt zelf geen berichten."} actions={<button
                className="primary-button"
                onClick={() => setCommunication(true)}
              >
                Registratie toevoegen
              </button>} bodyClassName="dossier-section-body">

            {toolbar()}{" "}
            {data.notes
              .filter((n) =>
                `${n.title} ${n.body}`.toLowerCase().includes(q.toLowerCase()),
              )
              .map((n) => (
                <article className="object-record" key={n.id}>
                  <header>
                    <h3>{n.title || "Interne notitie"}</h3>
                    <span className="resource-status">
                      {n.kind === "action"
                        ? n.state === "open"
                          ? "Open actie"
                          : "Afgerond"
                        : "Intern"}
                    </span>
                  </header>
                  <p className="object-prose">{n.body}</p>
                  <small>
                    {owner(n.created_by)} · {date(n.created_at)} ·
                    verantwoordelijke {owner(n.owner_user_id)}{" "}
                    {n.due_on && `· deadline ${date(n.due_on)}`}
                  </small>
                  <footer>
                    {n.object_id && (
                      <Link
                        className="resource-action"
                        href={`/app/objecten/${n.object_id}`}
                      >
                        Object
                      </Link>
                    )}
                    {n.work_order_id && (
                      <Link
                        className="resource-action"
                        href={`/app/werkbonnen/${n.work_order_id}`}
                      >
                        Afspraak
                      </Link>
                    )}
                    {n.kind === "action" && n.state === "open" && (
                      <button
                        className="resource-action"
                        disabled={pending}
                        onClick={() => complete(n.id, n.version)}
                      >
                        Afronden
                      </button>
                    )}
                  </footer>
                </article>
              ))}
            {!data.notes.length && (
              <Empty title="Nog geen communicatie">Nog geen zakelijke communicatie geregistreerd.</Empty>
            )}
          </ContentSection>
          <ContentSection title={"Wijzigingshistorie"} description={"Wie de registratie heeft gewijzigd en wanneer; geen openbare klantcommunicatie."} bodyClassName="dossier-section-body">

            {data.history.map((h) => (
              <p key={h.id}>
                {historyLabel(h.source)}{" "}
                {h.action === "created"
                  ? "toegevoegd"
                  : h.action === "completed"
                    ? "afgerond"
                    : "bijgewerkt"}{" "}
                · {h.actor} · {date(h.at)}
              </p>
            ))}
            {!data.history.length && <Empty title="Nog geen wijzigingen">De wijzigingshistorie verschijnt hier zodra een registratie is toegevoegd of bijgewerkt.</Empty>}
          </ContentSection>
          <DossierChainPanel
            scope={{ customerId: c.id }}
            view="timeline"
            timezone={tenant.timezone}
          />
        </>
      )}
      </div>
      </div>
      {editing && (
        <CustomerWizard
          tenant={tenant}
          owners={data.owners}
          defaultPaymentTermsDays={data.defaultPaymentTermsDays}
          customer={c}
          onClose={() => setEditing(false)}
          onSaved={() => router.refresh()}
        />
      )}
      {contact && (
        <ContactEditor
          data={data}
          tenant={tenant}
          contact={contact === "new" ? undefined : contact}
          onClose={() => setContact(null)}
        />
      )}
      {doc && (
        <CustomerDocumentForm
          tenant={tenant}
          customerId={c.id}
          previous={doc === "new" ? undefined : doc}
          onClose={() => setDoc(null)}
        />
      )}
      {communication && (
        <CustomerDialog
          title="Communicatie of actie vastleggen"
          description="Bewaar alleen zakelijke informatie die bij deze relatie hoort."
          tenant={tenant}
          onClose={() => setCommunication(false)}
        >
          <CommunicationForm
            data={data}
            onSaved={() => setCommunication(false)}
          />
        </CustomerDialog>
      )}
    </div>
  );
}
const invoiceStates: Record<string, string> = {
  draft: "Concept",
  final: "Definitief",
  sent: "Verstuurd",
  partially_paid: "Deels betaald",
  paid: "Betaald",
  overdue: "Te laat",
  credited: "Gecrediteerd",
  void: "Vervallen",
};
const qualityLabels: Record<string, string> = {
  inspection: "Controle",
  complaint: "Klacht",
  compliment: "Compliment",
  damage: "Schade",
  access: "Toegang",
  unsafe: "Veiligheid",
};
const historyLabel = (s: string) =>
  ({
    customers: "Klantgegevens",
    customer_contacts: "Contactpersoon",
    customer_documents: "Document",
    customer_agreements: "Contract",
    customer_notes: "Opvolgactie",
  })[s] || "Dossierregistratie";
function CustomerDocumentForm({
  customerId,
  previous,
  tenant,
  onClose,
}: {
  customerId: string;
  previous?: CustomerDocument;
  tenant: TenantContext;
  onClose: () => void;
}) {
  const [request] = useState(() => crypto.randomUUID());
  return (
    <CustomerDialog
      title={previous ? "Nieuwe documentversie" : "Document uploaden"}
      description="PDF, JPG of PNG · maximaal 10 MB · private opslag"
      tenant={tenant}
      onClose={onClose}
    >
      <ObjectForm
        action={uploadCustomerDocument}
        onSuccess={onClose}
        label="Document uploaden"
      >
        <input name="requestId" type="hidden" value={request} />
        <input name="customerId" type="hidden" value={customerId} />
        <input name="previousId" type="hidden" value={previous?.id || ""} />
        <label>
          Titel
          <input
            name="title"
            required
            minLength={2}
            maxLength={160}
            defaultValue={previous?.title}
          />
        </label>
        <label>
          Categorie
          <select name="category" defaultValue={previous?.category || "other"}>
            {Object.entries(documentCategories).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Documentdatum
          <input name="documentOn" type="date" />
        </label>
        <label>
          Geldig tot
          <input name="validUntil" type="date" />
        </label>
        <label className="wide">
          Bestand
          <input
            name="document"
            type="file"
            accept={CUSTOMER_DOCUMENT_ACCEPT}
            required
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.setCustomValidity(
                file && file.size > 10 * 1024 * 1024
                  ? "Het bestand is groter dan 10 MB."
                  : "",
              );
              e.currentTarget.reportValidity();
            }}
          />
        </label>
        <p className="dossier-notice wide">
          Nieuwe bestanden blijven intern. Deel pas na controle via de
          documentacties. Geen medische gegevens, personeelsdossiers of geheime
          toegangscodes. Malwarescanning is niet aangesloten.
        </p>
      </ObjectForm>
    </CustomerDialog>
  );
}
function DocumentMetadata({ document: d, objects }: { document: CustomerDocument; objects: CustomerData["objects"] }) {
  const router = useRouter(),
    [pending, start] = useTransition();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="resource-action">Meer</button>
      </PopoverTrigger>
      <PopoverContent className="resource-more-content" align="end">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            if (
              form.get("visibility") === "customer" &&
              d.visibility !== "customer" &&
              !confirm(
                "Dit bestand delen met portaalgebruikers die expliciet aan het gekozen object zijn gekoppeld? Controleer dat het geen interne of gevoelige informatie bevat.",
              )
            )
              return;
            start(async () => {
              const visibility = String(form.get("visibility"));
              const r = await updateCustomerDocumentMetadata({
                id: d.id,
                version: d.metadata_version,
                category: form.get("category"),
                visibility,
                portalObjectId: visibility === "customer" ? form.get("portalObjectId") || null : null,
                archived: form.get("archived") === "on",
              });
              if (!r.ok) toast.error(r.error);
              else {
                toast.success("Documentinstellingen opgeslagen");
                router.refresh();
              }
            });
          }}
        >
          <label>
            Categorie
            <select name="category" defaultValue={d.category}>
              {Object.entries(documentCategories).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Zichtbaarheid
            <select name="visibility" defaultValue={d.visibility}>
              <option value="internal">Alleen intern</option>
              <option value="customer">Delen met klant</option>
            </select>
          </label>
          <label>
            Klantobject
            <select name="portalObjectId" defaultValue={d.portal_object_id ?? ""}>
              <option value="">Kies bij delen een object</option>
              {objects.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}
            </select>
          </label>
          <label className="dossier-check">
            <input
              name="archived"
              type="checkbox"
              defaultChecked={d.archived}
            />
            Archiveren
          </label>
          <button className="primary-button" disabled={pending}>
            Opslaan
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
