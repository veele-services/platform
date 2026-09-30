import { z } from "zod";

export const dossierTabs = [
  ["overzicht", "Overzicht"], ["persoon", "Persoonsgegevens"], ["contracten", "Dienstverband & contracten"],
  ["certificaten", "Certificaten & bevoegdheden"], ["ontwikkeling", "Beoordelingen & ontwikkeling"],
  ["inzet", "Inzet & werkhistorie"], ["uren", "Uren & verlof"], ["verzuim", "Verzuim & re-integratie"],
  ["middelen", "Bedrijfsmiddelen & toegang"], ["documenten", "Documenten"], ["notities", "Notities & afspraken"], ["tijdlijn", "Tijdlijn & taken"],
] as const;
export type DossierTab = typeof dossierTabs[number][0];
export const recordKinds = ["profile", "contract", "certificate", "review", "asset", "absence", "task", "checklist", "vog", "note"] as const;
export type RecordKind = typeof recordKinds[number];
export type DossierValues = Record<string, string | number | boolean | string[]>;
export type DossierRecord = { id: string; kind: RecordKind; title: string; status: string; revision: number; data: DossierValues; previousId: string | null; updatedAt: string; dueOn: string | null };
export type DossierField = { key: string; label: string; type?: "text" | "textarea" | "date" | "number" | "email" | "select" | "checkbox" | "documents"; options?: string[][]; required?: boolean; step?: number; hint?: string };
const opt = (...items: string[]):[string,string][] => items.map((item) => {const [key,label]=item.split(":");return [key,label];});
const dates: DossierField[] = [{ key: "startsOn", label: "Startdatum", type: "date", required: true }, { key: "endsOn", label: "Einddatum (laat leeg bij onbepaalde tijd)", type: "date" }];
const documents: DossierField = { key: "document_ids", label: "Gekoppelde documenten", type: "documents", step: 3, hint: "Upload bestanden op Documenten. Koppel hier het bestaande bestand; er wordt geen kopie gemaakt." };
const followup: DossierField[] = [{ key: "ownerId", label: "Verantwoordelijke", type: "select", options: [], step: 4 }, { key: "reminderEmails", label: "Management-e-mailadressen", step: 4, hint: "Expliciete ontvangers, gescheiden door komma’s. Leeg betekent geen e-mailreminders." }, { key: "reminderDays", label: "Dagen vooraf", step: 4, hint: "Bijvoorbeeld 30,14,7. Alleen bij een vastgelegde deadline." }];

