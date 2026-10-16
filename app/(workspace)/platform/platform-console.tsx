"use client";

import Image from "next/image";
import {platformModuleCatalogue,type PlatformModuleId} from "@/lib/platform/module-catalogue";
import { CRMOverview } from "@/components/fieldgrid/crm/CRMOverview";
import Link from "next/link";
import { platformConfigurationSummary } from "@/lib/platform/cockpit";
import { ActionIcon } from "@/components/fieldgrid/action-icon";
import { EmptyState } from "@/components/fieldgrid/empty-state";
import { PageHeading } from "@/components/fieldgrid/page-heading";
import { ContentTabs } from "@/components/fieldgrid/content-tabs";
import { ListPagination, useListPagination } from "@/components/fieldgrid/list-pagination";
import "./platform-consistency.css";
import {confirmDiscard,useUnsavedDraft} from "@/components/fieldgrid/unsaved-form";
import {changePlatformTenantStatus} from "./lifecycle-actions";
import {Modal,Field} from "@/components/fieldgrid/crm/ui";
import { TenantWorkspaceDomains } from "./tenant-workspace-domains";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays, UsersRound, Activity, ArrowDownAZ, ArrowLeft, ArrowRight, Building2, Check, CheckCircle2,
  ChevronRight, CircleHelp, ClipboardCheck, Code2, Copy, CreditCard, Download, LayoutDashboard,
  FileText, Layers3, Mail,
  MessageSquareText, Monitor, Palette, Plus, Search, Settings2, ShieldCheck,
  Smartphone, Upload, Users, X,
} from "lucide-react";
import {
  FIELDGRID_PRIMARY,
  FIELDGRID_SECONDARY,
  PREVIEW_VALUES,
  renderTemplateText,
  templateDefinition,
  type TemplateKey,
} from "@/lib/communications/templates";
import { renderTenantEmailHtml } from "@/lib/communications/email";
import { brandThemeStyle } from "@/lib/branding/palette";
import { BrandPalettePreview } from "@/components/fieldgrid/brand-palette-preview";
import type { PlatformData, PlatformTenant, PlatformTemplate } from "@/lib/platform/data";
import {
  createPlatformTenant,
  retryTenantAdminInvitation,
  savePlatformTemplate,
  updatePlatformTenantBranding,
  updatePlatformTenantCommunication,
  updatePlatformTenantModules,
  updatePlatformTenantWhiteLabel,
  uploadPlatformTenantLogo,
} from "./actions";

type View = "overview" | "tenants" | "onboarding" | "detail" | "templates";
type DetailTab = "overview" | "branding" | "modules" | "communications" | "domains";
type ModuleId = PlatformModuleId;

type Wizard = {
  requestKey: string;
  name: string;
  slug: string;
  domain: string;
  adminName: string;
  adminEmail: string;
  primaryColor: string;
  accentColor: string;
  enabledServices: ModuleId[];
  senderEmail: string;
  senderName:string;
};

const moduleIcons = {planning:CalendarDays,personeel:Users,rapportage:ClipboardCheck,finance:CreditCard,tickets:MessageSquareText,klantportaal:Building2,website:Layers3};
const moduleCatalog = platformModuleCatalogue.map(module=>({...module,icon:moduleIcons[module.id]}));

const availableModuleCount = moduleCatalog.filter(module => module.available).length;

const wizardLabels = ["Organisatie", "Beheerder", "Huisstijl", "Modules", "Communicatie", "Controleren"];
const sourceTemplateLabels:Record<TemplateKey,string>={workorder:'Werkbon beschikbaar',invoice:'Factuur verzonden',schedule:'Planning gewijzigd',quote:'Prijsopgave'};
const sourceTemplateOrder=['workorder','invitation','invoice','schedule','quote'] as const;

const blankWizard = (): Wizard => ({
  requestKey: crypto.randomUUID(),
  name: "",
  slug: "",
  domain: "",
  adminName: "",
  adminEmail: "",
  primaryColor: FIELDGRID_PRIMARY,
  accentColor: FIELDGRID_SECONDARY,
  enabledServices: ["planning", "personeel"],
  senderEmail: "",
  senderName:'',
});

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function brandStyle(primary: string, accent: string): CSSProperties {
  return brandThemeStyle(primary, accent);
}

function nlDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function statusLabel(status: string) {
  if (status === "active") return "Actief";
  if (status === "suspended") return "Gepauzeerd";
  return "Gearchiveerd";
}
function invitationLabel(status:string|null,hasOwner:boolean){return status==='pending'?'In wachtrij':status==='invited'?'Uitgenodigd':status==='active'?'Actief':status==='failed'?'Uitnodiging mislukt':hasOwner?'Beheerder actief':'Nog geen beheerder gekoppeld'}

function TenantBadge({ tenant, small = true }: { tenant: PlatformTenant; small?: boolean }) {
  const [unavailableLogo, setUnavailableLogo] = useState<string | null>(null);
  return <span className={`fg-tenant-logo${small ? " small" : ""}`} style={brandStyle(tenant.primaryColor, tenant.accentColor)}>
    {tenant.logoUrl && tenant.logoUrl !== unavailableLogo ? <Image src={tenant.logoUrl} alt="" width={64} height={64} unoptimized onError={() => setUnavailableLogo(tenant.logoUrl)} /> : initials(tenant.name)}
  </span>;
}

function Button({ children, variant = "outline", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "quiet" }) {
  return <button {...props} className={`${variant==='primary'?'primary-button':'secondary-button'} ${props.className ?? ""}`.trim()}>{children}</button>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <PageHeading eyebrow={eyebrow} title={title} help={description} actions={action}/>;
}

function ModuleCards({ enabled, onToggle, disabled,wizard=false }: { enabled: string[]; onToggle: (id: ModuleId) => void; disabled?: boolean;wizard?:boolean }) {
  return <div className="ed-module-grid">{moduleCatalog.map((module) => {
    const Icon = module.icon;
    const active = enabled.includes(module.id);
    return <button type="button" key={module.id} className={active?'selected':''} aria-pressed={active} title={module.description} aria-label={`${module.name} ${active ? "uitschakelen" : "inschakelen"}`} disabled={!module.available || disabled} onClick={() => module.available && onToggle(module.id as ModuleId)}>{!wizard&&<span><Icon size={23}/></span>}<strong>{module.name}</strong><small>{module.available?active?'Actief':'Uitgeschakeld':'Latere release'}</small><i>{active&&<Check size={14}/>}</i></button>;
  })}</div>;
}
function toggleModules(current:string[],id:ModuleId){const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);if(next.has('finance')){next.add('planning');next.add('rapportage')}if(next.has('rapportage'))next.add('planning');return[...next]}

