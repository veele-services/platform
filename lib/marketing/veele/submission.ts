import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import labels from "@/websites/veele-services/reference/field-labels.json";

const text = (max: number) => z.string().trim().min(1).max(max);
const unique = <T extends z.ZodType>(schema: T, max: number) => z.array(schema).min(1).max(max).refine(v => new Set(v).size === v.length, "Kies iedere optie maximaal één keer.");
const service = z.enum(["cleaning", "security", "facilities"]);
const notes = text(1500).optional();
const otherTask = text(500).optional();
const visitors = z.number().int().min(1).max(1000000).optional();
const staff = z.number().int().min(1).max(1000).optional();
const cleaning = z.strictObject({ requestedTasks: unique(z.enum(["office", "common_areas", "shop", "home_handover", "hospitality", "glass", "periodic_floor", "other", "discuss"]), 9), areaM2: z.number().positive().max(10000000).optional(), floorCount: z.number().int().min(1).max(300).optional(), spaces: unique(z.enum(["workspaces", "meeting_rooms", "entrance", "stairs", "lifts", "galleries", "kitchen", "toilets", "storage", "waste_area", "other"]), 11).optional(), glassAccess: z.enum(["ground_level", "upper_floors", "mixed", "unknown"]).optional(), otherTask, notes });
const security = z.strictObject({ requestedTasks: unique(z.enum(["object", "mobile_patrol", "event_security", "retail", "hospitality", "reception", "personal_protection", "chauffeur", "other", "discuss"]), 10), expectedVisitors: visitors, coverage: unique(z.enum(["access_control", "patrol", "visitor_guidance", "reception", "other"]), 5).optional(), staffEstimate: staff, otherTask, notes });
const facilities = z.strictObject({ requestedTasks: unique(z.enum(["hospitality_support", "event_staff", "bar", "guest_reception", "setup_breakdown", "catering_support", "toilet_cleaning", "other", "discuss"]), 9), expectedVisitors: visitors, staffEstimate: staff, toiletCount: z.number().int().min(1).max(10000).optional(), otherTask, notes });
const clock = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/);
const windowSchema = z.strictObject({ date: z.iso.date(), startTime: clock, endTime: clock, endDate: z.iso.date().optional() });
export const websiteSubmissionSchema = z.strictObject({
  envelopeVersion: z.literal("1.0.0"),
  inquiry: z.strictObject({
    schemaVersion: z.literal("1.0.0"), mode: z.literal("submission"), inquiryId: z.uuid(), createdAt: z.iso.datetime(), locale: z.literal("nl-NL"), source: z.literal("veele-website"),
    services: unique(service, 3),
    location: z.strictObject({ type: z.enum(["office", "vve", "shop", "hospitality", "event", "home", "other"]).optional(), otherType: text(200).optional(), city: text(100).optional(), country: z.literal("NL"), postalCode: z.string().regex(/^[1-9][0-9]{3} [A-Z]{2}$/).optional(), street: text(160).optional(), houseNumber: text(20).optional(), venueName: text(160).optional() }),
    tasks: z.strictObject({ cleaning: cleaning.optional(), security: security.optional(), facilities: facilities.optional() }),
    planning: z.strictObject({ type: z.enum(["once", "recurring", "discuss", "event"]), cadence: z.enum(["daily", "weekly", "fortnightly", "monthly", "quarterly", "seasonal", "discuss"]).optional(), startDate: z.iso.date().optional(), endDate: z.iso.date().optional(), preferredDays: unique(z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]), 7).optional(), timePreference: z.enum(["daytime", "evening", "night", "flexible"]).optional(), timeZone: z.literal("Europe/Amsterdam"), windows: z.array(windowSchema).min(1).max(12).optional(), notes: text(1000).optional() }),
    contact: z.strictObject({ name: text(120), organization: text(160).optional(), email: z.email().max(254).optional(), phone: z.string().regex(/^\+?[0-9][0-9 ()-]{5,23}[0-9]$/).refine(v => v.replace(/\D/g, "").length >= 7 && v.replace(/\D/g, "").length <= 15).optional(), preferredChannel: z.enum(["email", "phone"]) }),
    message: text(2000).optional(),
  }),
  wizardAnswers: z.strictObject({ planningFlexible: z.boolean(), frequencyLabel: z.enum(["Eenmalig", "Wekelijks", "Meerdere keren per week", "Maandelijks", "In overleg"]) }),
}).superRefine(({ inquiry: q, wizardAnswers: a }, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  if (q.location.type === "other" && !q.location.otherType) issue(["inquiry", "location", "otherType"], "Beschrijf het andere type locatie.");
  if (q.location.type !== "other" && q.location.otherType) issue(["inquiry", "location", "otherType"], "Kies Anders voor deze toelichting.");
  for (const s of ["cleaning", "security", "facilities"] as const) {
    const branch = q.tasks[s];
    if (q.services.includes(s) !== Boolean(branch)) issue(["inquiry", "tasks", s], "Controleer de gekozen diensten en werkzaamheden.");
    if (branch?.requestedTasks.includes("discuss") && branch.requestedTasks.length !== 1) issue(["inquiry", "tasks", s, "requestedTasks"], "Kies werkzaamheden of samen bespreken.");
    if (branch?.requestedTasks.includes("other") && !branch.otherTask) issue(["inquiry", "tasks", s, "otherTask"], "Omschrijf de andere werkzaamheid.");
  }
  if (q.tasks.cleaning?.glassAccess && !q.tasks.cleaning.requestedTasks.includes("glass")) issue(["inquiry", "tasks", "cleaning", "glassAccess"], "Kies glasbewassing voor bereikbaarheid van glas.");
  if (q.tasks.facilities?.toiletCount && !q.tasks.facilities.requestedTasks.includes("toilet_cleaning")) issue(["inquiry", "tasks", "facilities", "toiletCount"], "Kies toiletschoonmaak voor het aantal toiletten.");
  if (!q.contact.email && !q.contact.phone) issue(["inquiry", "contact", "email"], "Vul een e-mailadres of telefoonnummer in.");
  if (!q.contact[q.contact.preferredChannel]) issue(["inquiry", "contact", q.contact.preferredChannel], "Controleer uw contactgegevens.");
  const expected = { Eenmalig: ["once", undefined], Wekelijks: ["recurring", "weekly"], "Meerdere keren per week": ["recurring", "discuss"], Maandelijks: ["recurring", "monthly"], "In overleg": ["discuss", undefined] }[a.frequencyLabel];
  if (q.planning.type !== expected[0] || q.planning.cadence !== expected[1]) issue(["wizardAnswers", "frequencyLabel"], "Controleer de gewenste inzet.");
  if (a.planningFlexible !== (q.planning.timePreference === "flexible")) issue(["wizardAnswers", "planningFlexible"], "Controleer of de planning bespreekbaar is.");
  if (q.planning.endDate && (!q.planning.startDate || q.planning.endDate < q.planning.startDate)) issue(["inquiry", "planning", "endDate"], "Kies een geldige start- en einddatum.");
  for (const [index, w] of (q.planning.windows ?? []).entries()) if (`${w.endDate ?? w.date}T${w.endTime}` <= `${w.date}T${w.startTime}`) issue(["inquiry", "planning", "windows", index], "Kies voor inzet na middernacht een latere einddatum.");
});
export type WebsiteSubmission = z.infer<typeof websiteSubmissionSchema>;