export const dossierDefinitions: Record<RecordKind, { title: string; tab: DossierTab; statuses: [string,string][]; fields: DossierField[]; steps?: string[] }> = {
 profile: { title: "Persoonsgegevens", tab: "persoon", statuses: opt("active:Actueel"), fields: [
  { key: "name", label: "Volledige naam", required: true }, { key: "employeeNumber", label: "Personeelsnummer", required: true }, { key: "email", label: "Zakelijk e-mailadres", type: "email" }, { key: "phone", label: "Zakelijke telefoon" },
  { key: "privateEmail", label: "Privé e-mailadres (optioneel)", type: "email" }, { key: "privatePhone", label: "Privételefoon (optioneel)" },
  { key: "emergencyName", label: "Noodcontact (optioneel)" }, { key: "emergencyPhone", label: "Telefoon noodcontact" }, { key: "employmentStatus", label: "Dienstverbandstatus", type: "select", options: opt("preparation:In voorbereiding","active:Actief","leaving:Uitdiensttreding gepland","former:Uit dienst","archived:Gearchiveerd") }, { key: "lastDay", label: "Laatste werkdag", type: "date" },
 ] },
 contract: { title: "Overeenkomst", tab: "contracten", steps: ["Type & datums","Werkafspraken","Documenten","Opvolging","Controleren"], statuses: opt("draft:Concept","active:Vastgelegd","ended:Historisch"), fields: [
  { key: "title", label: "Titel", required: true }, { key: "employmentType", label: "Contractvorm", type: "select", options: opt("fixed:Tijdelijk dienstverband","permanent:Onbepaalde tijd","hire:Inhuur","other:Andere samenwerking") }, ...dates,
  { key: "functionId", label: "Functie", type: "select", options: [], step: 2 }, { key: "team", label: "Afdeling / team", step: 2 }, { key: "managerId", label: "Leidinggevende", type: "select", options: [], step: 2 }, { key: "hours", label: "Contracturen per week", type: "number", step: 2 }, { key: "workdays", label: "Gebruikelijke werkdagen", step: 2 }, { key: "cao", label: "Toepasselijke cao (indien bekend)", step: 2 }, { key: "conditions", label: "Arbeidsvoorwaarden", type: "textarea", step: 2 }, { key: "salary", label: "Salaris, schaal, toeslagen en vergoedingen", type: "textarea", step: 2 },
  documents, { key: "signatureStatus", label: "Ondertekening", type: "select", options: opt("unsigned:Nog niet getekend","signed:Ondertekend bewijs aanwezig"), step: 3, hint: "Alleen registreren met een ondertekend document. Digitale ondertekening is niet aangesloten." },
  { key: "probationUntil", label: "Einde overeengekomen proeftijd", type: "date", step: 4 }, { key: "noticeAgreement", label: "Opzegafspraken", step: 4 }, { key: "noticePolicy", label: "Aanzegging: toepasselijkheid", type: "select", options: opt("review:Nog te beoordelen","applicable:Van toepassing (bevestigd)","exempt:Uitzondering / niet van toepassing"), step: 4 },
  { key: "reviewOn", label: "Contractbespreking", type: "date", step: 4 }, { key: "decision", label: "Verlengbesluit", type: "select", options: opt("pending:Nog te besluiten","extend:Verlengen","stop:Niet verlengen"), step: 4 }, { key: "writtenNoticeOn", label: "Schriftelijke aanzegging verstuurd op", type: "date", step: 4 }, { key: "noticeEvidence", label: "Toelichting bewijs schriftelijke aanzegging", step: 4 }, ...followup,
 ] },
 certificate: { title: "Certificaat", tab: "certificaten", steps: ["Type","Geldigheid","Bewijs","Controle & reminders","Controleren"], statuses: opt("unverified:Niet gecontroleerd","review:In controle","approved:Goedgekeurd","rejected:Afgekeurd","revoked:Ingetrokken"), fields: [
  { key: "code", label: "Kwalificatietype", type: "select", options: [], required: true }, { key: "title", label: "Naam", required: true },
  { key: "issuer", label: "Uitgevende organisatie", step: 2 }, { key: "number", label: "Certificaatnummer (optioneel)", step: 2 }, { key: "level", label: "Niveau / bevoegdheid", step: 2 }, { key: "issuedOn", label: "Behaaldatum", type: "date", step: 2 }, { key: "startsOn", label: "Geldig vanaf", type: "date", step: 2 }, { key: "endsOn", label: "Geldig tot en met (leeg = geen einddatum)", type: "date", step: 2 }, documents,
  { key: "verificationNote", label: "Toelichting controle", type: "textarea", step: 4 }, { key: "training", label: "Herhaling / training", step: 4 }, ...followup,
 ] },
 review: { title: "Gesprek", tab: "ontwikkeling", statuses: opt("planned:Gepland","draft:Conceptverslag","completed:Afgerond"), fields: [
  { key: "title", label: "Onderwerp", required: true }, { key: "reviewType", label: "Gesprekstype", type: "select", options: opt("probation:Proeftijd","performance:Functioneren","assessment:Beoordeling","progress:Voortgang","development:Ontwikkeling","improvement:Verbeterafspraken","exit:Exitgesprek") }, { key: "startsOn", label: "Gespreksdatum", type: "date" }, { key: "participants", label: "Deelnemers" }, { key: "observations", label: "Criteria en concrete observaties", type: "textarea" }, { key: "strengths", label: "Sterke punten", type: "textarea" }, { key: "development", label: "Ontwikkelpunten", type: "textarea" }, { key: "response", label: "Reactie medewerker", type: "textarea" }, { key: "training", label: "Opleidingen / budgetafspraken", type: "textarea" }, { key: "receivedOn", label: "Ontvangst bevestigd op (geen inhoudelijk akkoord)", type: "date" }, { key: "agreement", label: "Inhoudelijke reactie / akkoord", type: "textarea" }, { key: "followupTitle", label: "Opvolgtaak / ontwikkeldoel" }, { key: "dueOn", label: "Deadline / volgende evaluatie", type: "date" }, documents, ...followup,
 ] },
 asset: { title: "Bedrijfsmiddel", tab: "middelen", statuses: opt("issued:Uitgegeven","returned:Geretourneerd","lost:Verloren","damaged:Beschadigd"), fields: [
  { key: "title", label: "Middel", required: true }, { key: "category", label: "Categorie", type: "select", options: opt("clothing:Kleding","tool:Gereedschap","machine:Machine","phone:Telefoon","vehicle:Voertuig","key:Sleutel","pass:Toegangspas") }, { key: "serial", label: "Identificatie / serienummer" }, { key: "startsOn", label: "Uitgiftedatum", type: "date" }, { key: "condition", label: "Staat bij uitgifte" }, { key: "receivedOn", label: "Ontvangst bevestigd op", type: "date" }, { key: "dueOn", label: "Verwachte retourdatum", type: "date" }, { key: "returnedOn", label: "Werkelijke retourdatum", type: "date" }, { key: "incident", label: "Feitelijke schade- of verliesregistratie", type: "textarea" }, { key: "instruction", label: "Ontvangen veiligheidsinstructie + versie" }, documents, ...followup,
 ] },
 absence: { title: "Verzuimproces", tab: "verzuim", statuses: opt("open:Lopend","recovered:Hersteld"), fields: [
  { key: "startsOn", label: "Eerste verzuimdag", type: "date", required: true }, { key: "endsOn", label: "Hersteldatum", type: "date" }, { key: "process", label: "Procesafspraak", type: "select", options: opt("contact:Contactmoment","evaluation:Evaluatiemoment","plan:Plan van aanpak bespreken","return:Werkhervatting afstemmen") }, { key: "dueOn", label: "Volgende procesafspraak", type: "date" }, ...followup,
 ] },
 task: { title: "Taak", tab: "tijdlijn", statuses: opt("open:Open","progress:In behandeling","waiting:Wacht op medewerker","completed:Afgerond"), fields: [
  { key: "title", label: "Taak", required: true }, { key: "priority", label: "Prioriteit", type: "select", options: opt("normal:Normaal","urgent:Urgent") }, { key: "dueOn", label: "Deadline", type: "date" }, { key: "relatedId", label: "Gerelateerde registratie", type: "select", options: [] }, { key: "evidence", label: "Uitgevoerde opvolging / voltooiingsbewijs", type: "textarea" }, ...followup,
 ] },
 checklist: { title: "Checklistonderdeel", tab: "overzicht", statuses: opt("open:Open","progress:In behandeling","completed:Afgerond"), fields: [
  { key: "title", label: "Onderdeel", required: true }, { key: "checklistType", label: "Checklist", type: "select", options: opt("onboarding:Indiensttreding","offboarding:Uitdiensttreding") }, { key: "dueOn", label: "Deadline", type: "date" }, { key: "instructionVersion", label: "Instructieversie (indien van toepassing)" }, { key: "receivedOn", label: "Ontvangen op", type: "date" }, { key: "evidence", label: "Uitvoering / bewijs", type: "textarea" }, ...followup,
 ] },
 vog: { title: "VOG-controle", tab: "certificaten", statuses: opt("open:Nog te controleren","seen:Gezien","review:Opnieuw controleren"), fields: [
  { key: "startsOn", label: "Gezien op", type: "date" }, { key: "purpose", label: "Relevante werkzaamheden / screeningsdoel" }, { key: "dueOn", label: "Volgende controle (alleen indien nodig)", type: "date" }, ...followup,
 ] },
 note: { title: "Notitie of afspraak", tab: "notities", statuses: opt("draft:Concept","open:Open","investigation:In onderzoek","established:Conclusie vastgelegd","completed:Afgerond"), fields: [
  { key: "title", label: "Onderwerp", required: true }, { key: "category", label: "Categorie", type: "select", options: opt("agreement:Werkafspraak","compliment:Compliment","training:Opleiding","improvement:Verbeterafspraak","complaint:Klacht","warning:Waarschuwing") }, { key: "startsOn", label: "Datum", type: "date" }, { key: "body", label: "Feiten, aanleiding en noodzakelijke toelichting", type: "textarea", required: true }, { key: "response", label: "Reactie medewerker", type: "textarea" }, { key: "decision", label: "Besluit en afspraken", type: "textarea" }, { key: "followupTitle", label: "Opvolgtaak" }, { key: "dueOn", label: "Deadline opvolging", type: "date" }, documents, ...followup,
 ] },
};