function BrandPreview({ tenant, mode }: { tenant: PlatformTenant; mode: "desktop" | "mobile" | "invoice" }) {
  return <div className={`fg-brand-preview ${mode}`} style={brandStyle(tenant.primaryColor, tenant.accentColor)}>
    <div className="fg-preview-top"><span className="fg-preview-dots"><i /><i /><i /></span><span>{tenant.domain}</span><span className="fg-preview-secure"><ShieldCheck size={13} /> Veilige omgeving</span></div>
    {mode === "invoice" ? <div className="fg-preview-invoice"><div className="fg-preview-invoice-head"><TenantBadge tenant={tenant} /><strong>FACTUUR <small>FACT-2026-00481</small></strong></div><div className="fg-preview-invoice-body"><small>FACTUUR AAN</small><strong>Restaurant De Pier</strong><p>Werkzaamheden en goedgekeurde rapportage</p><div className="fg-preview-rule" /><span>Uitvoering op locatie <b>€ 175,00</b></span><span>BTW 21% <b>€ 36,75</b></span><div className="fg-preview-total">Totaal <strong>€ 211,75</strong></div></div></div>
      : <div className="fg-preview-app"><div className="fg-preview-sidebar"><TenantBadge tenant={tenant} /><span className="fg-preview-mini-line wide" /><span className="fg-preview-mini-line" /><span className="fg-preview-mini-line" /></div><div className="fg-preview-main"><div className="fg-preview-appbar"><strong>{tenant.name}</strong><span>FG</span></div><div className="fg-preview-content"><div className="fg-preview-hero"><small>WERKOMGEVING</small><h3>{mode === "mobile" ? "Mijn planning" : "Goedemorgen"}</h3><p>{mode === "mobile" ? "Jouw werkbonnen voor vandaag" : "Een helder overzicht van het werk vandaag."}</p></div><div className="fg-preview-cards"><span><b>24</b><small>Open werkbonnen</small></span><span><b>7</b><small>Ter controle</small></span></div><div className="fg-preview-row"><i /> Werkbon WB-2026-00581 <span>Gepland</span></div></div></div></div>}
  </div>;
}

