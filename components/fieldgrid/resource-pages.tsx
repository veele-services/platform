"use client";

import { AddressInput } from "./address-input";
import { CommercialDossierPanel } from "./commercial/dossier-panel";
import { WizardMobility } from "./travel-settings";
import { ReportPanel } from "./work-orders/report";
import { reportStateLabels } from "@/lib/work-orders/report-model";
import { useFormChanges, confirmDiscard } from "./unsaved-form";
import { DossierChainPanel, type ChainView } from "./dossier-chain";
import { useMemo, useState, useTransition, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import Link from "next/link";
import {ExecutionHistory} from "@/components/fieldgrid/planboard/execution-history";
import { businessToday, shiftDays, canReadDossier, employmentStatus } from "@/lib/personnel/dossier";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownAZ, ArrowUpAZ, Building2, CheckCircle2, ChevronLeft, ChevronRight,
  Download, Eye, FileText, LayoutDashboard, MoreHorizontal, Pencil, Plus, Search, StickyNote,
  Send, SlidersHorizontal, Trash2, UserRoundPlus, UsersRound, X,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CUSTOMER_DOCUMENT_ACCEPT, CUSTOMER_DOCUMENT_MAX_BYTES } from "@/lib/customers/documents";
import type { ActionResult } from "@/lib/actions/result";
import type { WorkspaceData } from "@/lib/data/workspace";
import {
  addAvailability, addQualification, archiveCustomer, archiveObject, archivePersonnel,
  assignPersonnelFunction, createCustomer, createCustomerContact, createCustomerNote, createObject,
  invitePersonnel, repeatPersonnelInvitation, suggestPersonnelNumber, updateCustomer, updateObject, updatePersonnel,
  uploadCustomerDocument, uploadPersonnelDocument,
} from "@/app/app/operations-actions";
import {
  createInvoice, createPaymentBundle, registerManualPayment, sendInvoice,
} from "@/app/app/finance-actions";

type Customer = WorkspaceData["customers"][number];
type ObjectRow = WorkspaceData["objects"][number];
type Personnel = WorkspaceData["personnel"][number];
type Invoice = WorkspaceData["invoices"][number];
type WorkOrder = WorkspaceData["workOrders"][number];
type ServerAction = (data: FormData) => Promise<ActionResult<Record<string, unknown>> | ActionResult>;
type SortDirection = "asc" | "desc";

const money = (cents: number | null | undefined) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);
const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value)) : "—";
const dateTime = (value: string | null | undefined, timezone: string) => value ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short", timeZone: timezone }).format(new Date(value)) : "—";
const initials = (value: string) => value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const jsonAddress = (value: unknown) => (value ?? {}) as { street?: string; postal_code?: string; city?: string };
const addressLine = (value: unknown) => {
  const address = jsonAddress(value);
  return [address.street, address.postal_code, address.city].filter(Boolean).join(", ") || "Geen adres";
};

function ResourceHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-intro resource-intro"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className="resource-header-actions">{actions}</div>}</header>;
}

function StatusBadge({ tone = "neutral", children }: { tone?: "green" | "blue" | "orange" | "neutral"; children: ReactNode }) {
  return <span className={`resource-status resource-status-${tone}`}>{children}</span>;
}