export const dossierRoles = ["tenant_admin", "management", "hr"];
export function canReadDossier(roles: string[]) { return roles.some((role) => dossierRoles.includes(role)); }
export function employmentStatus(personnelStatus:string, configured?:unknown):string {
 if(personnelStatus==="inactive")return "archived";
 if(personnelStatus==="former")return configured==="archived"?"archived":"former";
 return ["preparation","active","leaving"].includes(String(configured))?String(configured):personnelStatus==="invited"?"preparation":"active";
}
export function businessToday(now = new Date(), timeZone = "Europe/Amsterdam") { return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function shiftDays(value: string, days: number) { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
export function calendarMonths(value: string, months: number) {
 const [year, month, day] = value.split("-").map(Number); const result = new Date(Date.UTC(year,month-1+months,1,12));
 const last = new Date(Date.UTC(result.getUTCFullYear(),result.getUTCMonth()+1,0)).getUTCDate(); result.setUTCDate(Math.min(day,last)); return result.toISOString().slice(0,10);
}
export function noticeDeadline(data: DossierValues): string | null {
 const start = String(data.startsOn ?? ""), end = String(data.endsOn ?? "");
 if (data.employmentType !== "fixed" || data.noticePolicy !== "applicable" || !start || !end || shiftDays(end,1)<calendarMonths(start,6)) return null;
 return calendarMonths(end,-1);
}
export function certificateValidity(data: DossierValues, date = businessToday()) {
 if (data.startsOn && String(data.startsOn)>date) return "Nog niet geldig";
 if (!data.endsOn) return "Geen einddatum";
 if (String(data.endsOn)<date) return "Verlopen";
 return String(data.endsOn)<=shiftDays(date,30) ? "Verloopt binnenkort" : "Geldig";
}
export function contractDeadlines(data:DossierValues):Array<{date:string;label:string}> {
 const candidates:[unknown,string][]=[[data.writtenNoticeOn?null:noticeDeadline(data),"Aanzegging"],[data.reviewOn,"Contractbespreking"],[data.employmentType==="permanent"?null:data.endsOn,"Contracteinde"],[["fixed","permanent"].includes(String(data.employmentType))?data.probationUntil:null,"Proeftijd"]];
 return candidates.filter(([date])=>!!date).map(([date,label])=>({date:String(date),label})).sort((a,b)=>a.date.localeCompare(b.date));
}
export function recordDeadline(kind: RecordKind, data: DossierValues) {
 if (kind === "contract") return contractDeadlines(data)[0]?.date??null;
 if (kind === "review" && data.followupTitle) return String(data.startsOn||"")||null;
 if (kind === "certificate") return String(data.endsOn || "") || null;
 return String(data.dueOn || (kind === "review" ? data.startsOn : "") || "") || null;
}
export function privacyText(value: string) {
 if (/(\bBSN\b|diagnose|medicatie|medisch dossier|ziekteoorzaak|alarmcode|wachtwoord|identiteitskopie)/i.test(value)) throw new Error("Bewaar hier geen medische gegevens, identiteitskopieën of geheime toegangscodes.");
}
export function validateDossierInput(kind: RecordKind, values: unknown, status: string): DossierValues {
 const def = dossierDefinitions[kind]; const raw=z.record(z.string(),z.unknown()).parse(values); const data: DossierValues={};
 if (!def.statuses.some(([key])=>key===status)) throw new Error("Kies een geldige status.");
 for (const field of def.fields) {
  const value=raw[field.key];
  if(field.type==="documents") { data[field.key]=z.array(z.string().uuid()).max(20).parse(value??[]); continue; }
  if(field.type==="checkbox") { data[field.key]=value===true; continue; }
  const text=z.string().trim().max(field.type==="textarea"?6000:500).parse(value==null?"":String(value));
  if(field.required && !text && status!=="draft") throw new Error(`Vul ${field.label.toLowerCase()} in.`);
  if(text && field.type==="date" && !z.string().date().safeParse(text).success) throw new Error(`Controleer ${field.label.toLowerCase()}.`);
  if(text && field.type==="email" && !z.string().email().safeParse(text).success) throw new Error("Vul een geldig e-mailadres in.");
  if(text && field.type==="number" && (!Number.isFinite(Number(text))||Number(text)<0||Number(text)>168)) throw new Error("Contracturen moeten tussen 0 en 168 liggen.");
  if(text && field.options?.length && !field.options.some(([key])=>key===text)) throw new Error(`Ongeldige keuze: ${field.label}.`);
  privacyText(text); data[field.key]=text;
 }
 for(const key of ["functionId","managerId","ownerId","relatedId"]) if(data[key]) z.string().uuid().parse(data[key]);
 if(kind==="certificate"&&!data.startsOn&&data.issuedOn)data.startsOn=data.issuedOn;
 if(data.startsOn && data.endsOn && String(data.endsOn)<String(data.startsOn)) throw new Error("De einddatum mag niet vóór de startdatum liggen.");
 if(kind==="contract") {
  if(data.employmentType==="permanent") { data.endsOn=""; data.noticePolicy="exempt"; }
  if(status!=="draft" && data.employmentType==="fixed" && !data.endsOn) throw new Error("Vul de einddatum van het tijdelijke contract in.");
  if(data.signatureStatus==="signed" && !(data.document_ids as string[])?.length) throw new Error("Koppel het daadwerkelijk ondertekende bewijs.");
  if(data.writtenNoticeOn && (!data.noticeEvidence || !(data.document_ids as string[])?.length)) throw new Error("Koppel en beschrijf het bewijs van de schriftelijke aanzegging.");
 }
 if(kind==="certificate" && (String(data.code).toUpperCase()==="VOG" || /\bVOG\b/i.test(String(data.title)))) throw new Error("Gebruik VOG-controle; upload geen VOG-bestand.");
 if(kind==="certificate" && status==="approved" && !data.verificationNote) throw new Error("Leg vast wat je hebt gecontroleerd.");
 if(kind==="asset" && status==="returned" && !data.returnedOn) throw new Error("Vul de werkelijke retourdatum in.");
 if(kind==="absence" && status==="recovered" && !data.endsOn) throw new Error("Vul de hersteldatum in.");
 if(kind==="vog" && status==="seen" && !data.startsOn) throw new Error("Vul in wanneer de VOG is gezien.");
 if((kind==="task"||kind==="checklist") && status==="completed" && !data.evidence) throw new Error("Beschrijf de uitgevoerde opvolging.");
 const emails=String(data.reminderEmails||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
 if(emails.length>10 || emails.some(email=>!z.string().email().safeParse(email).success)) throw new Error("Gebruik maximaal 10 geldige reminderadressen, gescheiden door komma’s.");
 data.reminderEmails=[...new Set(emails)].join(", ");
 const days=String(data.reminderDays||"").split(",").map(s=>s.trim()).filter(Boolean);
 if(days.length>12 || days.some(day=>!/^\d+$/.test(day)||Number(day)>365)) throw new Error("Gebruik maximaal 12 herinneringsmomenten van 0–365 dagen vooraf.");
 data.reminderDays=[...new Set(days)].join(",");
 return data;
}

export function currentContract(records: DossierRecord[], today=businessToday()) { return records.filter(r=>r.kind==="contract"&&r.status==="active"&&String(r.data.startsOn)<=today&&(!r.data.endsOn||String(r.data.endsOn)>=today)).sort((a,b)=>String(b.data.startsOn).localeCompare(String(a.data.startsOn)))[0]; }
export function dossierSignals(records: DossierRecord[], today=businessToday()) {
 return records.flatMap(record=>{
  if(["completed","ended","returned","recovered","archived","draft"].includes(record.status)) return [];
  const deadlines=record.kind==="contract"?contractDeadlines(record.data):[{date:recordDeadline(record.kind,record.data),label:""}];
  return deadlines.filter(d=>!!d.date&&d.date<=shiftDays(today,90)).map(d=>({id:record.id,title:d.label?`${d.label} · ${record.title}`:record.title,tab:dossierDefinitions[record.kind].tab,date:d.date!,overdue:d.date!<today,kind:record.kind}));
 }).sort((a,b)=>a.date.localeCompare(b.date));
}
