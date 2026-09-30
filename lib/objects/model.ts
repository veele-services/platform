import { z } from "zod";
import type { Database, Json } from "@/lib/database.types";

export type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export const objectTabs = [
  ["overzicht", "Overzicht"], ["locatie", "Locatie & structuur"], ["contact", "Contact & bereikbaarheid"],
  ["toegang", "Toegang & beveiligde gegevens"], ["diensten", "Diensten & werkprogramma"], ["afspraken", "Afspraken"],
  ["instructies", "Instructies & taken"], ["werkbonnen", "Werkbonnen & rapporten"], ["kwaliteit", "Kwaliteit & incidenten"],
  ["materialen", "Materialen & voorzieningen"], ["documenten", "Documenten & plattegronden"], ["tijdlijn", "Tijdlijn"],
] as const;
export type ObjectTab = typeof objectTabs[number][0];
export const objectStates = { draft: "Concept", active: "Actief", paused: "Gepauzeerd", archived: "Gearchiveerd" } as const;
export const objectTypes = { office: "Kantoor", residential: "Wooncomplex", school: "Onderwijs", care: "Zorg", retail: "Winkel", industrial: "Bedrijfslocatie", other: "Overig" } as const;
export const recordStates: Record<string,string> = { draft:"Concept",open:"Openstaand",active:"Actief",progress:"In behandeling",completed:"Afgerond",partial:"Deels uitgevoerd",not_done:"Niet uitgevoerd",archived:"Gearchiveerd",new:"Nieuw verzoek",review:"Beoordeling nodig",regular:"Reguliere taak",proposal:"Akkoord gevraagd",accepted:"Akkoord ontvangen",rejected:"Afgewezen" };
export const recordKinds = ["contact","access","programme","instruction","quality","material","task"] as const;
export type RecordKind = typeof recordKinds[number];
export const nodeKinds = {building:"Gebouw",floor:"Verdieping",zone:"Zone",room:"Ruimte",component:"Subobject"} as const;
export const canManageObjects = (roles: string[]) => roles.some(r=>["tenant_admin","management","planner"].includes(r));
export const addressLine = (value: Json) => { const a=(value??{}) as Record<string,Json>;return [a.street,a.postal_code,a.city].filter(Boolean).join(", "); };
export const objectDate = (value: string|null|undefined,timezone="Europe/Amsterdam") => value?new Intl.DateTimeFormat("nl-NL",{dateStyle:"medium",timeStyle:"short",timeZone:timezone}).format(new Date(value)):"Nog niet gepland";
export const valuesOf = (value:Json):Record<string,Json|undefined> => value&&typeof value==="object"&&!Array.isArray(value)?value:{};
export const optionalId = z.string().uuid().or(z.literal(""));
export const objectSchema = z.object({
  id: z.string().uuid(),version:z.coerce.number().int().min(0),customerId:z.string().uuid(),name:z.string().trim().min(2).max(160),
  type:z.enum(Object.keys(objectTypes) as [keyof typeof objectTypes,...Array<keyof typeof objectTypes>]),
  street:z.string().trim().min(2).max(200),postalCode:z.string().trim().min(2).max(20),city:z.string().trim().min(2).max(100),
  latitude:z.string().refine(v=>v===""||Number.isFinite(Number(v))&&Number(v)>=-90&&Number(v)<=90),
  longitude:z.string().refine(v=>v===""||Number.isFinite(Number(v))&&Number(v)>=-180&&Number(v)<=180),
  locationDescription:z.string().max(1000),instructions:z.string().max(4000),
  status:z.enum(["draft","active","paused","archived"]),
  structure:z.string().max(3000).default(""),contact:z.string().max(3000).default(""),programme:z.string().max(4000).default(""),safety:z.string().max(4000).default(""),
});
export const recordSchema = z.object({
  id:z.string().uuid(),objectId:z.string().uuid(),version:z.coerce.number().int().min(0),kind:z.enum(recordKinds),title:z.string().trim().min(2).max(180),body:z.string().max(10000),
  state:z.enum(["draft","open","active","progress","completed","partial","not_done","archived"]),nodeId:optionalId,workOrderId:optionalId,ownerId:optionalId,
  agreementLineId:optionalId.default(""),contactId:optionalId,taskRevisionId:optionalId,assetId:optionalId,service:z.string().max(100),instructionType:z.enum(["","fixed","temporary","appointment"]),
  startsAt:z.string().max(50),endsAt:z.string().max(50),dueOn:z.string().date().or(z.literal("")),
  category:z.string().max(100),frequency:z.string().max(200),window:z.string().max(200),checklist:z.string().max(3000),equipment:z.string().max(1000),
  evidence:z.string().max(3000),acknowledgement:z.boolean(),quantity:z.string().max(30),unit:z.string().max(60),
});
export type ObjectData = {
 agreementOptions:Array<{id:string;title:string;version:number;task_revision_id:string;scope:string}>;qualificationGaps:Database["public"]["Functions"]["personnel_qualification_gaps"]["Returns"];
 object:Row<"objects">;customer:Row<"customers">;nodes:Row<"object_nodes">[];records:Row<"object_records">[];
 orders:Row<"work_orders">[];assignments:Row<"work_order_assignments">[];personnel:Array<Pick<Row<"personnel">,"id"|"full_name">>;
 contacts:Row<"customer_contacts">[];documents:Row<"object_documents">[];history:Row<"object_history">[];
 requests:Row<"object_visit_requests">[];proposals:Row<"object_request_proposals">[];tasks:Row<"task_catalog">[];taskRevisions:Row<"task_revisions">[];
 reports:Row<"report_entries">[];owners:Array<{id:string;label:string}>;bindings:Row<"object_customer_bindings">[];customerAccounts:Array<{user_id:string;email:string}>;
 assets:Array<Pick<Row<"personnel_dossier_items">,"id"|"title"|"personnel_id">>;requirements:Row<"qualification_requirements">[];qualificationTypes:Row<"qualification_types">[];reminderRecipients:Row<"object_reminder_recipients">[];
};
export type VisitRequest = Row<"object_visit_requests"> & {proposals:Row<"object_request_proposals">[];read:boolean;documents:Array<{id:string;title:string;version:number;mime:string}>};
export type VisitContext = {
 object:{id:string;name:string;number:string;address:Json;instructions:string|null;status:string};
 order:{id:string;number:string;start:string|null;end:string|null;status:string;service:string}|null;
 nodes:Array<{id:string;name:string;parentId:string|null;kind:string}>;
 customer:boolean;manager:boolean;userId:string;instructions:Array<Row<"object_records">&{read:boolean}>;requests:VisitRequest[];
};
