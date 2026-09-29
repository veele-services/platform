"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, ArrowLeft, ArrowRight, Bell, Building2, Check, CheckCircle2,
  ChevronRight, CircleHelp, ClipboardCheck, Code2, Copy, CreditCard, Download,
  FileText, Globe2, Layers3, LayoutDashboard, LogOut, Mail, Menu,
  MessageSquareText, Monitor, Palette, Plus, Search, Settings2, ShieldCheck,
  Smartphone, Upload, Users, X,
} from "lucide-react";
import {
  FIELDGRID_PRIMARY,
  FIELDGRID_SECONDARY,
  PREVIEW_VALUES,
  TEMPLATE_CATALOG,
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
type DetailTab = "overview" | "branding" | "modules" | "communications";
type ModuleId = "planning" | "personeel" | "rapportage" | "finance";

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
};

const moduleCatalog: Array<{ id: ModuleId | "klantportaal" | "website"; name: string; description: string; icon: typeof Layers3; available: boolean }> = [
  { id: "planning", name: "Planning & werkbonnen", description: "Afspraakblokken, planbord, dispatch en live werkbonnen.", icon: ClipboardCheck, available: true },
  { id: "personeel", name: "Personeel", description: "Personeelsapp, uren, certificaten en documenten.", icon: Users, available: true },
  { id: "rapportage", name: "Rapportage", description: "Tijdlijn, bewijs, handtekening en controle.", icon: FileText, available: true },
  { id: "finance", name: "Facturatie", description: "Facturen, e-mail en betalingen via Mollie.", icon: CreditCard, available: true },
  { id: "klantportaal", name: "Klantportaal", description: "Een eigen omgeving voor klantcontacten.", icon: Globe2, available: false },
  { id: "website", name: "Publieke website", description: "Aanvragen en publieke tenantpagina’s.", icon: Layers3, available: false },
];

const wizardLabels = ["Organisatie", "Beheerder", "Huisstijl", "Modules", "Communicatie", "Controle"];

