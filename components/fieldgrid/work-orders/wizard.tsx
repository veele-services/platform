"use client";

import { Children, Fragment, cloneElement, isValidElement, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { TenantContext } from "@/lib/auth/context";
import { saveWorkOrderSchema, type SaveWorkOrderInput, type WorkOrderDossier, type WorkOrderOptions } from "@/lib/work-orders/model";
import { loadWorkOrderOptions, saveWorkOrder } from "@/app/app/work-order-actions";
import { localDateTime, localToInstant } from "@/lib/planning/time";
import { CustomerWizard } from "@/components/fieldgrid/customers/forms";
import { ObjectWizard } from "@/components/fieldgrid/objects/forms";
import { WorkOrderDialog } from "./dialog";
import { contactRoleLabels, orderHours, priorityLabels, signatureLabels } from "./presentation";

type TaskChoice = { key: string; revisionId: string; quantity: number; instructions: string };
type CrewChoice = { personnelId: string; start: string; end: string };
type ContactChoice = { id: string; roles: Array<"site" | "requester" | "extra_approver" | "handover" | "billing"> };
const steps = ["Klant en object", "Werkzaamheden", "Contacten en instructies", "Uitvoering", "Controle en ondertekening", "Samenvatting"];

export function WorkOrderWizard({ tenant, options: initialOptions, dossier, onClose, onSaved }: { tenant: TenantContext; options: WorkOrderOptions; dossier?: WorkOrderDossier; onClose: () => void; onSaved: (id: string) => void }) {
  const order = dossier?.order;
  const [id] = useState(() => order?.id ?? crypto.randomUUID());
  const [mutationId, setMutationId] = useState(() => crypto.randomUUID());
  const [options, setOptions] = useState(initialOptions), [step, setStep] = useState(1), [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false), [error, setError] = useState(""), [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [nested, setNested] = useState<"customer" | "object" | null>(null), [warnings, setWarnings] = useState<Array<{ key: string; message: string }>>([]), [confirmedWarnings, setConfirmedWarnings] = useState<string[]>([]);
  const [customerId, setCustomerId] = useState(order?.customerId ?? ""), [objectId, setObjectId] = useState(order?.objectId ?? "");
  const [title, setTitle] = useState(order?.title ?? ""), [description, setDescription] = useState(order?.description ?? ""), [discipline, setDiscipline] = useState(order?.discipline ?? ""), [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">((order?.priority as "normal") ?? "normal");
  const [labels, setLabels] = useState(order?.labels.join(", ") ?? ""), [locationLabel, setLocationLabel] = useState(order?.locationLabel ?? "");
  const preserveTasks = Boolean(order && (order.planningState !== "draft" || order.publishedAt || order.quoteId || dossier?.tasks.some(t => !t.task_revision_id || t.agreement_line_id || t.completed_at)));
  const [templateRevisionId, setTemplateRevisionId] = useState<string>(order?.templateRevisionId ?? "");
  const [tasks, setTasks] = useState<TaskChoice[]>(() => dossier?.tasks.filter(t => !t.is_extra_work && t.task_revision_id).map(t => ({ key: t.id, revisionId: t.task_revision_id!, quantity: t.quantity, instructions: t.instructions ?? "" })) ?? []);
  const [contacts, setContacts] = useState<ContactChoice[]>(() => dossier?.contacts.map(c => ({ id: c.id, roles: c.roles.filter(r => r in contactRoleLabels) as ContactChoice["roles"] })) ?? []);
  const [instructions, setInstructions] = useState(order?.instructions ?? ""), [plannerId, setPlannerId] = useState(order?.plannerId ?? ""), [leadPersonnelId, setLeadPersonnelId] = useState(order?.leadPersonnelId ?? "");
  const [reference, setReference] = useState(order?.customerReference ?? ""), [purchaseOrder, setPurchaseOrder] = useState(order?.purchaseOrder ?? ""), [costCenter, setCostCenter] = useState(order?.costCenter ?? "");
  const [deadline, setDeadline] = useState(order?.deadline?.slice(0, 10) ?? ""), [requestedDate, setRequestedDate] = useState(order?.requestedDate ?? "");
  const local = (value: string | null | undefined) => value ? localDateTime(value, tenant.timezone) : "";
  const [start, setStart] = useState(local(order?.start)), [end, setEnd] = useState(local(order?.end));
  const [windowStart, setWindowStart] = useState(local(order?.windowStart)), [windowEnd, setWindowEnd] = useState(local(order?.windowEnd));
  const [windowKind, setWindowKind] = useState<"arrival" | "execution" | "unknown">(order?.windowKind ?? "unknown"), [requiredPersonnel, setRequiredPersonnel] = useState(order?.requiredPersonnel ?? 1);
  const [crew, setCrew] = useState<CrewChoice[]>(() => dossier?.assignments.filter(a => a.status !== "cancelled").map(a => ({ personnelId: a.personnelId, start: local(a.start), end: local(a.end) })) ?? []);
  const [checklists, setChecklists] = useState<string[]>(() => dossier?.checklists.map(c => c.revisionId) ?? []), [signatureMode, setSignatureMode] = useState<"inherit" | "none" | "optional" | "required">(order?.signatureMode ?? "inherit"), [employeeSignature, setEmployeeSignature] = useState(order?.employeeSignatureRequired ?? false);
  const formRef = useRef<HTMLFormElement>(null), errorRef = useRef<HTMLParagraphElement>(null);
  const object = options.objects.find(o => o.id === objectId), customer = options.customers.find(c => c.id === customerId), template = options.templates.find(t => t.revisionId === templateRevisionId);
  const effectiveSignature = signatureMode !== "inherit" ? signatureMode : object?.signatureMode && object.signatureMode !== "inherit" ? object.signatureMode : template?.definition.signatureMode ?? options.defaultSignatureMode;
  const signatureSource = signatureMode !== "inherit" ? "instelling op deze werkbon" : object?.signatureMode && object.signatureMode !== "inherit" ? "instelling van Object 360" : template?.definition.signatureMode ? "werkbontemplate" : "tenantstandaard";
  const totalMinutes = preserveTasks ? order?.durationMinutes ?? dossier?.tasks.reduce((sum, t) => sum + t.duration_minutes * t.quantity, 0) ?? 0 : tasks.reduce((sum, t) => sum + (options.tasks.find(c => c.revisionId === t.revisionId)?.durationMinutes ?? 0) * t.quantity, 0);
  const customerContacts = options.contacts.filter(c => c.customer_id === customerId).sort((a, b) => Number(b.objectIds.includes(objectId)) - Number(a.objectIds.includes(objectId)));
  const markChanged = () => { setDirty(true); setMutationId(crypto.randomUUID()); setWarnings([]); setConfirmedWarnings([]); };
  const fail = (message: string, fields: Record<string, string> = {}) => { setError(message); setFieldErrors(fields); queueMicrotask(() => errorRef.current?.focus()); };
  const field = (name: string, label: string, children: ReactNode, wide = false) => {
    const controls = (nodes: ReactNode): ReactNode => Children.map(nodes, node => {
      if (!isValidElement<{ children?: ReactNode; "aria-label"?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>(node)) return node;
      if (node.type === Fragment) return cloneElement(node, { children: controls(node.props.children) });
      return typeof node.type === "string" && ["input", "select", "textarea"].includes(node.type) ? cloneElement(node, { "aria-label": label, "aria-invalid": Boolean(fieldErrors[name]), "aria-describedby": fieldErrors[name] ? `wo-error-${name}` : undefined }) : node;
    });
    return <label className={wide ? "wide" : undefined}>{label}{controls(children)}{fieldErrors[name] && <small id={`wo-error-${name}`} className="wo-field-error" role="alert">{fieldErrors[name]}</small>}</label>;
  };
  const changeCustomer = (value: string) => { setCustomerId(value); setObjectId(""); setContacts([]); markChanged(); };
  const applyTemplate = (revisionId: string) => {
    if (tasks.length && !window.confirm("De taken uit dit template toevoegen aan de huidige werkzaamheden? Bestaande taken blijven behouden.")) return;
    setTemplateRevisionId(revisionId);
    const chosen = options.templates.find(t => t.revisionId === revisionId);
    if (chosen) {
      if (chosen.definition.discipline) setDiscipline(chosen.definition.discipline);
      if (chosen.definition.requiredPersonnel) setRequiredPersonnel(chosen.definition.requiredPersonnel);
      setTasks(previous => [...previous, ...(chosen.definition.tasks ?? []).map(t => ({ ...t, key: crypto.randomUUID(), instructions: t.instructions ?? "" }))]);
      setChecklists(previous => [...new Set([...previous, ...(chosen.definition.checklistRevisionIds ?? [])])]);
      if (options.canManageSignature && chosen.definition.employeeSignatureRequired) setEmployeeSignature(true);
    }
    markChanged();
  };
  const checkStep = () => {
    const inputs = formRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("fieldset.wo-wizard-step:not([hidden]) input, fieldset.wo-wizard-step:not([hidden]) select, fieldset.wo-wizard-step:not([hidden]) textarea");
    if (inputs && ![...inputs].every(input => input.reportValidity())) return false;
    if (step === 1 && (!customerId || !objectId || object?.customer_id !== customerId)) { fail("Kies een klant en een passend object.", { objectId: "Kies een object bij de geselecteerde klant." }); return false; }
    if (step === 2 && (!title.trim() || !discipline.trim() || (!tasks.length && !preserveTasks))) { fail("Vul de titel, dienstcategorie en minimaal één taak in.", !tasks.length ? { tasks: "Voeg minimaal één taak toe." } : {}); return false; }
    if (step === 4 && ((start && !end) || (!start && end) || crew.some(c => !c.start || !c.end))) { fail("Vul bij een geplande inzet zowel de begin- als eindtijd in."); return false; }
    setError(""); setFieldErrors({}); return true;
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const draft = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "draft";
    if (!draft && !checkStep()) return;
    try {
      const instant = (value: string) => value ? localToInstant(value, tenant.timezone) : null;
      const input: SaveWorkOrderInput = { id, version: order?.version ?? 0, mutationId, customerId, objectId, title, description, discipline, priority, labels: labels.split(",").map(s => s.trim()).filter(Boolean), locationLabel, plannerId: plannerId || null, leadPersonnelId: leadPersonnelId || null, customerReference: reference, purchaseOrder, costCenter, deadline: deadline || null, requestedDate: requestedDate || null, windowStart: instant(windowStart), windowEnd: instant(windowEnd), windowKind, requiredPersonnel, durationMinutes: totalMinutes ? Math.ceil(totalMinutes) : null, instructions, contacts, tasks: tasks.map(({ revisionId, quantity, instructions }) => ({ revisionId, quantity, instructions })), templateRevisionId: templateRevisionId || null, checklistRevisionIds: checklists, signatureMode, employeeSignatureRequired: employeeSignature, state: draft ? "draft" : start ? "tentative" : "unassigned", start: instant(start), end: instant(end), assignments: crew.map(c => ({ personnelId: c.personnelId, start: instant(c.start)!, end: instant(c.end)! })), confirmedWarnings };
      input.preserveTasks = preserveTasks;
      if (preserveTasks) input.durationMinutes = order?.durationMinutes ?? null;
      if (!draft && start && order?.planningState === "final") input.state = "final";
      const parsed = saveWorkOrderSchema.safeParse(input);
      if (!parsed.success) {
        const errors = Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message]));
        fail("Controleer de gemarkeerde velden. Je invoer is behouden.", errors);
        const first = String(parsed.error.issues[0]?.path[0]);
        setStep(["customerId", "objectId"].includes(first) ? 1 : ["title", "discipline", "tasks"].includes(first) ? 2 : ["contacts", "instructions"].includes(first) ? 3 : 4);
        return;
      }
      if (input.start && input.end && Date.parse(input.end) <= Date.parse(input.start)) { setStep(4); fail("De eindtijd moet na de begintijd liggen.", { end: "Kies een latere eindtijd." }); return; }
      if (input.assignments?.some(c => Date.parse(c.end) <= Date.parse(c.start))) { setStep(4); fail("Controleer de begin- en eindtijd van iedere medewerker."); return; }
      if (crew.length && !leadPersonnelId) { setStep(4); fail("Kies de uitvoeringsverantwoordelijke.", { leadPersonnelId: "Selecteer een toegewezen medewerker." }); return; }
      setError("");
      startTransition(async () => {
        try {
          const result = await saveWorkOrder(input);
          if (!result.ok) { setError(result.error); setWarnings(result.warnings ?? []); queueMicrotask(() => errorRef.current?.focus()); return; }
          setDirty(false); toast.success(draft ? "Concept opgeslagen" : "Werkbon opgeslagen"); onSaved(result.id);
        } catch { fail("Geen bevestiging ontvangen. Je invoer is behouden; probeer opnieuw om dezelfde werkbon op te slaan."); }
      });
    } catch (cause) { fail(cause instanceof Error ? cause.message : "Controleer de datum en tijden."); setStep(4); }
  };
  const refreshOptions = async (createdId: string, kind: "customer" | "object") => {
    setNested(null);
    try { const fresh = await loadWorkOrderOptions(); setOptions(fresh); if (kind === "customer") changeCustomer(createdId); else { setObjectId(createdId); markChanged(); } }
    catch { fail("Het nieuwe dossier is opgeslagen, maar de keuzelijst kon niet worden vernieuwd. Sluit deze wizard pas nadat je invoer is bewaard."); }
  };
  return <>
    <WorkOrderDialog title={order ? `Bewerk ${order.number}` : "Nieuwe werkbon"} description="Leg werkzaamheden en uitvoering vast. Planning publiceer je afzonderlijk." tenant={tenant} onClose={onClose} dirty={dirty} busy={pending}>
      <ol className="wizard-progress">{steps.map((label, index) => <li key={label} className={index < step ? "active" : ""} aria-current={step === index + 1 ? "step" : undefined}><span>{index + 1}</span><small>{label}</small></li>)}</ol>
      <form ref={formRef} className="commercial-wizard" noValidate onChange={event => { if (!(event.target as HTMLElement).closest("[data-planning-warning]")) markChanged(); }} onSubmit={save}>
        {error && <p ref={errorRef} tabIndex={-1} className="wo-error" role="alert">{error}</p>}
        <fieldset className="wo-wizard-step" hidden={step !== 1}><legend>Klant en uitvoerobject</legend>
          {field("customerId", "Klant", <select required value={customerId} onChange={e => changeCustomer(e.target.value)}><option value="">Kies een klant</option>{options.customers.map(c => <option key={c.id} value={c.id}>{c.customer_number} · {c.name}</option>)}</select>)}
          {field("objectId", "Object", <select required disabled={!customerId} value={objectId} onChange={e => setObjectId(e.target.value)}><option value="">Kies een object</option>{options.objects.filter(o => o.customer_id === customerId).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>)}
          <button type="button" className="secondary-button" onClick={() => setNested("customer")}><Plus size={15}/>Nieuwe klant</button><button type="button" className="secondary-button" disabled={!customerId} onClick={() => setNested("object")}><Plus size={15}/>Nieuw object</button>
          {field("locationLabel", "Gebouwdeel, verdieping of ruimte", <input value={locationLabel} maxLength={300} onChange={e => setLocationLabel(e.target.value)}/>, true)}
        </fieldset>
        <fieldset className="wo-wizard-step" hidden={step !== 2}><legend>Werkzaamheden</legend>
          {field("title", "Titel", <input required minLength={2} maxLength={180} value={title} onChange={e => setTitle(e.target.value)}/>)}
          {field("discipline", "Dienstcategorie", <><input required maxLength={100} list="wo-disciplines" value={discipline} onChange={e => setDiscipline(e.target.value)}/><datalist id="wo-disciplines">{options.disciplines.map(d => <option key={d}>{d}</option>)}</datalist></>)}
          {field("templateRevisionId", "Werkbontemplate", <select disabled={preserveTasks} value={templateRevisionId} onChange={e => applyTemplate(e.target.value)}><option value="">Zonder template</option>{options.templates.filter(t => t.kind === "work_order" && (t.state === "published" || t.revisionId === templateRevisionId)).map(t => <option key={t.revisionId} value={t.revisionId}>{t.name} · versie {t.version}</option>)}</select>)}
          {field("priority", "Prioriteit", <select value={priority} onChange={e => setPriority(e.target.value as typeof priority)}>{Object.entries(priorityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>)}
          {field("description", "Omschrijving", <textarea rows={3} value={description} maxLength={10000} onChange={e => setDescription(e.target.value)}/>, true)}
          {preserveTasks && <p className="dossier-notice wide">De vastgelegde werkzaamheden en commerciële herkomst blijven behouden. Gebruik deelbonnen of opvolgbonnen om resterend werk over te dragen.</p>}
          <fieldset className="wo-task-list wide" disabled={preserveTasks}><legend className="sr-only">Taken</legend><label>Taak toevoegen<select aria-label="Taak toevoegen" value="" onChange={e => { if (e.target.value) setTasks(previous => [...previous, { key: crypto.randomUUID(), revisionId: e.target.value, quantity: 1, instructions: "" }]); }}><option value="">Kies uit Taken & tarieven</option>{options.tasks.map(t => <option key={t.revisionId} value={t.revisionId}>{t.code} · {t.name}</option>)}</select></label>{fieldErrors.tasks && <p className="wo-field-error">{fieldErrors.tasks}</p>}
            {tasks.map((task, index) => { const catalog = options.tasks.find(t => t.revisionId === task.revisionId); const change = (patch: Partial<TaskChoice>) => setTasks(previous => previous.map((item, i) => i === index ? { ...item, ...patch } : item)); return <div className="wo-task-row" key={task.key}><header><h3>{catalog?.code} · {catalog?.name ?? "Vastgelegde taakversie"}</h3><button type="button" className="resource-action danger" aria-label={`Verwijder taak ${catalog?.name ?? index + 1}`} onClick={() => { setTasks(previous => previous.filter((_, i) => i !== index)); markChanged(); }}><Trash2 size={14}/></button></header><label>Hoeveelheid ({catalog?.unit ?? "eenheden"})<input type="number" required min="0.001" max="100000" step="0.001" value={task.quantity} onChange={e => change({ quantity: Number(e.target.value) })}/></label><p className="form-note">Normtijd: {Math.round((catalog?.durationMinutes ?? 0) * task.quantity)} arbeidsminuten{options.finance && catalog?.priceCents !== undefined && <><br/>Tarief: {new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(catalog.priceCents / 100)} per {catalog.unit}</>}</p><label className="wide">Taakinstructie<textarea rows={2} maxLength={2000} value={task.instructions} onChange={e => change({ instructions: e.target.value })}/></label></div>; })}
          </fieldset><p className="form-note wide">Begroot: {Math.ceil(totalMinutes)} arbeidsminuten ({orderHours(totalMinutes)} uur). De bezoekduur wordt apart gepland.</p>
          {field("labels", "Labels, gescheiden door komma’s", <input value={labels} maxLength={1200} onChange={e => setLabels(e.target.value)}/>, true)}
        </fieldset>
        <fieldset className="wo-wizard-step" hidden={step !== 3}><legend>Contacten en instructies</legend><div className="wo-contact-list wide">{customerContacts.map(c => { const selected = contacts.find(item => item.id === c.id); return <div className="wo-contact-row" key={c.id}><label className="wo-check wide"><input type="checkbox" checked={Boolean(selected)} onChange={e => setContacts(previous => e.target.checked ? [...previous, { id: c.id, roles: ["site"] }] : previous.filter(item => item.id !== c.id))}/>{c.full_name}{c.objectIds.includes(objectId) && " · objectcontact"}</label>{selected && <div className="wo-contact-roles wide">{Object.entries(contactRoleLabels).filter(([key]) => options.finance || key !== "billing").map(([role, label]) => <label className="wo-check" key={role}><input type="checkbox" checked={selected.roles.includes(role as ContactChoice["roles"][number])} onChange={e => setContacts(previous => previous.map(item => item.id === c.id ? { ...item, roles: e.target.checked ? [...item.roles, role as ContactChoice["roles"][number]] : item.roles.filter(r => r !== role) } : item))}/>{label}</label>)}</div>}</div>; })}{!customerContacts.length && <p className="form-note">Bij deze klant zijn nog geen contactpersonen vastgelegd.</p>}</div>
          {object?.instructions && <div className="dossier-notice wide"><strong>Objectinstructies</strong><p className="wo-prewrap">{object.instructions}</p></div>}
          {field("instructions", "Instructies voor deze werkbon", <textarea maxLength={4000} rows={4} value={instructions} onChange={e => setInstructions(e.target.value)}/>, true)}<p className="form-note wide">Geheime toegangscodes blijven in de beveiligde objectkluis.</p>
          {field("customerReference", "Klantreferentie", <input maxLength={200} value={reference} onChange={e => setReference(e.target.value)}/>)}{options.finance && <>{field("purchaseOrder", "Inkoopnummer", <input maxLength={200} value={purchaseOrder} onChange={e => setPurchaseOrder(e.target.value)}/>)}{field("costCenter", "Kostenplaats", <input maxLength={200} value={costCenter} onChange={e => setCostCenter(e.target.value)}/>)}</>}
        </fieldset>
        <fieldset className="wo-wizard-step" hidden={step !== 4}><legend>Planning en individuele inzet</legend>
          {field("deadline", "Deadline", <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}/>)}{field("requestedDate", "Gewenste uitvoeringsdatum", <input type="date" value={requestedDate} onChange={e => setRequestedDate(e.target.value)}/>)}
          {field("start", "Begin bezoek", <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)}/>)}{field("end", "Einde bezoek", <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)}/>)}
          {field("windowStart", "Klantvenster vanaf", <input type="datetime-local" value={windowStart} onChange={e => setWindowStart(e.target.value)}/>)}{field("windowEnd", "Klantvenster tot", <input type="datetime-local" value={windowEnd} onChange={e => setWindowEnd(e.target.value)}/>)}
          {field("windowKind", "Betekenis klantvenster", <select value={windowKind} onChange={e => setWindowKind(e.target.value as typeof windowKind)}><option value="unknown">Nog niet afgesproken</option><option value="arrival">Aankomst</option><option value="execution">Volledige uitvoering</option></select>)}
          {field("requiredPersonnel", "Benodigde bezetting", <input required type="number" min="1" max="100" value={requiredPersonnel} onChange={e => setRequiredPersonnel(Number(e.target.value))}/>)}
          {field("plannerId", "Verantwoordelijke planner", <select value={plannerId} onChange={e => setPlannerId(e.target.value)}><option value="">Nog toewijzen</option>{options.planners.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>)}
          {field("leadPersonnelId", "Uitvoeringsverantwoordelijke", <select value={leadPersonnelId} onChange={e => setLeadPersonnelId(e.target.value)}><option value="">Nog toewijzen</option>{crew.map(c => <option key={c.personnelId} value={c.personnelId}>{options.personnel.find(p => p.id === c.personnelId)?.full_name ?? "Medewerker"}</option>)}</select>)}
          <div className="wo-crew-list wide"><label>Medewerker toevoegen<select aria-label="Medewerker toevoegen" value="" onChange={e => { if (e.target.value) { setCrew(previous => [...previous, { personnelId: e.target.value, start, end }]); if (!leadPersonnelId) setLeadPersonnelId(e.target.value); } }}><option value="">Kies medewerker</option>{options.personnel.filter(p => !crew.some(c => c.personnelId === p.id)).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>{crew.map((c, index) => <div className="wo-crew-row" key={c.personnelId}><header><h3>{options.personnel.find(p => p.id === c.personnelId)?.full_name ?? "Medewerker"}</h3><button type="button" className="resource-action danger" aria-label={`Verwijder inzet ${options.personnel.find(p => p.id === c.personnelId)?.full_name ?? index + 1}`} onClick={() => { setCrew(previous => previous.filter(item => item.personnelId !== c.personnelId)); if (leadPersonnelId === c.personnelId) setLeadPersonnelId(""); markChanged(); }}><Trash2 size={14}/></button></header><label>Begin eigen inzet<input required type="datetime-local" value={c.start} onChange={e => setCrew(previous => previous.map((item, i) => i === index ? { ...item, start: e.target.value } : item))}/></label><label>Einde eigen inzet<input required type="datetime-local" value={c.end} onChange={e => setCrew(previous => previous.map((item, i) => i === index ? { ...item, end: e.target.value } : item))}/></label></div>)}</div>
          <p className="form-note wide">{crew.length} van {requiredPersonnel} medewerkers geselecteerd. Laat planning en medewerkers leeg om de werkbon in ‘In te delen’ te bewaren. Tijden worden weergegeven in {tenant.timezone}; bezetting, objectvensters en beschikbaarheid worden bij opslaan gecontroleerd.</p>
        </fieldset>
        <fieldset className="wo-wizard-step" hidden={step !== 5}><legend>Controle en ondertekenvereisten</legend><div className="wo-checklist-list wide">{options.templates.filter(t => t.kind === "checklist" && t.state === "published").map(t => <div className="wo-checklist-row" key={t.revisionId}><label className="wo-check wide"><input type="checkbox" checked={checklists.includes(t.revisionId)} onChange={e => setChecklists(previous => e.target.checked ? [...previous, t.revisionId] : previous.filter(id => id !== t.revisionId))}/>{t.name} · versie {t.version}</label><small className="form-note wide">{t.definition.questions?.filter(q => q.required).length ?? 0} verplichte vragen</small></div>)}{!options.templates.some(t => t.kind === "checklist" && t.state === "published") && <p className="form-note">Er zijn nog geen gepubliceerde checklisttemplates.</p>}</div>
          {options.canManageSignature && <>{field("signatureMode", "Klantondertekening", <select disabled={Boolean(order?.publishedAt)} value={signatureMode} onChange={e => setSignatureMode(e.target.value as typeof signatureMode)}><option value="inherit">Overnemen</option><option value="none">Niet nodig</option><option value="optional">Optioneel</option><option value="required">Verplicht</option></select>)}<label className="wo-check"><input type="checkbox" disabled={Boolean(order?.publishedAt)} checked={employeeSignature} onChange={e => setEmployeeSignature(e.target.checked)}/>Afzonderlijke medewerkershandtekening vereist</label></>}
          {order?.publishedAt && <p className="form-note wide">Het ondertekenbeleid is bij publicatie vastgelegd. Beoordeel een eventuele vrijstelling met reden via Rapport &amp; handtekening.</p>}
          <div className="dossier-notice wide"><strong>{signatureLabels[effectiveSignature]} — {signatureSource}</strong><p>De klant tekent op het apparaat van de medewerker in de personeelsapp. Deze stap stelt de verplichting in.</p></div>
        </fieldset>
        <fieldset className="wo-wizard-step" hidden={step !== 6}><legend>Controleer de werkbon</legend><div className="wo-summary wide"><section><dl><div><dt>Klant</dt><dd>{customer?.name}</dd></div><div><dt>Object</dt><dd>{object?.name}</dd></div><div><dt>Titel</dt><dd>{title}</dd></div><div><dt>Contact op locatie</dt><dd>{contacts.filter(c => c.roles.includes("site")).map(c => options.contacts.find(p => p.id === c.id)?.full_name).join(", ") || "Nog niet vastgelegd"}</dd></div></dl></section><section><h3>Werkzaamheden</h3><ul>{tasks.map(t => <li key={t.key}>{t.quantity} {options.tasks.find(p => p.revisionId === t.revisionId)?.unit} · {options.tasks.find(p => p.revisionId === t.revisionId)?.name ?? "Vastgelegde taakversie"}</li>)}</ul><p>{Math.ceil(totalMinutes)} begrote arbeidsminuten.</p></section><section><h3>Planning en bezetting</h3><p>{start ? `${start.replace("T", " ")} – ${end.replace("T", " ")}` : "In te delen"} · {crew.length} van {requiredPersonnel} medewerkers</p>{crew.map(c => <p key={c.personnelId}>{options.personnel.find(p => p.id === c.personnelId)?.full_name} · {c.start.replace("T", " ")} – {c.end.replace("T", " ")}{c.personnelId === leadPersonnelId && " · uitvoeringsverantwoordelijke"}</p>)}</section><section><h3>Controle en ondertekening</h3><p>{checklists.map(id => options.templates.find(t => t.revisionId === id)?.name).join(", ") || "Geen checklist geselecteerd"}</p><p>Klantondertekening: {signatureLabels[effectiveSignature]} — {signatureSource}</p>{employeeSignature && <p>Afzonderlijke medewerkershandtekening vereist.</p>}</section></div></fieldset>
        {warnings.length > 0 && <div className="dossier-notice" data-planning-warning><strong>Controleer de planningsafwijkingen</strong>{warnings.map(w => <label className="wo-check" key={w.key}><input type="checkbox" checked={confirmedWarnings.includes(w.key)} onChange={e => setConfirmedWarnings(previous => e.target.checked ? [...previous, w.key] : previous.filter(key => key !== w.key))}/>{w.message}</label>)}</div>}
        <footer className="wizard-footer"><button type="button" className="secondary-button" disabled={pending} onClick={() => step === 1 ? (!dirty || window.confirm("Je wijzigingen zijn nog niet opgeslagen. Wil je ze weggooien?")) && onClose() : setStep(s => s - 1)}><ChevronLeft size={16}/>{step === 1 ? "Annuleren" : "Vorige"}</button><div className="wo-heading-actions">{step === 6 && (!order || order.planningState === "draft") && <button type="submit" value="draft" className="secondary-button" disabled={pending}>Bewaar concept</button>}{step < 6 ? <button key="next" type="button" className="primary-button" disabled={pending} onClick={() => { if (checkStep()) setStep(s => s + 1); }}>Volgende<ChevronRight size={16}/></button> : <button key="save" type="submit" value="save" className="primary-button" disabled={pending}>{pending ? "Opslaan…" : order ? "Wijzigingen opslaan" : "Maak werkbon"}</button>}</div></footer>
      </form>
    </WorkOrderDialog>
    {nested === "customer" && <CustomerWizard tenant={tenant} owners={options.planners.map(p => ({ ...p, commercial: false }))} defaultPaymentTermsDays={options.defaultPaymentTermsDays} onClose={() => setNested(null)} onSaved={id => { void refreshOptions(id, "customer"); }}/>}
    {nested === "object" && <ObjectWizard tenant={tenant} customers={options.customers.map(c => ({ ...c, status: "active" }))} customerId={customerId} onClose={() => setNested(null)} onSaved={id => { void refreshOptions(id, "object"); }}/>}
  </>;
}