function EmailCanvas({ tenant, template, draft, notify }: { tenant: PlatformTenant; template: PlatformTemplate; draft: { subject: string; body: string }; notify: (text: string) => void }) {
  const [source, setSource] = useState(false);
  const [mobile, setMobile] = useState(false);
  const kind = template.key === "quote" ? "quote" : "invoice";
  const brand = { company: tenant.name, domain: tenant.domain, primary: tenant.primaryColor, accent: tenant.accentColor, senderEmail: tenant.senderEmail, emailLogoUrl: tenant.logoUrl };
  const preview = renderTenantEmailHtml({ brand, kind, message: draft, mode: "preview" });
  const html = renderTenantEmailHtml({ brand, kind, message: draft, mode: "template" });

  async function copy() {
    try {
      await navigator.clipboard.writeText(html);
      notify("HTML-template gekopieerd. De bron bevat nog transactietokens.");
    } catch {
      setSource(true);
      notify("Selecteer de HTML handmatig in het bronveld.");
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${tenant.slug}-${kind}-template.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="fg-panel fg-html-email-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">LIVE VOORBEELD</span><h2>HTML e-mail</h2></div><span className="fg-template-state customized">{tenant.name}</span></div><div className="fg-email-controls"><div className="fg-preview-tabs"><button type="button" className={!source ? "active" : ""} onClick={() => setSource(false)}>Voorbeeld</button><button type="button" className={source ? "active" : ""} onClick={() => setSource(true)}><Code2 size={14} /> HTML</button></div>{!source && <div className="fg-preview-tabs"><button type="button" className={!mobile ? "active" : ""} onClick={() => setMobile(false)} aria-label="Desktop"><Monitor size={16} /></button><button type="button" className={mobile ? "active" : ""} onClick={() => setMobile(true)} aria-label="Mobiel"><Smartphone size={16} /></button></div>}</div>{source ? <div className="fg-email-code"><label htmlFor="email-source">HTML met transactietokens</label><textarea id="email-source" readOnly value={html} /></div> : <div className={`fg-email-canvas${mobile ? " mobile" : ""}`}><iframe title="Voorbeeld e-mail" sandbox="" srcDoc={preview} /></div>}<div className="fg-email-export"><Button variant="outline" onClick={copy}><Copy size={15} /> Kopieer HTML</Button><Button onClick={download}><Download size={15} /> Download HTML</Button></div><p className="fg-email-explain">Het voorbeeld is fictief en inert. Echte verzending bindt de beveiligde transactielink pas server-side.</p></section>;
}

export function PlatformConsole({ initialData }: { initialData: PlatformData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const params = useSearchParams();
  const requestedView = params.get("view");
  const view: View = requestedView && ["overview", "tenants", "onboarding", "detail", "templates"].includes(requestedView) ? requestedView as View : "overview";
  const requestedTab = params.get("tab");
  const detailTab: DetailTab = requestedTab && ["overview", "branding", "modules", "communications", "domains"].includes(requestedTab) ? requestedTab as DetailTab : "overview";
  const [selectedId, setSelectedId] = useState(initialData.tenants[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [tenantSort, setTenantSort] = useState<"name" | "status" | "createdAt">("name");
  const [tenantDescending, setTenantDescending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [wizard, setWizard] = useState<Wizard>(blankWizard);
  const [step, setStep] = useState(0);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile" | "invoice">("desktop");
  const [templateKey, setTemplateKey] = useState<TemplateKey>("workorder");
  const requestedTenant = params.get("tenant");
  const selected = initialData.tenants.find((tenant) => tenant.id === (requestedTenant ?? selectedId)) ?? (requestedTenant ? null : initialData.tenants[0]) ?? null;
  const selectedTemplate = selected?.templates.find((template) => template.key === templateKey) ?? null;
  const [draft, setDraft] = useState({ subject: selectedTemplate?.subject ?? "", body: selectedTemplate?.body ?? "" });
  const [lifecycleTarget,setLifecycleTarget]=useState<'active'|'suspended'|null>(null);
  const lifecycleRequest=useRef({signature:'',id:''});
  const mutationLock=useRef(false);
  const templateRequest=useRef({signature:'',id:''});
  const forceTemplateReload=useRef(false);
  const [brandingDraft, setBrandingDraft] = useState({ primary: selected?.primaryColor ?? FIELDGRID_PRIMARY, accent: selected?.accentColor ?? FIELDGRID_SECONDARY });
  const [moduleDraft, setModuleDraft] = useState<string[]>(selected?.enabledServices ?? []);
  const [communicationDraft, setCommunicationDraft] = useState({ senderName: selected?.senderName ?? "", senderEmail: selected?.senderEmail ?? "" });
  const dirtyTemplate = Boolean(selectedTemplate && (draft.subject !== selectedTemplate.subject || draft.body !== selectedTemplate.body));
  const dirtyDetail=Boolean(selected&&(brandingDraft.primary.toLowerCase()!==selected.primaryColor.toLowerCase()||brandingDraft.accent.toLowerCase()!==selected.accentColor.toLowerCase()||JSON.stringify([...moduleDraft].sort())!==JSON.stringify([...selected.enabledServices].sort())||communicationDraft.senderName!==selected.senderName||communicationDraft.senderEmail!==selected.senderEmail));
  const dirtyWizard=Boolean(wizard.name||wizard.slug||wizard.domain||wizard.adminName||wizard.adminEmail||wizard.senderEmail||wizard.senderName||step>0);
  const isDirty=view==='templates'?dirtyTemplate:view==='detail'?dirtyDetail:view==='onboarding'?dirtyWizard:false;
  const draftRef=useUnsavedDraft<HTMLDivElement>(isDirty);
  const dirtyRef=useRef(isDirty);useLayoutEffect(()=>{dirtyRef.current=isDirty},[isDirty]);
  const draftTenant=useRef(selected?.id);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    if (!selected) return;
    if(draftTenant.current===selected.id&&dirtyRef.current&&!forceTemplateReload.current)return;
    forceTemplateReload.current=false;
    draftTenant.current=selected.id;
    const timeout = window.setTimeout(() => {
      setBrandingDraft({ primary: selected.primaryColor, accent: selected.accentColor });
      setModuleDraft(selected.enabledServices);
      setCommunicationDraft({ senderName: selected.senderName, senderEmail: selected.senderEmail });
      const template = selected.templates.find((item) => item.key === templateKey);
      if (template) setDraft({ subject: template.subject, body: template.body });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [selected, templateKey]);
  const filteredTenants = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("nl");
    return initialData.tenants.filter((tenant) => !needle || [tenant.name, tenant.slug, tenant.domain,tenant.ownerName,tenant.ownerEmail, statusLabel(tenant.status)].join(" ").toLocaleLowerCase("nl").includes(needle));
  }, [initialData.tenants, query]);

  const sortedTenants = [...filteredTenants].sort((a, b) => a[tenantSort].localeCompare(b[tenantSort], "nl") * (tenantDescending ? -1 : 1));
  const pagination = useListPagination(sortedTenants);
  const sortTenants = (key: typeof tenantSort) => { setTenantDescending(tenantSort === key ? !tenantDescending : false); setTenantSort(key); pagination.setPage(1); };

  function go(next: View, tenantId = selected?.id, tab?: DetailTab) {
    if(mutationLock.current)return false;
    if((next!==view||tenantId!==selected?.id)&&!confirmDiscard())return false;
    const nextParams = new URLSearchParams({ view: next });
    if ((next === "detail" || next === "templates") && tenantId) nextParams.set("tenant", tenantId);
    if (next === "detail" && tab && tab !== "overview") nextParams.set("tab", tab);
    router.push(next === "overview" ? "/platform" : `/platform?${nextParams}`);
    setError(""); window.scrollTo({ top: 0 });
    return true;
  }
  function setDetailTab(tab: DetailTab) { go("detail", selected?.id, tab); }
  function syncTenantDrafts(id: string) {
    const tenant = initialData.tenants.find((item) => item.id === id);
    if (!tenant) return;
    setBrandingDraft({ primary: tenant.primaryColor, accent: tenant.accentColor });
    setModuleDraft(tenant.enabledServices);
    setCommunicationDraft({ senderName: tenant.senderName, senderEmail: tenant.senderEmail });
    const template = tenant.templates.find((item) => item.key === templateKey);
    if (template) setDraft({ subject: template.subject, body: template.body });
  }
  function chooseTenant(id: string, tab: DetailTab = "overview") { if(!go("detail",id,tab))return;setSelectedId(id); syncTenantDrafts(id); }
  function startWizard() { if(!go("onboarding"))return;setWizard(blankWizard()); setStep(0); setError(""); }
  function run(action: () => Promise<{ ok: boolean; error?: string; warning?: string;tenantId?:string }>, success: string, after?: (result:{tenantId?:string}) => void) {
    if(mutationLock.current)return;
    mutationLock.current=true;
    setError("");
    startTransition(async () => {
      try{
        const result = await action();
        if (!result.ok) { setError(result.error ?? "De wijziging is niet opgeslagen."); return; }
        setNotice(result.warning || success);
        if(after&&view==='onboarding'&&draftRef.current)draftRef.current.dataset.unsaved='false';
        mutationLock.current=false;
        after?.(result);
        router.refresh();
      }catch{setError('Opslaan is niet bevestigd. Je invoer is bewaard; probeer hetzelfde verzoek opnieuw.')}finally{mutationLock.current=false}
    });
  }
  function openTemplates(id: string) {
    if(!go("templates",id))return;
    setSelectedId(id);
    syncTenantDrafts(id);
  }
  function chooseTemplate(next: TemplateKey) {
    if (dirtyTemplate && !window.confirm("Je hebt onbewaarde wijzigingen. Wil je die verwerpen?")) return;
    setTemplateKey(next);
    const template = selected?.templates.find((item) => item.key === next);
    if (template) setDraft({ subject: template.subject, body: template.body });
  }
  function saveTemplate(reset:boolean){
    if(!selected||!selectedTemplate)return;
    const input={tenantId:selected.id,key:templateKey,subject:reset?selectedTemplate.defaultSubject:draft.subject,body:reset?selectedTemplate.defaultBody:draft.body,reset,revision:selectedTemplate.revision},signature=JSON.stringify(input);
    if(templateRequest.current.signature!==signature)templateRequest.current={signature,id:crypto.randomUUID()};
    run(()=>savePlatformTemplate({...input,requestId:templateRequest.current.id}),reset?'Standaardtemplate hersteld.':'Nieuwe templaterevisie opgeslagen.',()=>{forceTemplateReload.current=true});
  }
  function reloadTemplate(){if(confirmDiscard()){forceTemplateReload.current=true;router.refresh()}}
  function toggleWizardModule(id: ModuleId) {
    setWizard((current) => ({ ...current, enabledServices: toggleModules(current.enabledServices,id) as ModuleId[] }));
  }
  function validateStep() {
    if (step === 0 && (wizard.name.trim().length<2 || wizard.slug==='www'||wizard.slug.length>63||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(wizard.slug))) return "Vul een organisatienaam en geldige, niet-gereserveerde slug in.";
    if (step === 1 && (wizard.adminName.trim().length<2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wizard.adminEmail))) return "Vul de naam en het e-mailadres van de beheerder in.";
    if (step === 3 && wizard.enabledServices.includes("finance") && (!wizard.enabledServices.includes("planning") || !wizard.enabledServices.includes("rapportage"))) return "Facturatie vereist Planning en Rapportage.";
    if (step === 3 && wizard.enabledServices.includes("rapportage") && !wizard.enabledServices.includes("planning")) return "Rapportage vereist Planning.";
    if (step === 4 && wizard.senderEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wizard.senderEmail)) return "Vul een geldig afzenderadres in of laat het leeg.";
    return "";
  }
  function nextStep() { const issue = validateStep(); if (issue) { setError(issue); return; } setError(""); setStep((current) => Math.min(5, current + 1)); }

  const summary = platformConfigurationSummary(initialData.tenants);

  return <><div ref={draftRef} hidden/>
    {(view === "detail" || view === "templates") && !selected && <section className="fg-panel"><EmptyState title="Tenant niet gevonden" description="Kies een organisatie uit het tenantoverzicht."/><Button variant="outline" onClick={() => go("tenants")}>Terug naar tenants</Button></section>}
        {view === "overview" && <><PageHeader eyebrow="FIELDGRID PLATFORM" title="Platformoverzicht" description="Beheer organisaties, klantrelaties, afspraken en communicatie." action={<ActionIcon label="Nieuwe tenant" className="primary-button" icon={<Plus size={18}/>} onClick={startWizard}/>}/><div className="fg-metrics"><article className="fg-metric"><span><Building2 /></span><div><small>Totaal tenants</small><strong>{initialData.tenants.length}</strong><em>in Fieldgrid</em></div></article><article className="fg-metric"><span><Activity /></span><div><small>Actief</small><strong>{summary.activeTenants}</strong><em>beschikbaar</em></div></article><article className="fg-metric"><span><Layers3 /></span><div><small>Actieve medewerkers</small><strong>{summary.activePersonnel}</strong><em>in de organisaties</em></div></article><article className="fg-metric"><span><MessageSquareText /></span><div><small>Aangepast</small><strong>{summary.customizedTemplates}</strong><em>templates</em></div></article></div><CRMOverview navigate={path => router.push(path)}/><div className="fg-cockpit-grid"><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">INRICHTING & TOEGANG</span><h2>Aandacht nodig</h2></div><ShieldCheck/></div><dl className="fg-cockpit-facts"><div><dt>Mislukte uitnodigingen</dt><dd>{summary.failedInvitations}</dd></div><div><dt>Uitnodigingen in wachtrij</dt><dd>{summary.pendingInvitations}</dd></div><div><dt>Gepauzeerde organisaties</dt><dd>{summary.suspendedTenants}</dd></div><div><dt>Actieve klantportalen</dt><dd>{summary.customerPortals}</dd></div></dl><button type="button" className="secondary-button" onClick={() => go("tenants")}>Organisaties controleren <ArrowRight size={15}/></button></section><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">EXPLICIET GEDEELDE VRAGEN</span><h2>Supportcockpit</h2></div><MessageSquareText/></div>{initialData.support ? <><dl className="fg-cockpit-facts"><div><dt>Open tickets</dt><dd>{initialData.support.open}</dd></div><div><dt>Reactie nodig</dt><dd><Link href="/platform/support?view=needs_reply" aria-label="Reactie nodig in supportdesk">{initialData.support.needsReply}</Link></dd></div><div><dt>Niet toegewezen</dt><dd><Link href="/platform/support?view=unassigned" aria-label="Niet toegewezen in supportdesk">{initialData.support.unassigned}</Link></dd></div><div><dt>Termijn verstreken</dt><dd><Link href="/platform/support?view=overdue" aria-label="Termijn verstreken in supportdesk">{initialData.support.overdue}</Link></dd></div></dl><p className="fg-panel-description">Deze aantallen gelden uitsluitend voor jouw toegestane supportscope.</p></> : <p className="fg-panel-description">Je hebt toegang tot supportinrichting. Gespreksinformatie verschijnt pas nadat expliciet leesrecht is toegekend.</p>}<Link className="secondary-button" href="/platform/support">Supportdesk openen <ArrowRight size={15}/></Link></section></div><div className="fg-overview-grid co-platform-bottom"><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">RECENT</span><h2>Tenantoverzicht</h2></div><button type="button" onClick={() => go("tenants")}>Alle tenants <ArrowRight size={15} /></button></div>{initialData.tenants.length ? <div className="fg-tenant-list">{initialData.tenants.slice(0, 5).map((tenant) => <button type="button" key={tenant.id} onClick={() => chooseTenant(tenant.id)}><TenantBadge tenant={tenant} small /><span><strong>{tenant.name}</strong><small>{tenant.domain}</small></span><em className={`fg-status ${tenant.status}`}>{statusLabel(tenant.status)}</em><ChevronRight /></button>)}</div> : <EmptyState title="Nog geen tenants" description="Gebruik de knop bovenaan om de eerste organisatie toe te voegen."/>}</section><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">SNEL STARTEN</span><h2>Platformacties</h2></div><Settings2 /></div><div className="fg-quick-actions"><button type="button" onClick={() => router.push("/platform/crm?action=new-lead")}><UsersRound/><span><strong>Nieuwe lead</strong><small>Een nieuwe relatie vastleggen</small></span><ChevronRight/></button><button type="button" onClick={() => router.push("/platform/crm?tab=agenda&action=new-appointment")}><CalendarDays/><span><strong>Afspraak plannen</strong><small>Een vrij moment reserveren</small></span><ChevronRight/></button><button type="button" onClick={() => router.push("/platform/crm?tab=requests")}><FileText/><span><strong>Aanvragen bekijken</strong><small>Alle interesse via je website</small></span><ChevronRight/></button><button type="button" onClick={() => router.push("/platform/crm?tab=tasks")}><ClipboardCheck/><span><strong>Opvolging</strong><small>Taken en volgende stappen</small></span><ChevronRight/></button><button type="button" onClick={() => router.push("/platform/crm?tab=settings")}><Settings2/><span><strong>Beschikbaarheid</strong><small>Je agenda openzetten</small></span><ChevronRight/></button><button onClick={startWizard}><Plus /><span><strong>Tenant onboarden</strong><small>Zes gecontroleerde stappen</small></span><ChevronRight /></button><button disabled={!selected} onClick={() => selected && chooseTenant(selected.id, "branding")}><Palette /><span><strong>Huisstijl beheren</strong><small>Kleuren en logo per tenant</small></span><ChevronRight /></button><button disabled={!selected} onClick={() => selected && openTemplates(selected.id)}><Mail /><span><strong>Templates beheren</strong><small>E-mail en push per tenant</small></span><ChevronRight /></button></div></section></div></>}

        {view === "tenants" && <><PageHeader eyebrow="PLATFORM / ORGANISATIES" title="Tenants" description="Organisaties, modules en beheerders." action={<><label className="fg-search"><Search size={17}/><input aria-label="Tenants zoeken" value={query} onChange={event => { setQuery(event.target.value); pagination.setPage(1); }} placeholder="Zoek organisatie…"/></label><ActionIcon label="Nieuwe tenant" className="primary-button" icon={<Plus size={18}/>} onClick={startWizard}/></>}/>
          <section className="fg-panel fg-list-panel"><div className="fg-table-scroll"><table className="fg-table"><thead><tr>{[["name", "Organisatie"], ["", "Beheerder"], ["status", "Status"], ["", "Modules"], ["", "Medewerkers"], ["createdAt", "Aangemaakt"], ["", "Acties"]].map(([key, label]) => <th key={label} scope="col" aria-sort={key ? tenantSort === key ? tenantDescending ? "descending" : "ascending" : "none" : undefined}>{key ? <button onClick={() => sortTenants(key as typeof tenantSort)}>{label}<ArrowDownAZ size={13}/></button> : label}</th>)}</tr></thead><tbody>{pagination.items.map(tenant => <tr key={tenant.id}><td><button type="button" className="fg-tenant-record" onClick={() => chooseTenant(tenant.id)}><TenantBadge tenant={tenant} small/><span><strong>{tenant.name}</strong><small>{tenant.domain}</small></span></button></td><td>{tenant.ownerName}<small>{tenant.ownerEmail}</small></td><td><span className={`fg-status ${tenant.status}`}>{statusLabel(tenant.status)}</span></td><td>{tenant.enabledServices.length} van {availableModuleCount}</td><td>{tenant.staffCount}</td><td>{nlDate(tenant.createdAt)}</td><td><ActionIcon label={`Open ${tenant.name}`} icon={<ChevronRight size={16}/>} onClick={() => chooseTenant(tenant.id)}/></td></tr>)}</tbody></table></div>{!filteredTenants.length && <EmptyState title={initialData.tenants.length ? "Geen tenants gevonden" : "Nog geen tenants"} description={initialData.tenants.length ? "Probeer een andere zoekterm." : "Gebruik de knop bovenaan om de eerste organisatie toe te voegen."}/>}</section>
          <ListPagination total={pagination.total} page={pagination.page} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} noun="resultaten" preferenceKey="platform:tenants"/>
        </>}

        {view === "detail" && selected && <><button className="fg-back-link" type="button" onClick={() => go("tenants")}><ArrowLeft size={16}/> Terug naar tenants</button><section className="fg-detail-hero"><TenantBadge tenant={selected} /><div><span className="fg-eyebrow">TENANT / {selected.slug.toUpperCase()}</span><h1>{selected.name}</h1><p>{selected.domain} <span>·</span> Beheerder: {selected.ownerName}</p></div><span className={`fg-status ${selected.status}`}>{statusLabel(selected.status)}</span></section>
          <ContentTabs label="Tenantinstellingen" value={detailTab} onValueChange={value => setDetailTab(value as DetailTab)} tabs={[{ id: "overview", title: "Overzicht", content: <div className="fg-tab-panel-surface"><div className="fg-settings-grid"><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">BASISGEGEVENS</span><h2>Organisatie</h2></div><Building2 /></div><dl className="fg-facts"><div><dt>Tenant-ID</dt><dd>{selected.id}</dd></div><div><dt>Domein</dt><dd>{selected.domain}<small>{selected.domainVerified ? "Geverifieerd" : "Nog niet geverifieerd"}</small></dd></div><div><dt>Beheerder</dt><dd>{selected.ownerName}<small>{selected.ownerEmail}</small></dd></div><div><dt>Uitnodiging</dt><dd>{invitationLabel(selected.invitationStatus,Boolean(selected.ownerEmail))}</dd></div></dl>{selected.status !== "archived" && <Button variant="outline" disabled={pending} onClick={() => setLifecycleTarget(selected.status === "active" ? "suspended" : "active")}>{selected.status === "active" ? "Tenant pauzeren" : "Tenant activeren"}</Button>}{selected.invitationStatus === "failed" && <Button disabled={pending} onClick={() => run(() => retryTenantAdminInvitation(selected.id), "Uitnodiging opnieuw verstuurd.")}>Uitnodiging opnieuw versturen</Button>}</section><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">INRICHTING</span><h2>Instellingen</h2></div><Settings2 /></div><div className="fg-quick-actions"><button onClick={() => setDetailTab("branding")}><Palette /><span><strong>Huisstijl</strong><small>Logo en kleuren aanpassen</small></span><ChevronRight /></button><button onClick={() => setDetailTab("modules")}><Layers3 /><span><strong>Modules</strong><small>{selected.enabledServices.length} V1-modules actief</small></span><ChevronRight /></button><button onClick={() => openTemplates(selected.id)}><Mail /><span><strong>Berichttemplates</strong><small>{selected.templates.filter((item) => item.customized).length} aangepast</small></span><ChevronRight /></button></div></section></div></div> },{ id: "branding", title: "Huisstijl", content: <div className="fg-tab-panel-surface"><div className="fg-brand-layout"><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">WHITELABEL</span><h2>Huisstijl</h2></div><Palette/></div><p className="fg-panel-description">Je twee merkkleuren vormen de basis. We leiden rustige, leesbare varianten af voor de schermen.</p><label className="mc-field"><span>Primaire kleur</span><div className="ed-color"><input aria-label="Primaire kleur kiezen" type="color" value={brandingDraft.primary} onChange={event=>setBrandingDraft(current=>({...current,primary:event.target.value}))}/><input aria-label="Primaire kleurcode" className="sites-color-code" value={brandingDraft.primary} maxLength={7} onChange={event=>setBrandingDraft(current=>({...current,primary:event.target.value}))}/></div></label><label className="mc-field"><span>Secundaire kleur</span><div className="ed-color"><input aria-label="Secundaire kleur kiezen" type="color" value={brandingDraft.accent} onChange={event=>setBrandingDraft(current=>({...current,accent:event.target.value}))}/><input aria-label="Secundaire kleurcode" className="sites-color-code" value={brandingDraft.accent} maxLength={7} onChange={event=>setBrandingDraft(current=>({...current,accent:event.target.value}))}/></div></label><div className="fg-entitlement"><div><strong>Volledig whitelabel</strong><small>Verbergt de Fieldgrid-vermelding.</small></div><button type="button" className={`fg-switch${selected.whiteLabelEnabled?" on":""}`} aria-label="Volledig whitelabel" aria-pressed={selected.whiteLabelEnabled} disabled={pending} onClick={()=>run(()=>updatePlatformTenantWhiteLabel({tenantId:selected.id,enabled:!selected.whiteLabelEnabled}),selected.whiteLabelEnabled?"Whitelabel uitgeschakeld.":"Whitelabel ingeschakeld.")}><span/></button></div><Button variant="outline" disabled={pending} onClick={()=>run(()=>updatePlatformTenantBranding({tenantId:selected.id,primaryColor:brandingDraft.primary,accentColor:brandingDraft.accent}),"Huisstijl opgeslagen.")}>Kleuren bewaren</Button><details className="sites-platform-extra"><summary>Logo en afgeleide kleuren</summary><BrandPalettePreview primary={brandingDraft.primary} accent={brandingDraft.accent}/><form className="fg-upload" action={formData=>run(()=>uploadPlatformTenantLogo(formData),"Logo opgeslagen.")}><input type="hidden" name="tenantId" value={selected.id}/><Upload/><label><strong>Tenantlogo uploaden</strong><small>PNG, JPG of WebP · maximaal 2 MB</small><input name="logo" type="file" required accept="image/png,image/jpeg,image/webp"/></label><Button type="submit" variant="outline" disabled={pending}>Uploaden</Button></form></details></section><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">DIRECT ZICHTBAAR</span><h2>Voorbeeld huisstijl</h2></div></div><div className="ed-brand-preview" inert style={brandStyle(brandingDraft.primary,brandingDraft.accent)}><aside><strong>{selected.name}</strong><span>BACKOFFICE</span><div><LayoutDashboard size={16}/> Overzicht</div><div><CalendarDays size={16}/> Planbord</div></aside><article><small>WERKRUIMTE</small><h3>Goedendag</h3><section>Actieve werkbonnen<strong>12</strong></section><button type="button">Nieuwe werkbon</button></article></div><details className="sites-platform-extra"><summary>Backoffice, personeelsapp en factuur bekijken</summary><div className="fg-preview-tabs">{([["desktop","Backoffice"],["mobile","Personeelsapp"],["invoice","Factuur"]] as const).map(([id,label])=><button type="button" className={previewMode===id?"active":""} key={id} onClick={()=>setPreviewMode(id)}>{label}</button>)}</div><BrandPreview tenant={{...selected,primaryColor:brandingDraft.primary,accentColor:brandingDraft.accent}} mode={previewMode}/></details></section></div></div> },{ id: "modules", title: "Modules", content: <div className="fg-tab-panel-surface"><><div className="fg-content-heading"><div><span className="fg-eyebrow">PER TENANT</span><h2>Modules</h2><p>Beschikbare onderdelen in deze organisatie.</p></div><span>{moduleDraft.length} / {availableModuleCount} actief</span></div><ModuleCards enabled={moduleDraft} disabled={pending} onToggle={(id) => setModuleDraft((current) => toggleModules(current,id))} /><div className="sites-module-save"><p className="ed-muted">Facturatie gebruikt Planning en Rapportage. Bij inschakelen worden deze afhankelijkheden meegenomen. Uitschakelen is beperkt wanneer er al registraties zijn.</p><Button disabled={pending} onClick={() => run(() => updatePlatformTenantModules({ tenantId: selected.id, enabledServices: moduleDraft }), "Modules opgeslagen.")}>Modules bewaren</Button></div></></div> },{ id: "communications", title: "Communicatie", content: <div className="fg-tab-panel-surface"><div className="fg-settings-grid"><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">AFZENDER</span><h2>Communicatie</h2></div><Mail /></div><label className="mc-field"><span>Afzendernaam</span><input value={communicationDraft.senderName} onChange={(event) => setCommunicationDraft((current) => ({ ...current, senderName: event.target.value }))} /></label><label className="mc-field"><span>Gewenst e-mailadres</span><input type="email" value={communicationDraft.senderEmail} onChange={(event) => setCommunicationDraft((current) => ({ ...current, senderEmail: event.target.value }))} placeholder="facturen@organisatie.nl" /></label><p className="ed-muted sites-sender-advice">Je eigen afzenderadres wordt gebruikt zodra het e-maildomein is geverifieerd. Tot die tijd verstuurt Fieldgrid de berichten.</p><Button disabled={pending} onClick={() => run(() => updatePlatformTenantCommunication({ tenantId: selected.id, ...communicationDraft }), "Communicatie-instellingen opgeslagen.")}>Instellingen bewaren</Button></section><section className="fg-panel"><h2>Berichttemplates</h2><p className="ed-muted">Beheer e-mail- en pushberichten per tenant.</p><Button onClick={() => openTemplates(selected.id)}>Templates beheren <ArrowRight size={16}/></Button></section></div></div> },{ id: "domains", title: "Domein", content: <div className="fg-tab-panel-surface"><TenantWorkspaceDomains key={selected.id} tenantId={selected.id} canonicalHost={selected.canonicalHost} domains={selected.workspaceDomains}/></div> }]}/>
        </>}

        {view === "onboarding" && <><PageHeader eyebrow="PLATFORM / ONBOARDING" title="Nieuwe tenant" description="Richt een organisatie gecontroleerd in. Alleen de gekozen beheerder ontvangt toegang."/><div className="fg-wizard-layout"><aside className="fg-panel fg-wizard-steps"><span className="fg-eyebrow">INRICHTING</span><h2>In zes stappen</h2><ol>{wizardLabels.map((label,index)=><li key={label}><button type="button" disabled={pending||index>step} className={step===index?"active":index<step?"completed":""} onClick={()=>{setError('');setStep(index)}}><span>{index<step?<Check/>:String(index+1).padStart(2,'0')}</span><strong>{label}</strong></button></li>)}</ol><p><ShieldCheck/> Alleen platformbeheerders kunnen tenants inrichten.</p></aside><section className="fg-panel fg-wizard-panel"><div className="fg-wizard-progress"><span>STAP {String(step+1).padStart(2,'0')} / 06</span><span>{Math.round((step+1)/6*100)}%</span></div><div className="fg-progress-track"><span style={{width:`${(step+1)/6*100}%`}}/></div><div className="fg-wizard-title"><h2>{['Je organisatie','Eerste tenantbeheerder','Huisstijl','Modules kiezen','Communicatie','Controleer de inrichting'][step]}</h2></div>
          {step===0&&<><div className="ed-form-grid"><Field label="Organisatienaam *"><input value={wizard.name} onChange={event=>{const name=event.target.value;setWizard(current=>({...current,name,slug:name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}))}}/></Field><Field label="Slug *"><input value={wizard.slug} onChange={event=>setWizard(current=>({...current,slug:event.target.value.toLowerCase()}))}/></Field></div><details className="sites-platform-extra"><summary>Eigen domein (optioneel)</summary><Field label="Domein (nog niet geverifieerd)"><input value={wizard.domain} onChange={event=>setWizard(current=>({...current,domain:event.target.value}))} placeholder="app.organisatie.nl"/></Field></details></>}
          {step===1&&<div className="ed-form-grid"><Field label="Volledige naam *"><input value={wizard.adminName} onChange={event=>setWizard(current=>({...current,adminName:event.target.value}))}/></Field><Field label="Zakelijk e-mailadres *"><input type="email" value={wizard.adminEmail} onChange={event=>setWizard(current=>({...current,adminEmail:event.target.value}))}/></Field></div>}
          {step===2&&<div className="ed-form-grid"><Field label="Primaire kleur"><input type="color" value={wizard.primaryColor} onChange={event=>setWizard(current=>({...current,primaryColor:event.target.value}))}/></Field><Field label="Secundaire kleur"><input type="color" value={wizard.accentColor} onChange={event=>setWizard(current=>({...current,accentColor:event.target.value}))}/></Field></div>}
          {step===3&&<ModuleCards wizard enabled={wizard.enabledServices} disabled={pending} onToggle={toggleWizardModule}/>}
          {step===4&&<><Field label="Afzendernaam"><input value={wizard.senderName} placeholder={wizard.name} onChange={event=>setWizard(current=>({...current,senderName:event.target.value}))}/></Field><p className="ed-muted">Controleer de afzendergegevens. De bestaande verzendregels bepalen het adres voor uitgaande berichten.</p><details className="sites-platform-extra"><summary>Afzenderadres (optioneel)</summary><Field label="Afzender e-mail"><input type="email" value={wizard.senderEmail} onChange={event=>setWizard(current=>({...current,senderEmail:event.target.value}))}/></Field></details></>}
          {step===5&&<div className="fg-review-grid">{[['Organisatie',wizard.name,wizard.domain||initialData.newTenantHostTemplate.replace(/^fieldgrid-tenant\./,wizard.slug+'.')],['Beheerder',wizard.adminName,wizard.adminEmail],['Huisstijl',wizard.primaryColor,wizard.accentColor],['Modules',`${wizard.enabledServices.length} V1-modules actief`,wizard.enabledServices.map(id=>moduleCatalog.find(module=>module.id===id)?.name||id).join(', ')]].map(([label,value,detail],index)=><div key={label}><span>{label.toUpperCase()}</span><strong>{value}</strong><small>{detail}</small><button type="button" disabled={pending} onClick={()=>setStep(index)}>Wijzigen</button></div>)}</div>}
          {error&&<p className="fg-error" role="alert">{error}</p>}<div className="fg-wizard-footer"><Button variant="outline" disabled={pending} onClick={()=>step===0?go('tenants'):setStep(current=>current-1)}>{step===0?'Annuleren':'Vorige'}</Button><Button variant="primary" disabled={pending||Boolean(validateStep())} onClick={()=>step===5?run(()=>createPlatformTenant(wizard),'Tenant aangemaakt.',result=>{if(result.tenantId){setSelectedId(result.tenantId);go('detail',result.tenantId)}else setError('De tenant-ID ontbreekt. Controleer het tenantoverzicht.')}):nextStep()}>{pending?'Bezig…':step===5?'Tenant aanmaken':'Volgende'}{step<5&&<ArrowRight size={16}/>}</Button></div></section></div></>}

        {view === "templates" && selected && selectedTemplate && <><PageHeader eyebrow="PLATFORM / COMMUNICATIE" title="Berichttemplates" description="Bewerk e-mail en pushberichten per tenant." action={<select disabled={pending} className="secondary-button" aria-label="Tenant" value={selected.id} onChange={event=>{const id=event.target.value;if(!go('templates',id))return;setSelectedId(id);syncTenantDrafts(id)}}>{initialData.tenants.map(tenant=><option value={tenant.id} key={tenant.id}>{tenant.name}</option>)}</select>}/><div className="ed-templates"><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">BERICHTEN</span><h2>Templates</h2></div></div><div className="fg-quick-actions">{sourceTemplateOrder.map(key=>{if(key==='invitation')return <button type="button" key={key} disabled={!initialData.canManageCentralTemplates||pending} title="Uitnodigingen volgen de bestaande centrale template- en verzendregels." onClick={()=>{if(confirmDiscard())router.push('/platform/notificaties?tab=templates')}}><Mail size={18}/><span><strong>Uitnodiging medewerker</strong><small>Centrale uitnodigingstemplates</small></span><ChevronRight size={15}/></button>;const row=selected.templates.find(item=>item.key===key),definition=templateDefinition(key);return <button type="button" key={key} className={templateKey===key?'ed-active':''} disabled={pending||!row} onClick={()=>chooseTemplate(key)}><Mail size={18}/><span><strong>{sourceTemplateLabels[key]}</strong><small>{definition.channel==='email'?'E-mail':'Push'} · revisie {row?.revision??'—'}</small></span><ChevronRight size={15}/></button>})}</div></section><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">{selectedTemplate.channel.toUpperCase()} / {selected.name.toUpperCase()}</span><h2>{sourceTemplateLabels[templateKey]}</h2></div></div><Field label={selectedTemplate.channel==='email'?'Onderwerp':'Titel'}><input disabled={pending} value={draft.subject} onChange={event=>setDraft(current=>({...current,subject:event.target.value}))}/></Field><Field label="Bericht"><textarea disabled={pending} rows={8} value={draft.body} onChange={event=>setDraft(current=>({...current,body:event.target.value}))}/></Field><div className="ed-token-row">{templateDefinition(templateKey).tokens.map(token=><button type="button" key={token} disabled={pending} onClick={()=>setDraft(current=>({...current,body:current.body+` {${token}}`}))}>{`{${token}}`}</button>)}</div>{error&&<p className="fg-error" role="alert">{error}</p>}<Button variant="primary" disabled={pending||!dirtyTemplate} onClick={()=>saveTemplate(false)}>Wijzigingen bewaren</Button><details className="sites-platform-extra"><summary>Versie en herstel</summary><p>{selectedTemplate.customized?'Aangepast':'Standaard'} · revisie {selectedTemplate.revision}</p><Button variant="outline" disabled={pending||!selectedTemplate.customized} onClick={()=>saveTemplate(true)}>Herstel standaard</Button><Button variant="outline" disabled={pending} onClick={reloadTemplate}>Actuele template laden</Button></details></section><section className="fg-panel ed-email-preview"><span className="fg-eyebrow">LIVE VOORBEELD</span><div style={{borderTopColor:selected.accentColor}}><TenantBadge tenant={selected}/><h3>{selected.senderName||selected.name}</h3><h4>{renderTemplateText(draft.subject,{...PREVIEW_VALUES,bedrijfsnaam:selected.name},false)}</h4><p>{renderTemplateText(draft.body,{...PREVIEW_VALUES,bedrijfsnaam:selected.name},false)}</p></div><p className="ed-muted">Fictieve preview; er wordt niets verzonden.</p>{selectedTemplate.channel==='email'&&<details className="sites-platform-extra"><summary>Volledige e-mail en HTML bekijken</summary><EmailCanvas tenant={selected} template={selectedTemplate} draft={draft} notify={setNotice}/></details>}</section></div></>}
    {lifecycleTarget&&selected&&<Modal title={lifecycleTarget==='suspended'?'Tenant pauzeren':'Tenant activeren'} subtitle={selected.name} closeDisabled={pending} onClose={()=>{if(!pending)setLifecycleTarget(null)}} footer={<><Button variant="outline" disabled={pending} onClick={()=>setLifecycleTarget(null)}>Annuleren</Button><Button variant="primary" disabled={pending} onClick={()=>{const input={tenantId:selected.id,status:lifecycleTarget,version:selected.version},signature=JSON.stringify(input);if(lifecycleRequest.current.signature!==signature)lifecycleRequest.current={signature,id:crypto.randomUUID()};run(()=>changePlatformTenantStatus({...input,requestId:lifecycleRequest.current.id}),lifecycleTarget==='suspended'?'Tenant gepauzeerd.':'Tenant geactiveerd.',()=>setLifecycleTarget(null))}}>{pending?'Bezig…':lifecycleTarget==='suspended'?'Pauzeren':'Activeren'}</Button></>}><p className="ed-muted">{lifecycleTarget==='suspended'?'De tenantwerkruimten zijn tijdens de pauze niet bereikbaar. Dossiers, gebruikers en bestaande registraties blijven bewaard.':'De bestaande tenantwerkruimten worden weer bereikbaar voor hun huidige bevoegde gebruikers.'}</p>{error&&<p role="alert">{error}</p>}</Modal>}
    {notice && <div className="fg-toast" role="status"><CheckCircle2 />{notice}<button type="button" onClick={() => setNotice("")} aria-label="Sluiten"><X /></button></div>}
    {view !== "onboarding" && error && <div className="fg-toast error" role="alert"><CircleHelp />{error}<button type="button" onClick={() => setError("")} aria-label="Sluiten"><X /></button></div>}
  </>;
}