const blankWizard = (): Wizard => ({
  requestKey: crypto.randomUUID(),
  name: "",
  slug: "",
  domain: "",
  adminName: "",
  adminEmail: "",
  primaryColor: FIELDGRID_PRIMARY,
  accentColor: FIELDGRID_SECONDARY,
  enabledServices: ["planning", "personeel", "rapportage", "finance"],
  senderEmail: "",
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

function TenantBadge({ tenant, small = false }: { tenant: PlatformTenant; small?: boolean }) {
  return <span className={`fg-tenant-logo${small ? " small" : ""}`} style={brandStyle(tenant.primaryColor, tenant.accentColor)}>
    {tenant.logoUrl ? <Image src={tenant.logoUrl} alt="" width={64} height={64} unoptimized /> : initials(tenant.name)}
  </span>;
}

function Button({ children, variant = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "quiet" }) {
  return <button {...props} className={`fg-button fg-button-${variant} ${props.className ?? ""}`.trim()}>{children}</button>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="fg-page-heading"><div><span className="fg-eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

function ModuleCards({ enabled, onToggle, disabled }: { enabled: string[]; onToggle: (id: ModuleId) => void; disabled?: boolean }) {
  return <div className="fg-module-grid">{moduleCatalog.map((module) => {
    const Icon = module.icon;
    const active = enabled.includes(module.id);
    return <article key={module.id} className={`fg-module-card${module.available ? "" : " locked"}`}>
      <div className="fg-module-top"><span className="fg-module-icon"><Icon size={19} /></span><button type="button" role="switch" aria-checked={active} aria-label={`${module.name} ${active ? "uitschakelen" : "inschakelen"}`} disabled={!module.available || disabled} onClick={() => module.available && onToggle(module.id as ModuleId)} className={`fg-switch${active ? " on" : ""}`}><span /></button></div>
      <strong>{module.name}</strong><p>{module.description}</p><span className={`fg-module-release${module.available ? "" : " later"}`}>{module.available ? "Fieldgrid V1" : "Latere release"}</span>
    </article>;
  })}</div>;
}

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
  const [view, setView] = useState<View>(initialData.tenants.length ? "overview" : "onboarding");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [selectedId, setSelectedId] = useState(initialData.tenants[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [wizard, setWizard] = useState<Wizard>(blankWizard);
  const [step, setStep] = useState(0);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile" | "invoice">("desktop");
  const [templateKey, setTemplateKey] = useState<TemplateKey>("invoice");
  const selected = initialData.tenants.find((tenant) => tenant.id === selectedId) ?? initialData.tenants[0] ?? null;
  const selectedTemplate = selected?.templates.find((template) => template.key === templateKey) ?? null;
  const [draft, setDraft] = useState({ subject: selectedTemplate?.subject ?? "", body: selectedTemplate?.body ?? "" });
  const [brandingDraft, setBrandingDraft] = useState({ primary: selected?.primaryColor ?? FIELDGRID_PRIMARY, accent: selected?.accentColor ?? FIELDGRID_SECONDARY });
  const [moduleDraft, setModuleDraft] = useState<string[]>(selected?.enabledServices ?? []);
  const [communicationDraft, setCommunicationDraft] = useState({ senderName: selected?.senderName ?? "", senderEmail: selected?.senderEmail ?? "" });
  const dirtyTemplate = Boolean(selectedTemplate && (draft.subject !== selectedTemplate.subject || draft.body !== selectedTemplate.body));

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyTemplate) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirtyTemplate]);
  useEffect(() => {
    if (!selected) return;
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
    return initialData.tenants.filter((tenant) => !needle || [tenant.name, tenant.slug, tenant.domain, statusLabel(tenant.status)].join(" ").toLocaleLowerCase("nl").includes(needle));
  }, [initialData.tenants, query]);

  function go(next: View) { setView(next); setSidebarOpen(false); setError(""); window.scrollTo({ top: 0 }); }
  function syncTenantDrafts(id: string) {
    const tenant = initialData.tenants.find((item) => item.id === id);
    if (!tenant) return;
    setBrandingDraft({ primary: tenant.primaryColor, accent: tenant.accentColor });
    setModuleDraft(tenant.enabledServices);
    setCommunicationDraft({ senderName: tenant.senderName, senderEmail: tenant.senderEmail });
    const template = tenant.templates.find((item) => item.key === templateKey);
    if (template) setDraft({ subject: template.subject, body: template.body });
  }
  function chooseTenant(id: string, tab: DetailTab = "overview") { setSelectedId(id); syncTenantDrafts(id); setDetailTab(tab); go("detail"); }
  function startWizard() { setWizard(blankWizard()); setStep(0); setError(""); go("onboarding"); }
  function run(action: () => Promise<{ ok: boolean; error?: string; warning?: string }>, success: string, after?: () => void) {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) { setError(result.error ?? "De wijziging is niet opgeslagen."); return; }
      setNotice(result.warning || success);
      after?.();
      router.refresh();
    });
  }
  function openTemplates(id: string) {
    setSelectedId(id);
    syncTenantDrafts(id);
    go("templates");
  }
  function chooseTemplate(next: TemplateKey) {
    if (dirtyTemplate && !window.confirm("Je hebt onbewaarde wijzigingen. Wil je die verwerpen?")) return;
    setTemplateKey(next);
    const template = selected?.templates.find((item) => item.key === next);
    if (template) setDraft({ subject: template.subject, body: template.body });
  }
  function toggleWizardModule(id: ModuleId) {
    setWizard((current) => ({ ...current, enabledServices: current.enabledServices.includes(id) ? current.enabledServices.filter((item) => item !== id) : [...current.enabledServices, id] }));
  }
  function validateStep() {
    if (step === 0 && (!wizard.name.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(wizard.slug))) return "Vul een organisatienaam en geldige slug in.";
    if (step === 1 && (!wizard.adminName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wizard.adminEmail))) return "Vul de naam en het e-mailadres van de beheerder in.";
    if (step === 3 && wizard.enabledServices.includes("finance") && (!wizard.enabledServices.includes("planning") || !wizard.enabledServices.includes("rapportage"))) return "Facturatie vereist Planning en Rapportage.";
    if (step === 3 && wizard.enabledServices.includes("rapportage") && !wizard.enabledServices.includes("planning")) return "Rapportage vereist Planning.";
    if (step === 4 && wizard.senderEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wizard.senderEmail)) return "Vul een geldig afzenderadres in of laat het leeg.";
    return "";
  }
  function nextStep() { const issue = validateStep(); if (issue) { setError(issue); return; } setError(""); setStep((current) => Math.min(5, current + 1)); }

  const activeCount = initialData.tenants.filter((tenant) => tenant.status === "active").length;
  const configuredTemplates = initialData.tenants.reduce((sum, tenant) => sum + tenant.templates.filter((template) => template.customized).length, 0);

  return <div className="fg-console" style={brandThemeStyle()}>
    <aside className={`fg-sidebar${sidebarOpen ? " open" : ""}`}><div className="fg-sidebar-brand"><span>Fieldgrid</span><small>Platformbeheer</small><button type="button" onClick={() => setSidebarOpen(false)} aria-label="Sluit menu"><X /></button></div><nav><span>PLATFORM</span><button type="button" className={view === "overview" ? "active" : ""} onClick={() => go("overview")}><LayoutDashboard /> Overzicht</button><button type="button" className={view === "tenants" || view === "detail" ? "active" : ""} onClick={() => go("tenants")}><Building2 /> Tenants <em>{initialData.tenants.length}</em></button><button type="button" className={view === "onboarding" ? "active" : ""} onClick={startWizard}><Plus /> Nieuwe tenant</button><span>COMMUNICATIE</span><button type="button" className={view === "templates" ? "active" : ""} disabled={!initialData.tenants.length} onClick={() => selected && openTemplates(selected.id)}><MessageSquareText /> Berichttemplates</button></nav><footer><span><i /> Platform operationeel</span><small>Tenant-neutraal · Fieldgrid V1</small></footer></aside>
    {sidebarOpen && <button className="fg-sidebar-shade" aria-label="Sluit navigatie" onClick={() => setSidebarOpen(false)} />}
    <div className="fg-workspace"><header className="fg-topbar"><div><button className="fg-menu-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu /></button><span className="fg-workspace-tag">Fieldgrid</span><ChevronRight size={15} /><strong>{view === "detail" ? selected?.name : view === "templates" ? "Berichttemplates" : view === "onboarding" ? "Nieuwe tenant" : view === "tenants" ? "Tenants" : "Platformoverzicht"}</strong></div><div className="fg-top-right"><Bell size={19} /><span className="fg-avatar">{initials(initialData.currentUserEmail ?? "FG")}</span><form action="/auth/signout" method="post"><button type="submit" aria-label="Uitloggen"><LogOut size={18} /></button></form></div></header>
      <main className="fg-main">
        {view === "overview" && <><section className="fg-hero"><div><span className="fg-eyebrow light">FIELDGRID PLATFORM</span><h1>Grip op iedere tenant.</h1><p>Beheer onboarding, huisstijl, modules en communicatie vanuit één professionele werkplek.</p><Button onClick={startWizard}><Plus size={17} /> Nieuwe tenant onboarden</Button></div><div className="fg-hero-mark"><ShieldCheck /><span>Platform<br />control</span></div></section><div className="fg-metrics"><article className="fg-metric"><span><Building2 /></span><div><small>Totaal tenants</small><strong>{initialData.tenants.length}</strong><em>in Fieldgrid</em></div></article><article className="fg-metric"><span><Activity /></span><div><small>Actief</small><strong>{activeCount}</strong><em>beschikbaar</em></div></article><article className="fg-metric"><span><Layers3 /></span><div><small>V1-modules</small><strong>4</strong><em>beschikbaar</em></div></article><article className="fg-metric"><span><MessageSquareText /></span><div><small>Aangepast</small><strong>{configuredTemplates}</strong><em>templates</em></div></article></div><div className="fg-overview-grid"><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">RECENT</span><h2>Tenantoverzicht</h2></div><button type="button" onClick={() => go("tenants")}>Alle tenants <ArrowRight size={15} /></button></div>{initialData.tenants.length ? <div className="fg-tenant-list">{initialData.tenants.slice(0, 5).map((tenant) => <button type="button" key={tenant.id} onClick={() => chooseTenant(tenant.id)}><TenantBadge tenant={tenant} small /><span><strong>{tenant.name}</strong><small>{tenant.domain}</small></span><em className={`fg-status ${tenant.status}`}>{statusLabel(tenant.status)}</em><ChevronRight /></button>)}</div> : <div className="fg-empty"><Building2 /><strong>Nog geen tenants</strong><p>Start met de eerste tenant via de gecontroleerde onboarding.</p><Button onClick={startWizard}>Tenant onboarden</Button></div>}</section><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">SNEL STARTEN</span><h2>Platformacties</h2></div><Settings2 /></div><div className="fg-quick-actions"><button onClick={startWizard}><Plus /><span><strong>Tenant onboarden</strong><small>Zes gecontroleerde stappen</small></span><ChevronRight /></button><button disabled={!selected} onClick={() => selected && chooseTenant(selected.id, "branding")}><Palette /><span><strong>Huisstijl beheren</strong><small>Kleuren en logo per tenant</small></span><ChevronRight /></button><button disabled={!selected} onClick={() => selected && openTemplates(selected.id)}><Mail /><span><strong>Templates beheren</strong><small>E-mail en push per tenant</small></span><ChevronRight /></button></div></section></div><section className="fg-platform-rule"><span><ShieldCheck /></span><div><strong>Platform en tenants blijven strikt gescheiden</strong><p>Fieldgrid-chrome gebruikt de platformkleuren; tenantbranding is uitsluitend tenantgebonden.</p></div><em>tenant_id bewaakt</em></section></>}

        {view === "tenants" && <><PageHeader eyebrow="PLATFORM / TENANTS" title="Tenants" description="Zoek organisaties en open hun inrichting." action={<Button onClick={startWizard}><Plus size={17} /> Nieuwe tenant</Button>} /><section className="fg-panel fg-list-panel"><div className="fg-list-toolbar"><div><strong>{filteredTenants.length}</strong><span> organisaties</span></div><label className="fg-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek naam, slug, domein of status" /></label></div><div className="fg-table-scroll"><table className="fg-table"><thead><tr><th>Organisatie</th><th>Status</th><th>Modules</th><th>Medewerkers</th><th>Aangemaakt</th><th aria-label="Openen" /></tr></thead><tbody>{filteredTenants.map((tenant) => <tr key={tenant.id} onClick={() => chooseTenant(tenant.id)}><td><button type="button" onClick={(event) => { event.stopPropagation(); chooseTenant(tenant.id); }}><TenantBadge tenant={tenant} small /><span><strong>{tenant.name}</strong><small>{tenant.domain}</small></span></button></td><td><span className={`fg-status ${tenant.status}`}>{statusLabel(tenant.status)}</span></td><td>{tenant.enabledServices.length} van 4</td><td>{tenant.staffCount || "—"}</td><td>{nlDate(tenant.createdAt)}</td><td><ChevronRight /></td></tr>)}</tbody></table></div>{!filteredTenants.length && <div className="fg-empty"><Search /><strong>Geen tenants gevonden</strong><p>Probeer een andere zoekterm.</p></div>}</section></>}

        {view === "detail" && selected && <><button className="fg-back-link" type="button" onClick={() => go("tenants")}><ArrowLeft /> Terug naar tenants</button><section className="fg-detail-hero"><TenantBadge tenant={selected} /><div><span className="fg-eyebrow">TENANT / {selected.slug.toUpperCase()}</span><h1>{selected.name}</h1><p>{selected.domain} <span>·</span> Beheerder: {selected.ownerName}</p></div><span className={`fg-status ${selected.status}`}>{statusLabel(selected.status)}</span></section><nav className="fg-detail-tabs">{([ ["overview", "Overzicht"], ["branding", "Huisstijl"], ["modules", "Modules"], ["communications", "Communicatie"] ] as const).map(([id, label]) => <button key={id} type="button" className={detailTab === id ? "active" : ""} onClick={() => setDetailTab(id)}>{label}</button>)}</nav>
          {detailTab === "overview" && <div className="fg-settings-grid"><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">BASISGEGEVENS</span><h2>Organisatie</h2></div><Building2 /></div><dl className="fg-facts"><div><dt>Tenant-ID</dt><dd>{selected.id}</dd></div><div><dt>Domein</dt><dd>{selected.domain}<small>{selected.domainVerified ? "Geverifieerd" : "Nog niet geverifieerd"}</small></dd></div><div><dt>Beheerder</dt><dd>{selected.ownerName}<small>{selected.ownerEmail}</small></dd></div><div><dt>Uitnodiging</dt><dd>{selected.invitationStatus ?? "Platformeigenaar actief"}</dd></div></dl>{selected.invitationStatus === "failed" && <Button disabled={pending} onClick={() => run(() => retryTenantAdminInvitation(selected.id), "Uitnodiging opnieuw verstuurd.")}>Uitnodiging opnieuw versturen</Button>}</section><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">INRICHTING</span><h2>Instellingen</h2></div><Settings2 /></div><div className="fg-quick-actions"><button onClick={() => setDetailTab("branding")}><Palette /><span><strong>Huisstijl</strong><small>Logo en kleuren aanpassen</small></span><ChevronRight /></button><button onClick={() => setDetailTab("modules")}><Layers3 /><span><strong>Modules</strong><small>{selected.enabledServices.length} V1-modules actief</small></span><ChevronRight /></button><button onClick={() => openTemplates(selected.id)}><Mail /><span><strong>Berichttemplates</strong><small>{selected.templates.filter((item) => item.customized).length} aangepast</small></span><ChevronRight /></button></div></section></div>}
          {detailTab === "branding" && <div className="fg-brand-layout"><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">WHITELABEL</span><h2>Huisstijl</h2></div><Palette /></div><p className="fg-panel-description">Je twee merkkleuren vormen de basis. Voor de schermen leiden we rustige, leesbare varianten af; PDF’s en berichten houden de ingestelde merkkleuren.</p><label className="fg-field"><span>Primaire kleur</span><div className="fg-color-field"><input type="color" value={brandingDraft.primary} onChange={(event) => setBrandingDraft((current) => ({ ...current, primary: event.target.value }))} /><input value={brandingDraft.primary} maxLength={7} onChange={(event) => setBrandingDraft((current) => ({ ...current, primary: event.target.value }))} /></div></label><label className="fg-field"><span>Secundaire kleur</span><div className="fg-color-field"><input type="color" value={brandingDraft.accent} onChange={(event) => setBrandingDraft((current) => ({ ...current, accent: event.target.value }))} /><input value={brandingDraft.accent} maxLength={7} onChange={(event) => setBrandingDraft((current) => ({ ...current, accent: event.target.value }))} /></div></label><BrandPalettePreview primary={brandingDraft.primary} accent={brandingDraft.accent}/><Button disabled={pending} onClick={() => run(() => updatePlatformTenantBranding({ tenantId: selected.id, primaryColor: brandingDraft.primary, accentColor: brandingDraft.accent }), "Huisstijl opgeslagen.")}>Kleuren bewaren</Button><form className="fg-upload" action={(formData) => run(() => uploadPlatformTenantLogo(formData), "Logo opgeslagen.")}><input type="hidden" name="tenantId" value={selected.id} /><Upload /><label><strong>Tenantlogo uploaden</strong><small>PNG, JPG of WebP · maximaal 2 MB</small><input name="logo" type="file" required accept="image/png,image/jpeg,image/webp" /></label><Button type="submit" variant="outline" disabled={pending}>Uploaden</Button></form><div className="fg-entitlement"><div><strong>Volledig whitelabel</strong><small>Verbergt de Fieldgrid-vermelding in de tenantwerkruimte.</small></div><button type="button" className={`fg-switch${selected.whiteLabelEnabled ? " on" : ""}`} aria-label="Volledig whitelabel" aria-pressed={selected.whiteLabelEnabled} disabled={pending} onClick={() => run(() => updatePlatformTenantWhiteLabel({ tenantId: selected.id, enabled: !selected.whiteLabelEnabled }), selected.whiteLabelEnabled ? "Whitelabel uitgeschakeld." : "Whitelabel ingeschakeld.")}><span /></button></div></section><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">DIRECT ZICHTBAAR</span><h2>Voorbeeld huisstijl</h2></div></div><div className="fg-preview-tabs">{([ ["desktop", "Backoffice"], ["mobile", "Personeelsapp"], ["invoice", "Factuur"] ] as const).map(([id, label]) => <button type="button" className={previewMode === id ? "active" : ""} key={id} onClick={() => setPreviewMode(id)}>{label}</button>)}</div><BrandPreview tenant={{ ...selected, primaryColor: brandingDraft.primary, accentColor: brandingDraft.accent }} mode={previewMode} /></section></div>}
          {detailTab === "modules" && <><div className="fg-content-heading"><div><span className="fg-eyebrow">PER TENANT</span><h2>Modules</h2><p>Afhankelijkheden en operationele data worden ook server-side gecontroleerd.</p></div><span>{moduleDraft.length} / 4 actief</span></div><ModuleCards enabled={moduleDraft} disabled={pending} onToggle={(id) => setModuleDraft((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} /><div className="fg-save-row"><p><CircleHelp /> Facturatie vereist Planning en Rapportage; uitschakelen met actieve data wordt geblokkeerd.</p><Button disabled={pending} onClick={() => run(() => updatePlatformTenantModules({ tenantId: selected.id, enabledServices: moduleDraft }), "Modules opgeslagen.")}>Modules bewaren</Button></div></>}
          {detailTab === "communications" && <div className="fg-settings-grid"><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">AFZENDER</span><h2>Communicatie</h2></div><Mail /></div><label className="fg-field"><span>Afzendernaam</span><input value={communicationDraft.senderName} onChange={(event) => setCommunicationDraft((current) => ({ ...current, senderName: event.target.value }))} /></label><label className="fg-field"><span>Gewenst e-mailadres</span><input type="email" value={communicationDraft.senderEmail} onChange={(event) => setCommunicationDraft((current) => ({ ...current, senderEmail: event.target.value }))} placeholder="facturen@organisatie.nl" /></label><div className="fg-connection-note"><ShieldCheck /> Het tenantadres wordt pas als echte SendGrid-afzender gebruikt als het domein is geverifieerd; anders blijft de veilige Fieldgrid-fallback actief.</div><Button disabled={pending} onClick={() => run(() => updatePlatformTenantCommunication({ tenantId: selected.id, ...communicationDraft }), "Communicatie-instellingen opgeslagen.")}>Instellingen bewaren</Button></section><section className="fg-panel"><div className="fg-panel-heading"><div><span className="fg-eyebrow">E-MAIL & PUSH</span><h2>Berichttemplates</h2></div><MessageSquareText /></div><p className="fg-panel-description">Beheer vier tenantgebonden templates met versiehistorie, veilige tokens en dezelfde live preview als de verzendroute.</p><Button onClick={() => openTemplates(selected.id)}>Templates beheren <ArrowRight /></Button></section></div>}
        </>}

        {view === "onboarding" && <><PageHeader eyebrow="PLATFORM / ONBOARDING" title="Nieuwe tenant" description="Richt een organisatie gecontroleerd in. De tenant blijft leeg; alleen de gekozen beheerder ontvangt toegang." /><div className="fg-wizard-layout"><aside className="fg-panel fg-wizard-steps"><span className="fg-eyebrow">INRICHTING</span><h2>In zes stappen</h2><ol>{wizardLabels.map((label, index) => <li key={label}><button type="button" className={step === index ? "active" : index < step ? "completed" : ""} disabled={index > step} onClick={() => index < step && setStep(index)}><span>{index < step ? <Check /> : String(index + 1).padStart(2, "0")}</span><strong>{label}</strong></button></li>)}</ol><p><ShieldCheck /> Alleen platformbeheerders kunnen tenants provisionen.</p></aside><section className="fg-panel fg-wizard-panel"><div className="fg-wizard-progress"><span>STAP {String(step + 1).padStart(2, "0")} / 06</span><span>{Math.round((step + 1) / 6 * 100)}%</span></div><div className="fg-progress-track"><span style={{ width: `${(step + 1) / 6 * 100}%` }} /></div>
          {step === 0 && <><div className="fg-wizard-title"><Building2 /><h2>Organisatie</h2><p>Naam, unieke slug en optioneel eigen domein.</p></div><div className="fg-form-grid"><label className="fg-field"><span>Naam organisatie *</span><input autoFocus value={wizard.name} onChange={(event) => { const name = event.target.value; setWizard((current) => ({ ...current, name, slug: current.slug ? current.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })); }} /></label><label className="fg-field"><span>Unieke slug *</span><input value={wizard.slug} onChange={(event) => setWizard((current) => ({ ...current, slug: event.target.value.toLowerCase() }))} placeholder="organisatie-naam" /></label><label className="fg-field fg-span-2"><span>Domein (optioneel, nog niet geverifieerd)</span><input value={wizard.domain} onChange={(event) => setWizard((current) => ({ ...current, domain: event.target.value }))} placeholder="app.organisatie.nl" /></label></div></>}
          {step === 1 && <><div className="fg-wizard-title"><Users /><h2>Eerste tenantbeheerder</h2><p>Deze persoon ontvangt een herstelbare uitnodiging. Platformbeheer krijgt niet automatisch toegang tot de tenantwerkruimte.</p></div><div className="fg-form-grid"><label className="fg-field"><span>Volledige naam *</span><input value={wizard.adminName} onChange={(event) => setWizard((current) => ({ ...current, adminName: event.target.value }))} /></label><label className="fg-field"><span>Zakelijk e-mailadres *</span><input type="email" value={wizard.adminEmail} onChange={(event) => setWizard((current) => ({ ...current, adminEmail: event.target.value }))} /></label></div></>}
          {step === 2 && <><div className="fg-wizard-title"><Palette /><h2>Huisstijl</h2><p>Nieuwe tenants starten met de Fieldgrid-defaults en kunnen direct worden aangepast.</p></div><div className="fg-wizard-brand"><div><label className="fg-field"><span>Primaire kleur</span><div className="fg-color-field"><input type="color" value={wizard.primaryColor} onChange={(event) => setWizard((current) => ({ ...current, primaryColor: event.target.value }))} /><strong>{wizard.primaryColor.toUpperCase()}</strong></div></label><label className="fg-field"><span>Secundaire kleur</span><div className="fg-color-field"><input type="color" value={wizard.accentColor} onChange={(event) => setWizard((current) => ({ ...current, accentColor: event.target.value }))} /><strong>{wizard.accentColor.toUpperCase()}</strong></div></label></div><div className="fg-wizard-live"><span>VOORBEELD</span><div style={brandStyle(wizard.primaryColor, wizard.accentColor)}><i>{initials(wizard.name || "Fieldgrid")}</i><strong>{wizard.name || "Jouw organisatie"}</strong><small>Een eigen werkplek binnen Fieldgrid</small></div></div></div></>}
          {step === 3 && <><div className="fg-wizard-title"><Layers3 /><h2>Modules</h2><p>Selecteer de V1-onderdelen. Afhankelijkheden worden bij opslaan gecontroleerd.</p></div><ModuleCards enabled={wizard.enabledServices} onToggle={toggleWizardModule} /></>}
          {step === 4 && <><div className="fg-wizard-title"><Mail /><h2>Communicatie</h2><p>Leg het gewenste afzenderadres vast; SendGrid-verificatie blijft leidend.</p></div><label className="fg-field"><span>Afzender e-mail (optioneel)</span><input type="email" value={wizard.senderEmail} onChange={(event) => setWizard((current) => ({ ...current, senderEmail: event.target.value }))} /></label><div className="fg-wizard-tip"><MessageSquareText /> Vier standaardtemplates worden automatisch tenantgebonden aangemaakt.</div></>}
          {step === 5 && <><div className="fg-wizard-title"><ClipboardCheck /><h2>Controleer de inrichting</h2><p>Provisioning is idempotent: een dubbele submit maakt geen tweede tenant.</p></div><div className="fg-review-grid"><div><span>ORGANISATIE</span><strong>{wizard.name}</strong><small>{wizard.domain || `${wizard.slug}.fieldgrid.nl`}</small><button type="button" onClick={() => setStep(0)}>Wijzigen</button></div><div><span>BEHEERDER</span><strong>{wizard.adminName}</strong><small>{wizard.adminEmail}</small><button type="button" onClick={() => setStep(1)}>Wijzigen</button></div><div><span>HUISSTIJL</span><strong><i style={{ background: wizard.primaryColor }} /><i style={{ background: wizard.accentColor }} /> Fieldgrid-basis</strong><small>Logo kan na onboarding</small><button type="button" onClick={() => setStep(2)}>Wijzigen</button></div><div><span>MODULES & MAIL</span><strong>{wizard.enabledServices.length} V1-modules actief</strong><small>{wizard.senderEmail || "Fieldgrid-afzenderfallback"}</small><button type="button" onClick={() => setStep(3)}>Wijzigen</button></div></div></>}
          {error && <div className="fg-error" role="alert">{error}</div>}<div className="fg-wizard-footer"><Button variant="outline" disabled={pending} onClick={() => step === 0 ? go(initialData.tenants.length ? "overview" : "onboarding") : setStep((current) => current - 1)}>{step === 0 ? "Annuleren" : "Vorige"}</Button><Button disabled={pending} onClick={() => step === 5 ? run(() => createPlatformTenant(wizard), "Tenant aangemaakt.", () => go("tenants")) : nextStep()}>{pending ? "Bezig…" : step === 5 ? "Tenant aanmaken" : "Volgende"}{step < 5 && <ArrowRight />}</Button></div></section></div></>}

        {view === "templates" && selected && selectedTemplate && <><PageHeader eyebrow="PLATFORM / COMMUNICATIE" title="Berichttemplates" description="Bewerk en versioneer e-mail en pushberichten per tenant." action={<label className="fg-tenant-select">Tenant<select value={selected.id} onChange={(event) => { if (dirtyTemplate && !window.confirm("Onbewaarde wijzigingen verwerpen?")) return; const id = event.target.value; setSelectedId(id); const tenant = initialData.tenants.find((item) => item.id === id); const template = tenant?.templates.find((item) => item.key === templateKey); if (template) setDraft({ subject: template.subject, body: template.body }); }}>{initialData.tenants.map((tenant) => <option value={tenant.id} key={tenant.id}>{tenant.name}</option>)}</select></label>} /><div className={`fg-template-layout${selectedTemplate.channel === "email" ? " email" : ""}`}><section className="fg-panel fg-template-list"><div className="fg-panel-heading"><div><span className="fg-eyebrow">BERICHTEN</span><h2>Templates</h2></div></div>{TEMPLATE_CATALOG.map((definition) => { const row = selected.templates.find((item) => item.key === definition.key); return <button type="button" key={definition.key} className={templateKey === definition.key ? "active" : ""} onClick={() => chooseTemplate(definition.key)}><span>{definition.channel === "email" ? <Mail /> : <Smartphone />}</span><span><strong>{definition.title}</strong><small>{definition.channel === "email" ? "E-mail" : "Push"} · revisie {row?.revision ?? 1}</small></span>{row?.customized && <i title="Aangepast" />}</button>; })}</section><section className="fg-panel fg-template-editor"><div className="fg-panel-heading"><div><span className="fg-eyebrow">{selectedTemplate.channel.toUpperCase()} / {selected.name.toUpperCase()}</span><h2>{templateDefinition(templateKey).title}</h2></div><span className={`fg-template-state${selectedTemplate.customized ? " customized" : ""}`}>{selectedTemplate.customized ? "Aangepast" : "Standaard"}</span></div><p className="fg-panel-description">{templateDefinition(templateKey).description}</p><label className="fg-field"><span>{selectedTemplate.channel === "email" ? "Onderwerp" : "Titel"}</span><input value={draft.subject} onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))} /></label><label className="fg-field"><span>Bericht</span><textarea rows={selectedTemplate.channel === "email" ? 8 : 5} value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} /></label><div className="fg-variable-group"><strong>Beschikbare variabelen</strong><div>{templateDefinition(templateKey).tokens.map((token) => <button type="button" key={token} onClick={() => setDraft((current) => ({ ...current, body: `${current.body}{${token}}` }))}>{`{${token}}`}</button>)}</div></div>{error && <div className="fg-error" role="alert">{error}</div>}<div className="fg-editor-actions"><Button variant="outline" disabled={pending} onClick={() => run(() => savePlatformTemplate({ tenantId: selected.id, key: templateKey, subject: selectedTemplate.defaultSubject, body: selectedTemplate.defaultBody, reset: true }), "Standaardtemplate hersteld.")}>Herstel standaard</Button><Button disabled={pending || !dirtyTemplate} onClick={() => run(() => savePlatformTemplate({ tenantId: selected.id, key: templateKey, ...draft, reset: false }), "Nieuwe templaterevisie opgeslagen.")}>Wijzigingen bewaren</Button></div></section>{selectedTemplate.channel === "email" ? <EmailCanvas tenant={selected} template={selectedTemplate} draft={draft} notify={setNotice} /> : <section className="fg-panel fg-message-preview"><div className="fg-panel-heading"><div><span className="fg-eyebrow">LIVE VOORBEELD</span><h2>Pushmelding</h2></div></div><div className="fg-phone-frame"><div className="fg-phone-time">09:41 <span>•••</span></div><div className="fg-push-preview"><TenantBadge tenant={selected} small /><div><small>{selected.name} · nu</small><strong>{renderTemplateText(draft.subject, { ...PREVIEW_VALUES, bedrijfsnaam: selected.name }, false)}</strong><p>{renderTemplateText(draft.body, { ...PREVIEW_VALUES, bedrijfsnaam: selected.name }, false)}</p></div></div></div><p className="fg-preview-caption">Fictieve preview; er wordt niets verzonden.</p></section>}</div></>}
      </main>
    </div>
    {notice && <div className="fg-toast" role="status"><CheckCircle2 />{notice}<button type="button" onClick={() => setNotice("")} aria-label="Sluiten"><X /></button></div>}
    {view !== "onboarding" && error && <div className="fg-toast error" role="alert"><CircleHelp />{error}<button type="button" onClick={() => setError("")} aria-label="Sluiten"><X /></button></div>}
  </div>;
}
