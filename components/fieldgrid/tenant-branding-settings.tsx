"use client";

import { useEffect,useRef,useState,useTransition } from "react";
import Image from "next/image";
import { Check,ImagePlus,LayoutDashboard,RotateCcw,Save,Trash2,Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { TenantContext } from "@/lib/auth/context";
import type { WorkspaceData } from "@/lib/data/workspace";
import { FIELDGRID_PRIMARY,FIELDGRID_SECONDARY } from "@/lib/communications/templates";
import { brandThemeStyle,createBrandPalette } from "@/lib/branding/palette";
import { BRANDING_LOGO_MAX_BYTES,tenantHouseStyleSchema } from "@/lib/branding/validation";
import { saveTenantHouseStyle } from "@/lib/branding/house-style-actions";
import { SectionHeader } from "./section-header";
import { BrandPalettePreview } from "./brand-palette-preview";
import { FieldgridBrand } from "./brand";

export function TenantBrandingSettings({tenant,branding,logoUrl}:{tenant:TenantContext;branding:WorkspaceData["branding"];logoUrl:string|null}){
 const router=useRouter(),fileInput=useRef<HTMLInputElement>(null),[pending,start]=useTransition();
 const initial=()=>({primaryColor:createBrandPalette(tenant.primaryColor,tenant.accentColor).primary,accentColor:createBrandPalette(tenant.primaryColor,tenant.accentColor).accent,
  senderName:branding?.sender_name??tenant.name,senderEmail:branding?.sender_email??"",expectedUpdatedAt:branding?.updated_at??"",logoAction:"keep" as "keep"|"remove"});
 const [source,setSource]=useState(initial),[draft,setDraft]=useState(initial),[sourceLogo,setSourceLogo]=useState(logoUrl);
 const [file,setFile]=useState<File|null>(null),[previewUrl,setPreviewUrl]=useState<string|null>(null),[error,setError]=useState(""),[success,setSuccess]=useState(false);
 const allowed=tenant.roles.some(role=>role==="management"||role==="tenant_admin"),dirty=Boolean(file)||JSON.stringify(draft)!==JSON.stringify(source);
 const changed=Boolean(branding?.updated_at&&branding.updated_at>source.expectedUpdatedAt);
 const visibleLogo=draft.logoAction==="remove"?null:previewUrl??sourceLogo;
 useEffect(()=>()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);},[previewUrl]);
 useEffect(()=>{
  if(!dirty)return;
  const warn=(event:BeforeUnloadEvent)=>event.preventDefault();window.addEventListener("beforeunload",warn);
  return()=>window.removeEventListener("beforeunload",warn);
 },[dirty]);
 const resetFile=()=>{setFile(null);setPreviewUrl(null);if(fileInput.current)fileInput.current.value="";};
 const discard=()=>{setDraft(source);resetFile();setError("");setSuccess(false);};
 const field=(name:keyof Pick<typeof draft,"primaryColor"|"accentColor"|"senderName"|"senderEmail">,value:string)=>{setDraft({...draft,[name]:value});setSuccess(false);setError("");};
 const submit=()=>{
  const parsed=tenantHouseStyleSchema.safeParse(draft);if(!parsed.success){setError("Controleer de kleuren en afzendergegevens. Gebruik volledige hexkleuren, zoals #222C35.");return;}
  const data=new FormData();Object.entries(parsed.data).forEach(([key,value])=>data.set(key,value));if(file)data.set("logo",file);
  start(async()=>{
   try{
    const result=await saveTenantHouseStyle(data);if(!result.ok){setError(result.error);setSuccess(false);return;}
    const saved={...parsed.data,expectedUpdatedAt:result.updatedAt,logoAction:"keep" as const};
    setDraft(saved);setSource(saved);setSourceLogo(result.logoUrl);resetFile();setError("");setSuccess(true);router.refresh();
   }catch{setError("Opslaan kon niet worden bevestigd. Je wijzigingen blijven bewaard; probeer opnieuw.");setSuccess(false);}
  });
 };
 return <section className="panel tenant-house-style" aria-label="Huisstijl">
  <SectionHeader subtitle="ORGANISATIE" title="Huisstijl" help="Dezelfde uitstraling voor management, personeel, klanten en nieuwe documenten."/>
  {!allowed&&<p className="form-note">Je beheerder kan de huisstijl aanpassen. Je kunt hier het actuele voorbeeld bekijken.</p>}
  <div className="tenant-house-style-layout"><form className="workspace-form" onSubmit={event=>{event.preventDefault();submit();}}>
   <fieldset className="tenant-branding-colors wide" disabled={!allowed||pending}>
    <legend>Merkkleuren</legend><label>Primaire kleur<div className="tenant-color-control"><input name="primaryColor" aria-label="Primaire kleur" type="color" value={createBrandPalette(draft.primaryColor,draft.accentColor).primary} onChange={event=>field("primaryColor",event.target.value)}/><input aria-label="Primaire kleur hexcode" value={draft.primaryColor} maxLength={7} onChange={event=>field("primaryColor",event.target.value)}/></div></label>
    <label>Secundaire kleur<div className="tenant-color-control"><input name="accentColor" aria-label="Secundaire kleur" type="color" value={createBrandPalette(draft.primaryColor,draft.accentColor).accent} onChange={event=>field("accentColor",event.target.value)}/><input aria-label="Secundaire kleur hexcode" value={draft.accentColor} maxLength={7} onChange={event=>field("accentColor",event.target.value)}/></div><small>Dit is de bestaande accentkleur, met automatisch leesbare tinten.</small></label>
   </fieldset>
   <fieldset className="tenant-branding-logo wide" disabled={!allowed||pending}><legend>Tenantlogo</legend>
    <div className="tenant-logo-current">{visibleLogo?<Image src={visibleLogo} width={220} height={100} alt={`Logo van ${tenant.name}`} unoptimized/>:<FieldgridBrand tenantName={tenant.name}/>}
     <span>De beeldverhouding blijft behouden. Hetzelfde veilige logo verschijnt op lichte en donkere achtergronden.</span></div>
    <label className="wide">Logo uploaden of vervangen<input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{
     const chosen=event.target.files?.[0];if(!chosen){resetFile();return;}
     if(!["image/png","image/jpeg","image/webp"].includes(chosen.type)||chosen.size===0||chosen.size>BRANDING_LOGO_MAX_BYTES){resetFile();setError("Kies PNG, JPG of WebP van maximaal 2 MB.");setSuccess(false);return;}
     setFile(chosen);setPreviewUrl(URL.createObjectURL(chosen));setDraft({...draft,logoAction:"keep"});setError("");setSuccess(false);
    }}/><small>PNG, JPG of WebP · maximaal 2 MB · 4096px per zijde · geen animatie. Veiligheidscontrole bij opslaan.</small></label>
    {(visibleLogo||file)&&<button className="secondary-button" type="button" onClick={()=>{resetFile();setDraft({...draft,logoAction:"remove"});setSuccess(false);}}><Trash2 size={16}/>Huidig logo verwijderen</button>}
    {draft.logoAction==="remove"&&<p className="form-note">Het actuele logo wordt bij opslaan ontkoppeld. Historische documenten blijven intact.</p>}
   </fieldset>
   <fieldset className="tenant-branding-sender wide" disabled={!allowed||pending}><legend>Bestaande afzendergegevens</legend>
    <label>Afzendernaam<input name="senderName" value={draft.senderName} maxLength={160} minLength={2} required onChange={event=>field("senderName",event.target.value)}/></label>
    <label>Afzendermail<input name="senderEmail" type="email" value={draft.senderEmail} maxLength={254} onChange={event=>field("senderEmail",event.target.value)}/><small>Een eigen afzender wordt alleen gebruikt bij geverifieerde domein- en providerinstellingen.</small></label>
   </fieldset>
   {error&&<p className="auth-message error wide" role="alert">{error}</p>}{success&&<p className="tenant-branding-success wide" role="status"><Check size={18}/>Je huisstijl is opgeslagen voor alle tenantportalen.</p>}
   {changed&&<div className="wizard-note wide" role="status"><span>De opgeslagen huisstijl is intussen gewijzigd. Je concept is niet vervangen.</span><button className="secondary-button" type="button" disabled={pending} onClick={()=>{
    if(!dirty||window.confirm("Je concept verwerpen en de actuele instellingen gebruiken?")){const next=initial();setSource(next);setDraft(next);setSourceLogo(logoUrl);resetFile();setError("");setSuccess(false);}
   }}>Actuele instellingen gebruiken</button></div>}
   {allowed&&<div className="tenant-branding-actions wide"><button className="secondary-button" type="button" disabled={pending||!dirty} onClick={discard}><Undo2 size={16}/>Wijzigingen annuleren</button>
    <button className="secondary-button" type="button" disabled={pending} onClick={()=>{if(window.confirm("De kleurzaden en het actuele logo terugzetten naar Fieldgrid? Afzender- en bedrijfsgegevens blijven behouden. Klik daarna Opslaan om te bevestigen.")){resetFile();setDraft({...draft,primaryColor:FIELDGRID_PRIMARY.toLowerCase(),accentColor:FIELDGRID_SECONDARY.toLowerCase(),logoAction:"remove"});setSuccess(false);setError("");}}}><RotateCcw size={16}/>Fieldgrid-standaard</button>
    <button className="primary-button" type="submit" disabled={pending||!dirty||!branding}><Save size={16}/>{pending?"Opslaan…":"Huisstijl opslaan"}</button></div>}
  </form><aside className="tenant-branding-live" style={brandThemeStyle(draft.primaryColor,draft.accentColor)} aria-label="Live huisstijlvoorbeeld">
   <div className="tenant-branding-preview-nav"><FieldgridBrand tenantName={tenant.name} logoUrl={visibleLogo}/><span><LayoutDashboard size={18}/>Overzicht</span></div>
   <div className="tenant-branding-preview-card"><span className="eyebrow">Live voorbeeld · niet opgeslagen</span><h3>Alles overzichtelijk op één plek.</h3><p>De afgeleide tinten blijven leesbaar, ook bij lichte of felle merkkleuren.</p><label>Voorbeeld veld<input aria-label="Voorbeeld veld" placeholder="Objectnaam" readOnly/></label><span className="tenant-branding-preview-button"><ImagePlus size={17}/>Primaire actie</span></div>
   <BrandPalettePreview primary={draft.primaryColor} accent={draft.accentColor}/>
  </aside></div>
 </section>;
}