function ListToolbar({ query, onQuery, filter, onFilter, filterOptions, sort, onSort, sortOptions, resultCount }: {
  query: string; onQuery: (value: string) => void; filter: string; onFilter: (value: string) => void;
  filterOptions: Array<{ value: string; label: string }>; sort: string; onSort: (value: string) => void;
  sortOptions: Array<{ value: string; label: string }>; resultCount: number;
}) {
  return <section className="panel resource-toolbar" aria-label="Lijstopties">
    <label className="resource-search"><Search size={17}/><span className="sr-only">Zoeken</span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Zoeken…"/></label>
    <label><SlidersHorizontal size={16}/><span className="sr-only">Filter</span><select value={filter} onChange={(event) => onFilter(event.target.value)}>{filterOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
    <label><ArrowDownAZ size={16}/><span className="sr-only">Sortering</span><select value={sort} onChange={(event) => onSort(event.target.value)}>{sortOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
    <span className="resource-count">{resultCount} {resultCount === 1 ? "resultaat" : "resultaten"}</span>
  </section>;
}

function SortHead({ label, active, direction, onClick, className }: { label: string; active?: boolean; direction?: SortDirection; onClick?: () => void; className?: string }) {
  return <th className={className}>{onClick ? <button className={active ? "active" : ""} onClick={onClick}>{label}{active && (direction === "asc" ? <ArrowUpAZ size={13}/> : <ArrowDownAZ size={13}/>)}</button> : label}</th>;
}

function ResourceTable({ headers, children, empty }: { headers: ReactNode; children: ReactNode; empty: boolean }) {
  return <section className="panel resource-table-panel"><div className="table-scroll"><table className="resource-table"><thead><tr>{headers}</tr></thead><tbody>{children}</tbody></table></div>{empty && <div className="resource-empty"><Search size={24}/><strong>Geen resultaten</strong><span>Pas je zoekopdracht of filters aan.</span></div>}</section>;
}

function Modal({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="resource-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && confirmDiscard()) onClose(); }}>
    <section className={`resource-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div><button type="button" className="modal-close" onClick={()=>{if(confirmDiscard())onClose();}} aria-label="Sluiten"><X size={19}/></button></header>
      <div className="resource-modal-body">{children}</div>
    </section>
  </div>;
}

function ServerForm({ action, success, children, className = "resource-form", onSuccess, submitLabel = "Opslaan" }: {
  action: ServerAction; success: string; children: ReactNode; className?: string; onSuccess?: (result: ActionResult<Record<string, unknown>> | ActionResult) => void; submitLabel?: string;
}) {
  const router = useRouter();
  const {ref:formRef,changed:formChanged,saved:formSaved}=useFormChanges();
  const [requestId] = useState(()=>crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await action(data);
      if (!result.ok) { toast.error(result.error); return; }
      formSaved();
      toast.success(success);
      form.reset();
      onSuccess?.(result);
      router.refresh();
    });
  };
  return <form ref={formRef} onChange={formChanged} className={className} onSubmit={submit}><input type="hidden" name="requestId" value={requestId}/>{children}<button className="primary-button" disabled={pending}>{pending ? "Bezig…" : submitLabel}</button></form>;
}

function ArchiveButton({ action, fields, label, success }: { action: ServerAction; fields: Record<string, string>; label: string; success: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button className="resource-action danger" disabled={pending} onClick={() => {
    if (!window.confirm(`${label}? Gekoppelde historie blijft bewaard.`)) return;
    const data = new FormData(); Object.entries(fields).forEach(([key, value]) => data.set(key, value));
    startTransition(async () => { const result = await action(data); if (!result.ok) toast.error(result.error); else { toast.success(success); router.refresh(); } });
  }}><Trash2 size={13}/><span>Verwijder</span></button>;
}

function ResourceMore({ children }: { children: ReactNode }) {
  return <Popover>
    <PopoverTrigger asChild><button type="button" className="resource-action"><MoreHorizontal size={13}/><span>Meer</span></button></PopoverTrigger>
    <PopoverContent className="resource-more-content" aria-label="Meer informatie en acties" align="end" sideOffset={6} collisionPadding={12} hideWhenDetached>
      {children}
    </PopoverContent>
  </Popover>;
}

function RowActions({ onView, onEdit, archive, more }: { onView: () => void; onEdit: () => void; archive: ReactNode; more: ReactNode }) {
  return <div className="resource-actions"><button className="resource-action" onClick={onView}><Eye size={13}/><span>Bekijk</span></button><button className="resource-action" onClick={onEdit}><Pencil size={13}/><span>Bewerk</span></button>{archive}<ResourceMore>{more}</ResourceMore></div>;
}

function WizardProgress({ step, labels }: { step: number; labels: string[] }) {
  return <ol className="wizard-progress">{labels.map((label, index) => <li className={index + 1 <= step ? "active" : ""} key={label}><span>{index + 1}</span><small>{label}</small></li>)}</ol>;
}

function validateWizardStep(event: ReactMouseEvent<HTMLButtonElement>, onValid: () => void) {
  event.preventDefault();
  const fieldset = event.currentTarget.form?.querySelector("fieldset:not([hidden])");
  const fields = fieldset?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea") ?? [];
  for (const field of fields) if (!field.reportValidity()) return;
  onValid();
}

function WizardFooter({ step, steps, onBack, onNext, pending, submitLabel }: { step: number; steps: number; onBack: () => void; onNext: (event: ReactMouseEvent<HTMLButtonElement>) => void; pending: boolean; submitLabel: string }) {
  return <footer className="wizard-footer"><button type="button" className="secondary-button" onClick={onBack}>{step === 1 ? <><X size={15}/>Annuleren</> : <><ChevronLeft size={15}/>Vorige</>}</button>{step < steps ? <button key="next" type="button" className="primary-button" onClick={onNext}>Volgende<ChevronRight size={15}/></button> : <button key="submit" type="submit" className="primary-button" disabled={pending}>{pending ? "Bezig…" : submitLabel}</button>}</footer>;
}

function CustomerWizard({ onClose }: { onClose: () => void }) {
  const router = useRouter(); const [step, setStep] = useState(1); const [pending, startTransition] = useTransition();
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; startTransition(async () => { const result = await createCustomer(new FormData(form)); if (!result.ok) toast.error(result.error); else { toast.success("Klant aangemaakt"); onClose(); router.refresh(); } }); };
  return <Modal title="Nieuwe klant" eyebrow="STAPSGEWIJS" onClose={onClose}><WizardProgress step={step} labels={["Organisatie", "Facturatie", "Controle"]}/><form className="wizard-form" onSubmit={submit}>
    <fieldset hidden={step !== 1}><legend>Wie is de klant?</legend><label className="wide">Klantnaam<input name="name" required autoFocus placeholder="Bedrijfsnaam of organisatienaam"/></label><label>Factuurmail<input name="email" type="email" placeholder="facturen@klant.nl"/></label><label>Telefoon<input name="phone" type="tel" placeholder="+31…"/></label><label>Status<select name="status" defaultValue="active"><option value="lead">Lead</option><option value="active">Actief</option><option value="inactive">Inactief</option></select></label><label>Betaaltermijn<input name="paymentTermsDays" type="number" min="0" max="365" defaultValue="30" required/></label></fieldset>
    <fieldset hidden={step !== 2}><legend>Wat is het factuuradres?</legend><AddressInput required legacyFields/><div className="wizard-note wide"><Building2 size={18}/><span>Objecten voeg je na het opslaan afzonderlijk toe. Zo kan een klant ook zonder uitvoeringslocatie bestaan.</span></div></fieldset>
    <fieldset hidden={step !== 3}><legend>Controleer en maak de klant aan</legend><div className="wizard-summary wide"><CheckCircle2 size={23}/><div><strong>Klantgegevens gereed</strong><p>Na het aanmaken kun je contactpersonen en één of meer objecten koppelen.</p></div></div></fieldset>
    <WizardFooter step={step} steps={3} onBack={() => step === 1 ? onClose() : setStep((value) => value - 1)} onNext={(event) => validateWizardStep(event, () => setStep((value) => Math.min(3, value + 1)))} pending={pending} submitLabel="Klant aanmaken"/>
  </form></Modal>;
}

function CustomerEdit({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  return <Modal title="Klant bewerken" eyebrow={customer.customer_number} onClose={onClose}><ServerForm action={updateCustomer} success="Klant bijgewerkt" onSuccess={onClose}>
    <input type="hidden" name="customerId" value={customer.id}/><input type="hidden" name="version" value={customer.version}/>
    <label className="wide">Naam<input name="name" defaultValue={customer.name} required/></label><label>Factuurmail<input name="email" type="email" defaultValue={customer.billing_email ?? ""}/></label><label>Telefoon<input name="phone" defaultValue={customer.phone ?? ""}/></label><label>Status<select name="status" defaultValue={customer.status}><option value="lead">Lead</option><option value="active">Actief</option><option value="inactive">Inactief</option></select></label><label>Betaaltermijn<input name="paymentTermsDays" type="number" min="0" max="365" defaultValue={customer.payment_terms_days ?? 30}/></label><AddressInput initial={customer.billing_address} required legacyFields/>
  </ServerForm></Modal>;
}

function CustomerDetail({ customer, data, onClose, timezone, roles }: { customer: Customer; data: WorkspaceData; onClose: () => void; timezone:string; roles:string[] }) {
  const params = useSearchParams();
  const tab = params.get("tab") || "overview";
  const contacts = data.contacts.filter((item) => item.customer_id === customer.id);
  const objects = data.objects.filter((item) => item.customer_id === customer.id);
  const notes = data.customerNotes.filter((item) => item.customer_id === customer.id);
  const documents = data.customerDocuments.filter((item) => item.customer_id === customer.id);
  return <Modal title={customer.name} eyebrow={customer.customer_number} onClose={onClose} wide>
    <Tabs value={tab} onValueChange={value => { if(!confirmDiscard())return; const q = new URLSearchParams(params.toString()); q.set("record", customer.id); q.set("tab", value); window.history.replaceState(null, "", `/app/klanten?${q}`); }} className="customer-detail-tabs">
      <div className="customer-tabs-scroll">
        <TabsList aria-label="Klantdossier" className="customer-tabs-list">
          <TabsTrigger value="overview"><LayoutDashboard size={16}/>Overzicht</TabsTrigger>
          <TabsTrigger value="contacts"><UsersRound size={16}/>Contactpersonen</TabsTrigger>
          <TabsTrigger value="objects"><Building2 size={16}/>Objecten</TabsTrigger>
          <TabsTrigger value="executions"><FileText size={16}/>Uitvoeringen</TabsTrigger>
          <TabsTrigger value="requests">Verzoeken & meerwerk</TabsTrigger>
          <TabsTrigger value="commercial">Aanvragen & offertes</TabsTrigger>
          <TabsTrigger value="agreements">Afspraken & contracten</TabsTrigger>
          <TabsTrigger value="actions">Opvolging</TabsTrigger>
          <TabsTrigger value="finance">Financieel</TabsTrigger>
          <TabsTrigger value="timeline">Tijdlijn</TabsTrigger>
          <TabsTrigger value="notes"><StickyNote size={16}/>Notities</TabsTrigger>
          <TabsTrigger value="documents"><FileText size={16}/>Documenten</TabsTrigger>
        </TabsList>
      </div>
      {(["requests","agreements","actions","finance","timeline"] as ChainView[]).map(view => <TabsContent key={view} value={view} className="customer-tab-panel"><DossierChainPanel scope={{customerId:customer.id}} view={view} workspace={data} timezone={timezone} canCommercial={roles.some(r=>["tenant_admin","management","finance"].includes(r))}/></TabsContent>)}
      <TabsContent value="overview" className="customer-tab-panel">
        <div className="customer-section-heading"><h3>Hoofdgegevens</h3><p>De belangrijkste gegevens van deze klant op één plek.</p></div>
        <div className="detail-grid">
          <div><span>Status</span><strong>{customer.status === "active" ? "Actief" : customer.status === "lead" ? "Lead" : "Inactief"}</strong></div>
          <div><span>Klantnummer</span><strong>{customer.customer_number}</strong></div>
          <div><span>Factuurmail</span><strong>{customer.billing_email ?? "—"}</strong></div>
          <div><span>Telefoon</span><strong>{customer.phone ?? "—"}</strong></div>
          <div><span>Factuuradres</span><strong>{addressLine(customer.billing_address)}</strong></div>
          <div><span>Betaaltermijn</span><strong>{customer.payment_terms_days ?? data.settings?.payment_terms_days ?? 14} dagen</strong></div>
        </div>
      </TabsContent>
      <TabsContent value="commercial" className="customer-tab-panel"><CommercialDossierPanel customerId={customer.id} timezone={timezone}/></TabsContent>
      <TabsContent value="executions" className="customer-tab-panel"><ExecutionHistory orders={data.workOrders.filter(w=>w.customer_id===customer.id)} timezone={timezone}/></TabsContent>
      <TabsContent value="contacts" className="customer-tab-panel">
        <div className="modal-columns customer-dossier-columns">
          <section><div className="customer-section-heading"><h3>Contactpersonen <span>{contacts.length}</span></h3><p>Aanspreekpunten binnen deze organisatie.</p></div>
            {contacts.length ? contacts.map((item) => <article className="customer-dossier-card" key={item.id}>
              <UsersRound size={18}/><div><strong>{item.full_name}</strong>{item.is_primary && <small className="customer-primary-contact">Primair contact</small>}
                {item.role && <small>{item.role}</small>}{item.email && <small>{item.email}</small>}{item.phone && <small>{item.phone}</small>}
                {!item.email && !item.phone && <small>Geen contactgegevens</small>}
              </div>
            </article>) : <p className="customer-dossier-empty">Nog geen contactpersonen toegevoegd.</p>}
          </section>
          <section className="customer-dossier-form"><h3>Contactpersoon toevoegen</h3>
            <ServerForm action={createCustomerContact} success="Contactpersoon toegevoegd" submitLabel="Contact toevoegen">
              <input type="hidden" name="customerId" value={customer.id}/>
              <label className="wide">Naam<input name="fullName" required minLength={2}/></label>
              <label>E-mail<input name="email" type="email"/></label><label>Telefoon<input name="phone" type="tel"/></label>
              <label className="wide">Rol<input name="role"/></label>
              <label className="check wide"><input name="primary" type="checkbox"/>Primair contact</label>
            </ServerForm>
          </section>
        </div>
      </TabsContent>
      <TabsContent value="objects" className="customer-tab-panel">
        <div className="customer-section-heading"><h3>Objecten <span>{objects.length}</span></h3><p>De uitvoeringslocaties die aan deze klant zijn gekoppeld.</p><Link className="secondary-button" href={`/app/objecten?new=1&customer=${customer.id}`}>Nieuw object</Link></div>
        <div className="customer-dossier-list">{objects.length ? objects.map((item) => <article className="customer-dossier-card" key={item.id}>
          <Building2 size={18}/><div><Link href={`/app/objecten/${item.id}`}><strong>{item.name}</strong></Link><small>{item.object_number} · {item.active ? "Actief" : "Inactief"}</small><small>{addressLine(item.address)}</small>
            {item.access_instructions && <p>{item.access_instructions}</p>}
          </div>
        </article>) : <p className="customer-dossier-empty">Nog geen objecten gekoppeld. Voeg een locatie toe via de pagina Objecten.</p>}</div>
      </TabsContent>
      <TabsContent value="notes" className="customer-tab-panel">
        <div className="customer-section-heading"><h3>Notities <span>{notes.length}</span></h3><p>Interne afspraken en aandachtspunten voor de backoffice.</p></div>
        <section className="customer-dossier-form">
          <ServerForm action={createCustomerNote} success="Notitie toegevoegd" submitLabel="Notitie toevoegen">
            <input type="hidden" name="customerId" value={customer.id}/>
            <label className="wide">Nieuwe notitie<textarea name="body" rows={3} required maxLength={10000} placeholder="Leg een afspraak of aandachtspunt vast…"/></label>
          </ServerForm>
        </section>
        <div className="customer-dossier-list">{notes.length ? notes.map((item) => <article className="customer-dossier-card customer-note" key={item.id}>
          <StickyNote size={18}/><div><time dateTime={item.created_at}>{date(item.created_at)}</time><p>{item.body}</p></div>
        </article>) : <p className="customer-dossier-empty">Nog geen notities toegevoegd.</p>}</div>
      </TabsContent>
      <TabsContent value="documents" className="customer-tab-panel">
        <DossierChainPanel scope={{customerId:customer.id}} view="documents" excludeSource="customer" timezone={timezone}/>
        <div className="customer-section-heading"><h3>Documenten <span>{documents.length}</span></h3><p>Privé opgeslagen bij deze klant, alleen toegankelijk voor de bevoegde backoffice.</p></div>
        <section className="customer-dossier-form">
          <ServerForm action={uploadCustomerDocument} success="Document geüpload" submitLabel="Document uploaden">
            <input type="hidden" name="customerId" value={customer.id}/>
            <label>Titel<input name="title" required minLength={2} maxLength={160} placeholder="Bijvoorbeeld: serviceovereenkomst"/></label>
            <label>Bestand<input name="document" type="file" accept={CUSTOMER_DOCUMENT_ACCEPT} aria-describedby="customer-document-help" required onChange={(event) => {
              const input = event.currentTarget;
              input.setCustomValidity((input.files?.[0]?.size ?? 0) > CUSTOMER_DOCUMENT_MAX_BYTES ? "Gebruik een bestand van maximaal 10 MB" : "");
              input.reportValidity();
            }}/></label>
            <label>Nieuwe versie van<select name="previousId"><option value="">Nieuw document</option>{documents.filter(d=>!documents.some(n=>n.previous_id===d.id)).map(d=><option key={d.id} value={d.id}>{d.title} · v{d.version}</option>)}</select></label><label>Documentdatum<input name="documentOn" type="date"/></label><label>Geldig tot<input name="validUntil" type="date"/></label><p id="customer-document-help" className="muted-p wide">PDF, JPG of PNG · maximaal 10 MB per bestand.</p>
          </ServerForm>
        </section>
        <div className="customer-dossier-list">{documents.length ? documents.map((item) => <article className="customer-dossier-card customer-document" key={item.id}>
          <FileText size={18}/><div><strong>{item.title}</strong><small>{item.file_name} · {item.size_bytes >= 1024 * 1024 ? `${(item.size_bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(item.size_bytes / 1024))} KB`}</small><small>Toegevoegd op {date(item.created_at)}</small></div>
          <a className="resource-action" href={`/api/files/customer-document/${item.id}`} aria-label={`${item.title} downloaden`}><Download size={14}/><span>Download</span></a>
        </article>) : <p className="customer-dossier-empty">Nog geen documenten geüpload.</p>}</div>
      </TabsContent>
    </Tabs>
  </Modal>;
}

export function CustomersPage({ data, timezone, roles=[] }: { data: WorkspaceData; timezone:string; roles?:string[] }) {
  const params=useSearchParams();const linkedId=params.get("record");
  const [query, setQuery] = useState(""); const [filter, setFilter] = useState("all"); const [sort, setSort] = useState("name-asc");
  const [localModal, setLocalModal] = useState<{ type: "create" } | { type: "edit"; item: Customer } | null>(params.get("new")==="1"?{type:"create"}:null);
  const selected=data.customers.find(c=>c.id===linkedId);
  const modal=localModal ?? (selected ? {type:"view" as const,item:selected}:null);
  const setModal=(value:{type:"create"}|{type:"view"|"edit";item:Customer}|null)=>{
    const q=new URLSearchParams(params.toString());
    if(value?.type==="view"){setLocalModal(null);q.set("record",value.item.id);q.set("tab","overview");window.history.pushState(null,"",`/app/klanten?${q}`);}
    else {setLocalModal(value?.type==="edit"?{type:"edit",item:value.item}:value?.type==="create"?{type:"create"}:null);if(!value){q.delete("record");q.delete("tab");q.delete("new");window.history.replaceState(null,"",`/app/klanten?${q}`);}}
  };
  const rows = useMemo(() => data.customers.filter((item) => filter === "all" || item.status === filter).filter((item) => [item.name, item.customer_number, item.billing_email, item.phone, addressLine(item.billing_address)].some((value) => value?.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => {
    const [field, direction] = sort.split("-"); const left = field === "created" ? a.created_at : field === "number" ? a.customer_number : a.name; const right = field === "created" ? b.created_at : field === "number" ? b.customer_number : b.name; return left.localeCompare(right, "nl") * (direction === "desc" ? -1 : 1);
  }), [data.customers, filter, query, sort]);
  const setColumnSort = (field: string) => setSort((current) => current.startsWith(`${field}-`) && current.endsWith("asc") ? `${field}-desc` : `${field}-asc`);
  return <><ResourceHeader eyebrow="RELATIES" title="Klanten" description="Zoek, filter en beheer alle klantrelaties binnen deze tenant." actions={<button className="primary-button" onClick={() => setModal({ type: "create" })}><Plus size={16}/>Nieuwe klant</button>}/><ListToolbar query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} filterOptions={[{ value: "all", label: "Alle statussen" }, { value: "lead", label: "Lead" }, { value: "active", label: "Actief" }, { value: "inactive", label: "Inactief" }]} sort={sort} onSort={setSort} sortOptions={[{ value: "name-asc", label: "Naam A–Z" }, { value: "name-desc", label: "Naam Z–A" }, { value: "number-asc", label: "Klantnummer" }, { value: "created-desc", label: "Nieuwste eerst" }]} resultCount={rows.length}/><ResourceTable empty={!rows.length} headers={<><SortHead label="Klant" active={sort.startsWith("name-")} direction={sort.endsWith("desc") ? "desc" : "asc"} onClick={() => setColumnSort("name")}/><SortHead label="Klantnummer" active={sort.startsWith("number-")} direction={sort.endsWith("desc") ? "desc" : "asc"} onClick={() => setColumnSort("number")}/><SortHead label="Contact"/><SortHead label="Factuuradres"/><SortHead label="Objecten"/><SortHead label="Status"/><SortHead label="Acties" className="actions-column"/></>}>
    {rows.map((customer) => <tr key={customer.id}><td><div className="resource-primary"><span className="avatar avatar-mint">{initials(customer.name)}</span><span><strong>{customer.name}</strong><small>{customer.billing_email ?? "Geen factuurmail"}</small></span></div></td><td><span className="resource-code">{customer.customer_number}</span></td><td>{customer.phone ?? "—"}</td><td>{addressLine(customer.billing_address)}</td><td>{data.objects.filter((item) => item.customer_id === customer.id).length}</td><td><StatusBadge tone={customer.status === "active" ? "green" : customer.status === "lead" ? "blue" : "neutral"}>{customer.status === "active" ? "Actief" : customer.status === "lead" ? "Lead" : "Inactief"}</StatusBadge></td><td><RowActions onView={() => setModal({ type: "view", item: customer })} onEdit={() => setModal({ type: "edit", item: customer })} archive={<ArchiveButton action={archiveCustomer} fields={{ customerId: customer.id, version: String(customer.version) }} label={`Klant ${customer.name} verwijderen`} success="Klant gedeactiveerd"/>} more={<><span>{data.contacts.filter((item) => item.customer_id === customer.id).length} contactpersonen</span><span>{data.workOrders.filter((item) => item.customer_id === customer.id).length} werkbonnen</span></>}/></td></tr>)}
  </ResourceTable>{modal?.type === "create" && <CustomerWizard onClose={() => setModal(null)}/>} {modal?.type === "edit" && <CustomerEdit customer={modal.item} onClose={() => setModal(null)}/>} {modal?.type === "view" && <CustomerDetail customer={data.customers.find(c=>c.id===modal.item.id)||modal.item} data={data} timezone={timezone} roles={roles} onClose={() => setModal(null)}/>}</>;
}

function ObjectWizard({ customers, onClose }: { customers: Customer[]; onClose: () => void }) {
  const router = useRouter(); const [step, setStep] = useState(1); const [pending, startTransition] = useTransition();
  const [review, setReview] = useState({ customer: "", name: "", address: "", instructions: "" });
  const nextStep = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const form = event.currentTarget.form;
    validateWizardStep(event, () => {
      if (form && step === 2) {
        const fields = new FormData(form);
        setReview({
          customer: customers.find((customer) => customer.id === fields.get("customerId"))?.name ?? "Gekozen klant",
          name: String(fields.get("name") ?? ""),
          address: addressLine({ street: fields.get("street"), postal_code: fields.get("postalCode"), city: fields.get("city") }),
          instructions: String(fields.get("instructions") ?? "").trim(),
        });
      }
      setStep((value) => Math.min(3, value + 1));
    });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; startTransition(async () => { const result = await createObject(new FormData(form)); if (!result.ok) toast.error(result.error); else { toast.success("Object aangemaakt"); onClose(); router.refresh(); } }); };
  return <Modal title="Nieuw object" eyebrow="STAPSGEWIJS" onClose={onClose}>
    <WizardProgress step={step} labels={["Klant", "Locatie", "Controle"]}/>
    <form className="wizard-form" onSubmit={submit}>
      <fieldset hidden={step !== 1}><legend>Bij welke klant hoort het object?</legend><label className="wide">Klant<select name="customerId" required defaultValue="" autoFocus><option value="" disabled>Kies een bestaande klant</option>{customers.filter((item) => item.status !== "inactive").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="wide">Objectnaam<input name="name" required placeholder="Bijv. Hoofdkantoor"/></label></fieldset>
      <fieldset hidden={step !== 2}><legend>Waar bevindt het object zich?</legend><AddressInput required legacyFields/><label className="wide">Bezoekinstructies<textarea name="instructions" rows={4} placeholder="Toegang, parkeren, melden bij…"/></label></fieldset>
      <fieldset hidden={step !== 3}>
        <legend>Controleer je gegevens</legend>
        <div className="detail-grid wide" role="group" aria-label="Samenvatting object">
          <div><span>Klant</span><strong>{review.customer}</strong></div>
          <div><span>Objectnaam</span><strong>{review.name}</strong></div>
          <div className="wide"><span>Adres</span><strong>{review.address}</strong></div>
          {review.instructions && <div className="wide"><span>Bezoekinstructies</span><strong>{review.instructions}</strong></div>}
        </div>
        <div className="wizard-summary wide"><CheckCircle2 size={23}/><div><strong>Klopt alles?</strong><p>Klik op ‘Object aanmaken’ om deze locatie bij de gekozen klant op te slaan. Wil je nog iets wijzigen? Ga dan terug met ‘Vorige’.</p></div></div>
      </fieldset>
      <WizardFooter step={step} steps={3} onBack={() => step === 1 ? onClose() : setStep((value) => value - 1)} onNext={nextStep} pending={pending} submitLabel="Object aanmaken"/>
    </form>
  </Modal>;
}

function ObjectEdit({ object, customers, onClose }: { object: ObjectRow; customers: Customer[]; onClose: () => void }) {
  return <Modal title="Object bewerken" eyebrow={object.object_number} onClose={onClose}><ServerForm action={updateObject} success="Object bijgewerkt" onSuccess={onClose}><input type="hidden" name="objectId" value={object.id}/><label className="wide">Klant<select name="customerId" defaultValue={object.customer_id}>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="wide">Objectnaam<input name="name" defaultValue={object.name} required/></label><AddressInput initial={object.address} required legacyFields/><label>Status<select name="active" defaultValue={String(object.active)}><option value="true">Actief</option><option value="false">Inactief</option></select></label><label className="wide">Bezoekinstructies<textarea name="instructions" rows={4} defaultValue={object.access_instructions ?? ""}/></label></ServerForm></Modal>;
}

function ObjectDetail({ object, customer, data, onClose, timezone }: { object: ObjectRow; customer?: Customer; data: WorkspaceData; onClose: () => void; timezone:string }) {
  return <Modal title={object.name} eyebrow={object.object_number} onClose={onClose} wide><div className="detail-grid"><div><span>Klant</span><strong>{customer?.name ?? "—"}</strong></div><div><span>Status</span><strong>{object.active ? "Actief" : "Inactief"}</strong></div><div className="wide"><span>Adres</span><strong>{addressLine(object.address)}</strong></div><div className="wide"><span>Bezoekinstructies</span><strong>{object.access_instructions ?? "Geen instructies"}</strong></div><div><span>Werkbonnen</span><strong>{data.workOrders.filter((item) => item.object_id === object.id).length}</strong></div></div><ExecutionHistory orders={data.workOrders.filter(w=>w.object_id===object.id)} timezone={timezone}/></Modal>;
}

export function ObjectsPage({ data, timezone }: { data: WorkspaceData; timezone:string }) {
  const params=useSearchParams();const linkedId=params.get("record");
  const [query, setQuery] = useState(""); const [filter, setFilter] = useState("all"); const [sort, setSort] = useState("name-asc"); const [modal, setModal] = useState<{ type: "create" } | { type: "view" | "edit"; item: ObjectRow } | null>(()=>{const item=data.objects.find(c=>c.id===linkedId);return item?{type:"view",item}:null;}); const customerById = useMemo(() => new Map(data.customers.map((item) => [item.id, item])), [data.customers]);
  const rows = useMemo(() => data.objects.filter((item) => filter === "all" || (filter === "active" ? item.active : !item.active)).filter((item) => [item.name, item.object_number, customerById.get(item.customer_id)?.name, addressLine(item.address)].some((value) => value?.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => { const [field, direction] = sort.split("-"); const left = field === "customer" ? customerById.get(a.customer_id)?.name ?? "" : field === "number" ? a.object_number : a.name; const right = field === "customer" ? customerById.get(b.customer_id)?.name ?? "" : field === "number" ? b.object_number : b.name; return left.localeCompare(right, "nl") * (direction === "desc" ? -1 : 1); }), [customerById, data.objects, filter, query, sort]);
  const setColumnSort = (field: string) => setSort((current) => current.startsWith(`${field}-`) && current.endsWith("asc") ? `${field}-desc` : `${field}-asc`);
  return <><ResourceHeader eyebrow="LOCATIES" title="Objecten" description="Uitvoeringslocaties, altijd gekoppeld aan een bestaande klant." actions={<button className="primary-button" disabled={!data.customers.length} title={!data.customers.length ? "Maak eerst een klant aan" : undefined} onClick={() => setModal({ type: "create" })}><Plus size={16}/>Nieuw object</button>}/>{!data.customers.length && <div className="resource-warning">Maak eerst een klant aan voordat je een object toevoegt.</div>}<ListToolbar query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} filterOptions={[{ value: "all", label: "Alle statussen" }, { value: "active", label: "Actief" }, { value: "inactive", label: "Inactief" }]} sort={sort} onSort={setSort} sortOptions={[{ value: "name-asc", label: "Naam A–Z" }, { value: "name-desc", label: "Naam Z–A" }, { value: "customer-asc", label: "Klant A–Z" }, { value: "number-asc", label: "Objectnummer" }]} resultCount={rows.length}/><ResourceTable empty={!rows.length} headers={<><SortHead label="Object" active={sort.startsWith("name-")} direction={sort.endsWith("desc") ? "desc" : "asc"} onClick={() => setColumnSort("name")}/><SortHead label="Objectnummer" active={sort.startsWith("number-")} direction={sort.endsWith("desc") ? "desc" : "asc"} onClick={() => setColumnSort("number")}/><SortHead label="Klant" active={sort.startsWith("customer-")} direction={sort.endsWith("desc") ? "desc" : "asc"} onClick={() => setColumnSort("customer")}/><SortHead label="Adres"/><SortHead label="Werkbonnen"/><SortHead label="Status"/><SortHead label="Acties" className="actions-column"/></>}>
    {rows.map((object) => <tr key={object.id}><td><div className="resource-primary"><span className="resource-icon"><Building2 size={17}/></span><span><strong>{object.name}</strong><small>{object.access_instructions ?? "Geen bezoekinstructies"}</small></span></div></td><td><span className="resource-code">{object.object_number}</span></td><td>{customerById.get(object.customer_id)?.name ?? "—"}</td><td>{addressLine(object.address)}</td><td>{data.workOrders.filter((item) => item.object_id === object.id).length}</td><td><StatusBadge tone={object.active ? "green" : "neutral"}>{object.active ? "Actief" : "Inactief"}</StatusBadge></td><td><RowActions onView={() => setModal({ type: "view", item: object })} onEdit={() => setModal({ type: "edit", item: object })} archive={<ArchiveButton action={archiveObject} fields={{ objectId: object.id }} label={`Object ${object.name} verwijderen`} success="Object gedeactiveerd"/>} more={<><span>{data.requests.filter((item) => item.object_id === object.id).length} aanvragen</span><span>{data.workOrders.filter((item) => item.object_id === object.id).length} werkbonnen</span></>}/></td></tr>)}
  </ResourceTable>{modal?.type === "create" && <ObjectWizard customers={data.customers} onClose={() => setModal(null)}/>} {modal?.type === "edit" && <ObjectEdit object={modal.item} customers={data.customers} onClose={() => setModal(null)}/>} {modal?.type === "view" && <ObjectDetail object={modal.item} customer={customerById.get(modal.item.customer_id)} data={data} timezone={timezone} onClose={() => setModal(null)}/>}</>;
}

function PersonnelWizard({ onClose, suggestedNumber }: { onClose: () => void; suggestedNumber: string }) {
  const router = useRouter(); const [step, setStep] = useState(1); const [pending, startTransition] = useTransition();
  const [employeeNumber, setEmployeeNumber] = useState(suggestedNumber);
  const [automatic, setAutomatic] = useState(true);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; startTransition(async () => { const result = await invitePersonnel(new FormData(form)); if (!result.ok) toast.error(result.error); else { if (result.warning) toast.warning(result.warning); else toast.success(`Uitnodiging verstuurd · ${result.employeeNumber}`); onClose(); router.refresh(); } }); };
  return <Modal title="Nieuwe medewerker" eyebrow="STAPSGEWIJS" onClose={onClose}>
    <WizardProgress step={step} labels={["Persoon", "Dienstverband", "Uitnodiging"]}/>
    <form className="wizard-form" onSubmit={submit}>
      <input type="hidden" name="employeeNumberMode" value={automatic ? "automatic" : "manual"}/>
      <fieldset hidden={step !== 1}><legend>Wie nodig je uit?</legend><label className="wide">Volledige naam<input name="name" required autoFocus/></label><label>E-mailadres<input name="email" type="email" required/></label><label>Telefoon<input name="phone" type="tel"/></label></fieldset>
      <fieldset hidden={step !== 2}>
        <legend>Leg de basisgegevens vast</legend>
        <label>Personeelsnummer<input name="employeeNumber" value={employeeNumber} onChange={(event) => { setEmployeeNumber(event.target.value); setAutomatic(false); }} required maxLength={80} aria-describedby="personnel-number-hint"/></label>
        <label>Startdatum<input name="startDate" type="date"/></label>
        <div className="wide"><p className="form-note" id="personnel-number-hint">{automatic ? "Automatisch voorgesteld. Je mag dit nummer aanpassen. Als iemand je voor is, kiezen we bij het opslaan het volgende vrije nummer." : "Je gebruikt een eigen personeelsnummer. Dit nummer mag nog niet bij een andere medewerker in gebruik zijn."}</p>
          {!automatic && <button type="button" className="text-link" onClick={() => { setEmployeeNumber(suggestedNumber); setAutomatic(true); }}>Automatisch nummer gebruiken</button>}
        </div>
        <WizardMobility/><div className="wizard-note wide"><UsersRound size={18}/><span>Functies, kwalificaties, beschikbaarheid en documenten voeg je daarna via ‘Meer’ toe.</span></div>
      </fieldset>
      <fieldset hidden={step !== 3}><legend>Verstuur de uitnodiging</legend><div className="wizard-summary wide"><Send size={23}/><div><strong>Een uitnodiging voor het personeelsportaal</strong><p>De medewerker ontvangt een e-mail in de huisstijl van jouw organisatie. Via de knop in die e-mail activeert de medewerker het account en kiest een eigen wachtwoord. Wie al een account heeft, logt in met de bestaande gegevens.</p><p>In het personeelsportaal kan de medewerker de eigen planning en werkbonnen bekijken.</p><p>Personeelsnummer: <strong>{employeeNumber}</strong>{automatic && " (automatisch voorstel)"}</p></div></div></fieldset>
      <WizardFooter step={step} steps={3} onBack={() => step === 1 ? onClose() : setStep((value) => value - 1)} onNext={(event) => validateWizardStep(event, () => setStep((value) => Math.min(3, value + 1)))} pending={pending} submitLabel="Uitnodiging versturen"/>
    </form>
  </Modal>;
}

function PersonnelInvitationButton({ person }: { person: Personnel }) {
  const [pending, startTransition] = useTransition();
  if (!person.email || !person.user_id || !["invited", "active"].includes(person.status)) return null;
  return <button type="button" disabled={pending} onClick={() => startTransition(async () => {
    const fields = new FormData(); fields.set("personnelId", person.id);
    const result = await repeatPersonnelInvitation(fields);
    if (!result.ok) toast.error(result.error);
    else if (result.warning) toast.warning(result.warning);
    else toast.success("Uitnodiging opnieuw verstuurd");
  })}>{pending ? "Versturen…" : "Uitnodiging opnieuw versturen"}</button>;
}

function PersonnelEdit({ person, onClose }: { person: Personnel; onClose: () => void }) {
  return <Modal title="Medewerker bewerken" eyebrow={person.employee_number} onClose={onClose}><ServerForm action={updatePersonnel} success="Medewerker bijgewerkt" onSuccess={onClose}><input type="hidden" name="personnelId" value={person.id}/><input type="hidden" name="version" value={person.version}/><label className="wide">Naam<input name="name" defaultValue={person.full_name} required/></label><label>E-mail<input name="email" type="email" defaultValue={person.email ?? ""}/></label><label>Telefoon<input name="phone" defaultValue={person.phone ?? ""}/></label><label>Personeelsnummer<input name="employeeNumber" defaultValue={person.employee_number} required/></label><label>Startdatum<input name="startDate" type="date" defaultValue={person.start_date ?? ""}/></label><label>Status<select name="status" defaultValue={person.status}><option value="invited">Uitgenodigd</option><option value="active">Actief</option><option value="inactive">Inactief</option><option value="former">Uit dienst</option></select></label></ServerForm></Modal>;
}

function PersonnelDetail({ person, data, onClose, manage = false }: { person: Personnel; data: WorkspaceData; onClose: () => void; manage?: boolean }) {
  const functions = data.personnelFunctions.filter((item) => item.personnel_id === person.id).map((item) => data.functions.find((fn) => fn.id === item.function_id)?.name).filter(Boolean);
  const qualifications = data.qualifications.filter((item) => item.personnel_id === person.id);
  return <Modal title={person.full_name} eyebrow={person.employee_number} onClose={onClose} wide><div className="detail-grid"><div><span>Status</span><strong>{person.status}</strong></div><div><span>E-mail</span><strong>{person.email ?? "—"}</strong></div><div><span>Telefoon</span><strong>{person.phone ?? "—"}</strong></div><div><span>Startdatum</span><strong>{date(person.start_date)}</strong></div><div><span>Functie</span><strong>{functions.join(" · ") || "—"}</strong></div><div><span>Kwalificaties</span><strong>{qualifications.map((item) => item.code).join(" · ") || "—"}</strong></div></div>{manage && <div className="modal-columns personnel-manage"><section><h3>Functie en kwalificatie</h3><Link className="secondary-button" href={`/app/personeel/${person.id}`}>Open volledig dossier</Link><ServerForm action={assignPersonnelFunction} success="Functie gekoppeld" submitLabel="Functie koppelen"><input type="hidden" name="personnelId" value={person.id}/><label className="wide">Functie<select name="functionId" required defaultValue=""><option value="" disabled>Kies functie</option>{data.functions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></ServerForm><ServerForm action={addQualification} success="Kwalificatie opgeslagen; controleer deze in het dossier" submitLabel="Kwalificatie toevoegen"><input type="hidden" name="personnelId" value={person.id}/><label>Code<input name="code" required/></label><label>Naam<input name="name" required/></label><label>Uitgegeven<input name="issuedAt" type="date"/></label><label>Geldig tot<input name="validUntil" type="date"/></label></ServerForm></section><section><h3>Beschikbaarheid en document</h3><ServerForm action={addAvailability} success="Periode opgeslagen" submitLabel="Periode toevoegen"><input type="hidden" name="personnelId" value={person.id}/><label>Soort<select name="kind" defaultValue="unavailable"><option value="available">Beschikbaar</option><option value="unavailable">Niet beschikbaar</option><option value="leave">Verlof</option><option value="sick">Ziek</option></select></label><label>Start<input name="start" type="datetime-local" required/></label><label>Einde<input name="end" type="datetime-local" required/></label><label className="wide">Toelichting<input name="note"/></label></ServerForm><ServerForm action={uploadPersonnelDocument} success="Document opgeslagen" submitLabel="Document uploaden"><input type="hidden" name="personnelId" value={person.id}/><label>Type<input name="documentType" required/></label><label>Titel<input name="title" required/></label><label className="wide">Bestand<input name="document" type="file" accept="application/pdf,image/jpeg,image/png" required/></label><label className="check wide"><input name="visibleToEmployee" type="checkbox"/>Zichtbaar voor medewerker</label><p className="form-note wide">Geen medische inhoud, identiteitskopieën of VOG-bestanden. Gebruik voor vertrouwelijke HR-documenten het volledige dossier.</p><label className="check wide"><input name="privacyConfirmed" type="checkbox" required/>Ik heb gecontroleerd dat het bestand noodzakelijk is en geen uitgesloten inhoud bevat.</label></ServerForm></section></div>}</Modal>;
}

export function PersonnelPage({ data, roles=[] }: { data: WorkspaceData; roles?:string[] }) {
  const router = useRouter();
  type PersonnelModal = { type: "create" } | { type: "view" | "edit" | "manage"; item: Personnel } | null;
  const [query, setQuery] = useState(""); const [filter, setFilter] = useState("all"); const [sort, setSort] = useState("name-asc"); const [modal, setModalState] = useState<PersonnelModal>(null);
  const setModal = (value:PersonnelModal) => { if(value?.type === "view" && canReadDossier(roles)) router.push(`/app/personeel/${value.item.id}`); else setModalState(value); };
  const [functionFilter,setFunctionFilter]=useState("");const [teamFilter,setTeamFilter]=useState("");const [employmentFilter,setEmploymentFilter]=useState("");const [attentionFilter,setAttentionFilter]=useState("");
  const summary=new Map((data.dossierSummary??[]).map(row=>[row.personnel_id,row]));
  const [suggestedNumber, setSuggestedNumber] = useState("");
  const [preparing, startPreparing] = useTransition();
  const openWizard = () => startPreparing(async () => {
    const result = await suggestPersonnelNumber();
    if (!result.ok) { toast.error(result.error); return; }
    setSuggestedNumber(result.employeeNumber);
    setModal({ type: "create" });
  });
  const rows = useMemo(() => data.personnel.filter((item) => {
    const s=data.dossierSummary?.find(r=>r.personnel_id===item.id);
    return (!functionFilter||s?.function_id===functionFilter||data.personnelFunctions.some(f=>f.personnel_id===item.id&&f.function_id===functionFilter))
      &&(!teamFilter||s?.team===teamFilter)&&(!employmentFilter||employmentStatus(item.status,s?.employment_status)===employmentFilter)
      &&(!attentionFilter||(attentionFilter==="contract"?!!s?.ends_on&&s.ends_on<=shiftDays(businessToday(),90):attentionFilter==="certificate"?s?.certificate_attention:!!s?.open_actions));
  }).filter((item) => filter === "all" || item.status === filter).filter((item) => [item.full_name, item.employee_number, item.email, item.phone].some((value) => value?.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => { const [field, direction] = sort.split("-"); const left = field === "number" ? a.employee_number : field === "status" ? a.status : a.full_name; const right = field === "number" ? b.employee_number : field === "status" ? b.status : b.full_name; return left.localeCompare(right, "nl") * (direction === "desc" ? -1 : 1); }), [data.personnel, data.personnelFunctions, data.dossierSummary, functionFilter, teamFilter, employmentFilter, attentionFilter, filter, query, sort]);
  const setColumnSort = (field: string) => setSort((current) => current.startsWith(`${field}-`) && current.endsWith("asc") ? `${field}-desc` : `${field}-asc`);
  return <><ResourceHeader eyebrow="TEAM" title="Personeel" description="Medewerkers, inzetbaarheid en kwalificaties in één overzichtelijke lijst." actions={<>{canReadDossier(roles)&&<Link className="secondary-button" href="/app/personeel/acties">Actie nodig</Link>}<button className="primary-button" disabled={preparing} onClick={openWizard}><UserRoundPlus size={16}/>Nieuwe medewerker</button></>}/><ListToolbar query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} filterOptions={[{ value: "all", label: "Alle statussen" }, { value: "invited", label: "Uitgenodigd" }, { value: "active", label: "Actief" }, { value: "inactive", label: "Inactief" }, { value: "former", label: "Uit dienst" }]} sort={sort} onSort={setSort} sortOptions={[{ value: "name-asc", label: "Naam A–Z" }, { value: "name-desc", label: "Naam Z–A" }, { value: "number-asc", label: "Personeelsnummer" }, { value: "status-asc", label: "Status" }]} resultCount={rows.length}/>{canReadDossier(roles)&&<section className="panel dossier-toolbar" aria-label="Dossierfilters">
<label>Dienstverband<select value={employmentFilter} onChange={e=>setEmploymentFilter(e.target.value)}><option value="">Alle dienstverbanden</option>{[["preparation","In voorbereiding"],["active","Actief"],["leaving","Uitdiensttreding gepland"],["former","Uit dienst"],["archived","Gearchiveerd"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
<label>Functie<select value={functionFilter} onChange={e=>setFunctionFilter(e.target.value)}><option value="">Alle functies</option>{data.functions.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
<label>Team<select value={teamFilter} onChange={e=>setTeamFilter(e.target.value)}><option value="">Alle teams</option>{[...new Set(data.dossierSummary?.map(s=>s.team).filter(Boolean))].map(t=><option key={t}>{t}</option>)}</select></label>
<label>Aandacht<select value={attentionFilter} onChange={e=>setAttentionFilter(e.target.value)}><option value="">Alle medewerkers</option><option value="contract">Contract eindigt binnen 90 dagen</option><option value="certificate">Kwalificatie controleren</option><option value="actions">Openstaande acties</option></select></label></section>}<ResourceTable empty={!rows.length} headers={<><SortHead label="Medewerker" active={sort.startsWith("name-")} direction={sort.endsWith("desc") ? "desc" : "asc"} onClick={() => setColumnSort("name")}/><SortHead label="Personeelsnummer" active={sort.startsWith("number-")} direction={sort.endsWith("desc") ? "desc" : "asc"} onClick={() => setColumnSort("number")}/><SortHead label="Contact"/><SortHead label="Functie"/><SortHead label="Kwalificaties"/><SortHead label="Status" active={sort.startsWith("status-")} direction={sort.endsWith("desc") ? "desc" : "asc"} onClick={() => setColumnSort("status")}/><SortHead label="Acties" className="actions-column"/></>}>
    {rows.map((person) => { const functions = data.personnelFunctions.filter((item) => item.personnel_id === person.id).map((item) => data.functions.find((fn) => fn.id === item.function_id)?.name).filter(Boolean); const qualifications = data.qualifications.filter((item) => item.personnel_id === person.id); return <tr key={person.id}><td><div className="resource-primary"><span className="avatar avatar-blue">{initials(person.full_name)}</span><span><strong>{person.full_name}</strong><small>{date(person.start_date)}</small></span></div></td><td><span className="resource-code">{person.employee_number}</span></td><td><strong className="cell-main">{person.email ?? "—"}</strong><small>{person.phone ?? ""}</small></td><td>{data.functions.find(f=>f.id===summary.get(person.id)?.function_id)?.name||functions.join(" · ")||"—"}<small>{summary.get(person.id)?.team}</small></td><td>{qualifications.map((item) => item.code).join(" · ") || "—"}</td><td><StatusBadge tone={person.status === "active" ? "green" : person.status === "invited" ? "blue" : "neutral"}>{person.status === "active" ? "Actief" : person.status === "invited" ? "Uitgenodigd" : person.status === "former" ? "Uit dienst" : "Inactief"}</StatusBadge></td><td><RowActions onView={() => setModal({ type: "view", item: person })} onEdit={() => setModal({ type: "edit", item: person })} archive={<ArchiveButton action={archivePersonnel} fields={{ personnelId: person.id, version: String(person.version) }} label={`Medewerker ${person.full_name} verwijderen`} success="Medewerker gedeactiveerd"/>} more={<><PopoverClose asChild><button type="button" onClick={() => setModal({ type: "manage", item: person })}>Functies, kwalificaties en documenten</button></PopoverClose><PersonnelInvitationButton person={person}/></>}/></td></tr>; })}
  </ResourceTable>{modal?.type === "create" && <PersonnelWizard suggestedNumber={suggestedNumber} onClose={() => setModal(null)}/>} {modal?.type === "edit" && <PersonnelEdit person={modal.item} onClose={() => setModal(null)}/>} {modal?.type === "view" && <PersonnelDetail person={modal.item} data={data} onClose={() => setModal(null)}/>} {modal?.type === "manage" && <PersonnelDetail person={modal.item} data={data} manage onClose={() => setModal(null)}/>}</>;
}

const reportStage = (order: WorkOrder) => ["approved", "invoice_ready", "invoiced"].includes(order.status) ? "processed" : "open";

export function ReportsPage({ data, timezone }: { data: WorkspaceData; timezone: string }) {
  const customerById = useMemo(() => new Map(data.customers.map((item) => [item.id, item])), [data.customers]); const objectById = useMemo(() => new Map(data.objects.map((item) => [item.id, item])), [data.objects]);
  const reportOrders = useMemo(() => data.workOrders.filter((item) => ["completed", "under_review", "correction_required", "returned", "approved", "invoice_ready", "invoiced"].includes(item.status)), [data.workOrders]);
  const [query, setQuery] = useState(""); const [filter, setFilter] = useState("all"); const [sort, setSort] = useState("date-desc"); const [selected, setSelected] = useState<WorkOrder | null>(null);
  const rows = useMemo(() => reportOrders.filter((item) => filter === "all" || reportStage(item) === filter).filter((item) => [item.work_order_number, customerById.get(item.customer_id)?.name, objectById.get(item.object_id)?.name, item.discipline].some((value) => value?.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => { const [field, direction] = sort.split("-"); const left = field === "number" ? a.work_order_number : a.updated_at; const right = field === "number" ? b.work_order_number : b.updated_at; return left.localeCompare(right, "nl") * (direction === "desc" ? -1 : 1); }), [customerById, filter, objectById, query, reportOrders, sort]);
  return <><ResourceHeader eyebrow="KWALITEIT" title="Rapportcontrole" description="Openstaande en verwerkte werkrapporten met aantoonbare controle-status."/><ListToolbar query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} filterOptions={[{ value: "all", label: "Alle statussen" }, { value: "open", label: "Openstaand" }, { value: "processed", label: "Verwerkt" }]} sort={sort} onSort={setSort} sortOptions={[{ value: "date-desc", label: "Nieuwste eerst" }, { value: "date-asc", label: "Oudste eerst" }, { value: "number-asc", label: "Werkbonnummer" }]} resultCount={rows.length}/><ResourceTable empty={!rows.length} headers={<><SortHead label="Werkbon"/><SortHead label="Klant"/><SortHead label="Object"/><SortHead label="Bijgewerkt"/><SortHead label="Rapport"/><SortHead label="Status"/><SortHead label="Acties" className="actions-column"/></>}>
    {rows.map((order) => { const reports = data.reports.filter((item) => item.work_order_id === order.id); const stage = reportStage(order); return <tr key={order.id}><td><strong>{order.work_order_number}</strong><small>{order.discipline}</small></td><td>{customerById.get(order.customer_id)?.name ?? "—"}</td><td>{objectById.get(order.object_id)?.name ?? "—"}</td><td>{dateTime(order.updated_at, timezone)}</td><td>{reports.length} {reports.length === 1 ? "regel" : "regels"}<small>Versie {order.report_version}</small></td><td><StatusBadge tone={stage === "processed" ? "green" : "orange"}>{reportStateLabels[order.report_state]??(stage === "processed" ? "Verwerkt" : "Openstaand")}</StatusBadge></td><td><div className="resource-actions"><button className="resource-action" onClick={() => setSelected(order)}><Eye size={13}/>Bekijk</button></div></td></tr>; })}
  </ResourceTable>{selected && <Modal title={`Rapport ${selected.work_order_number}`} eyebrow={reportStage(selected) === "processed" ? "VERWERKT" : "OPENSTAAND"} onClose={() => setSelected(null)} wide><ReportPanel orderId={selected.id} canReview/><details><summary>Interne rapporttijdlijn</summary><section className="report-detail">{data.reports.filter((item) => item.work_order_id === selected.id).map((item) => <article key={item.id}><span>{dateTime(item.created_at, timezone)}</span><p>{item.body}</p></article>)}</section></details></Modal>}</>;
}

type InvoiceStage = "new" | "submitted" | "open" | "paid" | "late";
const invoiceStage = (invoice: Invoice): InvoiceStage => invoice.status === "paid" ? "paid" : invoice.status === "overdue" ? "late" : invoice.status === "draft" ? "new" : invoice.status === "final" ? "submitted" : "open";
const invoiceStageLabel: Record<InvoiceStage, string> = { new: "Nieuw", submitted: "Ingediend", open: "Openstaand", paid: "Betaald", late: "Te laat" };

export function InvoicesPage({ data }: { data: WorkspaceData }) {
  const customerById = useMemo(() => new Map(data.customers.map((item) => [item.id, item])), [data.customers]); const [query, setQuery] = useState(""); const [filter, setFilter] = useState("all"); const [sort, setSort] = useState("date-desc"); const params=useSearchParams(); const [modal, setModal] = useState<{ type: "create" | "bundle" } | { type: "view"; item: Invoice } | null>(()=>{const item=data.invoices.find(i=>i.id===params.get("record"));return item?{type:"view",item}:null;});
  const invoiceReadyGroups = useMemo(() => Array.from(data.workOrders.filter((item) => item.status === "invoice_ready").reduce<Map<string, WorkOrder[]>>((map, item) => map.set(item.customer_id, [...(map.get(item.customer_id) ?? []), item]), new Map()).entries()), [data.workOrders]);
  const openGroups = useMemo(() => Array.from(data.invoices.filter((item) => item.status !== "draft" && item.paid_cents < item.total_cents).reduce<Map<string, Invoice[]>>((map, item) => map.set(item.customer_id, [...(map.get(item.customer_id) ?? []), item]), new Map()).entries()).filter(([, invoices]) => invoices.length > 1), [data.invoices]);
  const rows = useMemo(() => data.invoices.filter((item) => filter === "all" || invoiceStage(item) === filter).filter((item) => [item.invoice_number ?? "Concept", customerById.get(item.customer_id)?.name, invoiceStageLabel[invoiceStage(item)]].some((value) => value?.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => { const [field, direction] = sort.split("-"); const left = field === "number" ? a.invoice_number ?? "" : field === "amount" ? String(a.total_cents).padStart(16, "0") : a.created_at; const right = field === "number" ? b.invoice_number ?? "" : field === "amount" ? String(b.total_cents).padStart(16, "0") : b.created_at; return left.localeCompare(right, "nl") * (direction === "desc" ? -1 : 1); }), [customerById, data.invoices, filter, query, sort]);
  return <><ResourceHeader eyebrow="FINANCE" title="Facturen" description="Van nieuwe factuur tot betaling, met één herkenbare status per regel." actions={<><button className="secondary-button" disabled={!openGroups.length} onClick={() => setModal({ type: "bundle" })}>Betaallink bundelen</button><button className="primary-button" disabled={!invoiceReadyGroups.length} onClick={() => setModal({ type: "create" })}><Plus size={16}/>Nieuwe factuur</button></>}/><ListToolbar query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} filterOptions={[{ value: "all", label: "Alle statussen" }, { value: "new", label: "Nieuw" }, { value: "submitted", label: "Ingediend" }, { value: "open", label: "Openstaand" }, { value: "paid", label: "Betaald" }, { value: "late", label: "Te laat" }]} sort={sort} onSort={setSort} sortOptions={[{ value: "date-desc", label: "Nieuwste eerst" }, { value: "date-asc", label: "Oudste eerst" }, { value: "number-asc", label: "Factuurnummer" }, { value: "amount-desc", label: "Hoogste bedrag" }]} resultCount={rows.length}/><ResourceTable empty={!rows.length} headers={<><SortHead label="Factuur"/><SortHead label="Klant"/><SortHead label="Datum"/><SortHead label="Totaal"/><SortHead label="Openstaand"/><SortHead label="Status"/><SortHead label="Acties" className="actions-column"/></>}>
    {rows.map((invoice) => { const stage = invoiceStage(invoice); const paymentAttempts = new Set(data.allocations.filter((item) => item.invoice_id === invoice.id).map((item) => item.payment_attempt_id)).size; return <tr key={invoice.id}><td><strong>{invoice.invoice_number ?? "Concept"}</strong><small>v{invoice.version}</small></td><td>{customerById.get(invoice.customer_id)?.name ?? "—"}</td><td>{invoice.issued_on ?? date(invoice.created_at)}</td><td>{money(invoice.total_cents)}</td><td>{money(invoice.total_cents - invoice.paid_cents)}</td><td><StatusBadge tone={stage === "paid" ? "green" : stage === "late" ? "orange" : stage === "open" ? "blue" : "neutral"}>{invoiceStageLabel[stage]}</StatusBadge></td><td><div className="resource-actions"><button className="resource-action" onClick={() => setModal({ type: "view", item: invoice })}><Eye size={13}/>Bekijk</button>{invoice.status !== "draft" && <ServerForm action={sendInvoice} success="Betaallink gekopieerd" className="inline-server-form" submitLabel="Verstuur" onSuccess={(result) => { if (result.ok && "paymentUrl" in result && result.paymentUrl) void navigator.clipboard.writeText(String(result.paymentUrl)); }}><input type="hidden" name="invoiceId" value={invoice.id}/></ServerForm>}<ResourceMore><span>{data.invoiceLines.filter((item) => item.invoice_id === invoice.id).length} regels</span><span>{paymentAttempts} betaalpogingen</span></ResourceMore></div></td></tr>; })}
  </ResourceTable>{modal?.type === "create" && <Modal title="Nieuwe factuur" eyebrow="FACTUREERBARE WERKBONNEN" onClose={() => setModal(null)}>{invoiceReadyGroups.map(([customerId, orders]) => <ServerForm key={customerId} action={createInvoice} success="Factuur aangemaakt" className="invoice-choice" submitLabel={orders.length > 1 ? "Verzamelfactuur maken" : "Factuur maken"} onSuccess={() => setModal(null)}><input type="hidden" name="workOrderIds" value={orders.map((item) => item.id).join(",")}/><span><strong>{customerById.get(customerId)?.name}</strong><small>{orders.map((item) => item.work_order_number).join(" · ")}</small></span></ServerForm>)}</Modal>} {modal?.type === "bundle" && <Modal title="Betaallink bundelen" eyebrow="OPENSTAANDE FACTUREN" onClose={() => setModal(null)}>{openGroups.map(([customerId, invoices]) => <ServerForm key={customerId} action={createPaymentBundle} success="Betaallink aangemaakt" className="invoice-choice" submitLabel="Link maken" onSuccess={(result) => { if (result.ok && "paymentUrl" in result && result.paymentUrl) void navigator.clipboard.writeText(String(result.paymentUrl)); setModal(null); }}><input type="hidden" name="invoiceIds" value={invoices.map((item) => item.id).join(",")}/><span><strong>{customerById.get(customerId)?.name}</strong><small>{invoices.map((item) => item.invoice_number).join(" · ")}</small></span></ServerForm>)}</Modal>} {modal?.type === "view" && <Modal title={modal.item.invoice_number ?? "Nieuwe factuur"} eyebrow={invoiceStageLabel[invoiceStage(modal.item)]} onClose={() => setModal(null)}><div className="detail-grid"><div><span>Klant</span><strong>{customerById.get(modal.item.customer_id)?.name ?? "—"}</strong></div><div><span>Vervaldatum</span><strong>{modal.item.due_on ?? "—"}</strong></div><div><span>Totaal</span><strong>{money(modal.item.total_cents)}</strong></div><div><span>Betaald</span><strong>{money(modal.item.paid_cents)}</strong></div></div>{!modal.item.pdf_storage_path && modal.item.invoice_number && <ServerForm action={createInvoice} success="PDF hersteld" submitLabel="PDF herstellen" onSuccess={()=>setModal(null)}><input type="hidden" name="invoiceId" value={modal.item.id}/><p className="form-note wide">De factuur is al vastgelegd. Alleen de ontbrekende PDF wordt opnieuw gemaakt, zonder nieuwe factuur of bronallocatie.</p></ServerForm>}{modal.item.paid_cents < modal.item.total_cents && <ServerForm action={registerManualPayment} success="Betaling geboekt" submitLabel="Betaling boeken" onSuccess={() => setModal(null)}><input type="hidden" name="invoiceId" value={modal.item.id}/><label>Bedrag<input name="amount" type="number" step=".01" max={(modal.item.total_cents - modal.item.paid_cents) / 100} required/></label><label>Datum<input name="date" type="date" required/></label><label className="wide">Referentie<input name="reference" required/></label></ServerForm>}</Modal>}</>;
}