const serviceNames = { cleaning: "Schoonmaak", security: "Beveiliging", facilities: "Facilitaire diensten" };
const enumNames: Record<string, string> = { ...serviceNames, daily: "Dagelijks", fortnightly: "Tweewekelijks", quarterly: "Per kwartaal", seasonal: "Seizoensgebonden", monday: "Maandag", tuesday: "Dinsdag", wednesday: "Woensdag", thursday: "Donderdag", friday: "Vrijdag", saturday: "Zaterdag", sunday: "Zondag", daytime: "Overdag", evening: "Avond", night: "Nacht", ground_level: "Begane grond", upper_floors: "Hogere verdiepingen", mixed: "Verschillende hoogtes", unknown: "Onbekend", workspaces: "Werkplekken", meeting_rooms: "Vergaderruimtes", entrance: "Entree", stairs: "Trappen", lifts: "Liften", galleries: "Galerijen", kitchen: "Keuken", toilets: "Toiletten", storage: "Opslag", waste_area: "Afvalruimte", access_control: "Toegangscontrole", patrol: "Rondes", visitor_guidance: "Bezoekersbegeleiding", office: "Kantoor", vve: "VvE of wooncomplex", shop: "Winkel", hospitality: "Horeca", event: "Evenement", home: "Woning", other: "Anders", common_areas: "VvE’s, portieken en flats", home_handover: "Woningen en oplevering", glass: "Glasbewassing", periodic_floor: "Periodieke vloerbehandeling", object: "Objectbeveiliging", mobile_patrol: "Mobiele surveillance", event_security: "Evenementenbeveiliging", retail: "Winkelsurveillance", reception: "Receptiediensten", personal_protection: "Persoonsbeveiliging", chauffeur: "Chauffeursdiensten", hospitality_support: "Horecaondersteuning", event_staff: "Evenementenmedewerkers", bar: "Bardiensten", toilet_cleaning: "Toiletschoonmaak", guest_reception: "Gastontvangst", setup_breakdown: "Op- en afbouw", catering_support: "Cateringondersteuning", once: "Eenmalig", recurring: "Terugkerend", discuss: "In overleg", weekly: "Wekelijks", monthly: "Maandelijks", flexible: "Bespreekbaar", email: "E-mail", phone: "Telefoon" };
function leaves(value: unknown, path = "", entries: Array<[string, unknown]> = []) {
  if (value === undefined || value === null || value === "") return entries;
  if (Array.isArray(value)) { if (value.length) entries.push([path, value]); }
  else if (typeof value === "object") for (const [key, child] of Object.entries(value)) leaves(child, `${path}/${key}`, entries);
  else entries.push([path, value]);
  return entries;
}
function display(path: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "Ja (aangevinkt)" : "Nee (niet aangevinkt)";
  const enumPath = /\/(?:services|type|cadence|timePreference|preferredChannel|requestedTasks|spaces|coverage|glassAccess|preferredDays)$/.test(path);
  const enumText = (v: unknown) => typeof v === "string" && enumNames[v] ? `${enumNames[v]} (${v})` : String(v);
  if (enumPath) return Array.isArray(value) ? value.map(enumText).join(", ") : enumText(value);
  return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function mapWebsiteSubmission(envelope: WebsiteSubmission, tenantId: string, secret: string) {
  const q = envelope.inquiry;
  const nativePaths = new Set(["/inquiry/contact/name", "/inquiry/services", "/wizardAnswers/frequencyLabel"]);
  if (q.contact.organization) nativePaths.add("/inquiry/contact/organization");
  if (q.contact.email) nativePaths.add("/inquiry/contact/email");
  if (q.contact.phone) nativePaths.add("/inquiry/contact/phone");
  if (q.planning.startDate) nativePaths.add("/inquiry/planning/startDate");
  if (q.planning.type !== "discuss") nativePaths.add("/inquiry/planning/type");
  const metadata = { envelopeVersion: envelope.envelopeVersion, ...Object.fromEntries(["schemaVersion", "mode", "inquiryId", "createdAt", "locale", "source"].map(k => [k, q[k as keyof typeof q]])) };
  const all = leaves({ inquiry: { ...q, ...Object.fromEntries(Object.keys(metadata).map(k => [k, undefined])) }, wizardAnswers: envelope.wizardAnswers });
  const extra = all.filter(([path]) => !nativePaths.has(path));
  const extraNotes = "Aanvraag via de Veele-website\n\n" + extra.map(([path, value]) => `${(labels as Record<string, string>)[path] ?? `Aanvullend gegeven ${path}`}: ${display(path, value)}`).join("\n");
  const hash = createHash("sha256").update(canonicalJson(envelope)).digest("hex");
  const bytes = createHmac("sha256", secret).update(`website-intake:v1:${tenantId}:${q.inquiryId}:${hash}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x50; bytes[8] = (bytes[8] & 63) | 0x80;
  const id = bytes.toString("hex").replace(/^(........)(....)(....)(....)(............)$/, "$1-$2-$3-$4-$5");
  return { id, hash, extraNotes, metadata, input: { name: q.contact.organization ?? q.contact.name, contact_name: q.contact.name, email: q.contact.email ?? "", phone: q.contact.phone ?? "", subject: `Aanvraag ${q.services.map(s => serviceNames[s]).join(" + ")} · ${q.location.city ?? "Locatie later vaststellen"}`, description: [...extraNotes].length <= 10000 ? extraNotes : `${q.message ?? "Aanvraag via de Veele-website"}\n\nVolledige aanvullende wensen staan bij Extra opmerkingen en in de interne tijdlijn.`, discipline: q.services.map(s => serviceNames[s]).join(" + "), work_kind: q.planning.type === "recurring" ? "recurring" : "once", date: q.planning.startDate ?? "", frequency: envelope.wizardAnswers.frequencyLabel, location: [q.location.street, q.location.houseNumber, q.location.postalCode, q.location.city].filter(Boolean).join(" ") }, coverage: { total: all.length, native: all.length - extra.length, extra: extra.length } };
}
