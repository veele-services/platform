import {z} from 'zod';
const id=z.uuid(),count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const reportQuerySchema=z.object({tab:z.enum(['overview','archive']).default('overview'),record:id.optional(),page:z.coerce.number().int().positive().max(100000).default(1),pageSize:z.coerce.number().int().min(5).max(100).default(20)}).strict();
export const reportAudiences=['Management','Eigenaar','Kwaliteitsbeheer','Financieel beheer'] as const;
export const reportDays=['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'] as const;
export const reportScheduleSchema=z.object({enabled:z.boolean(),day:z.number().int().min(1).max(7),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),audience:z.enum(reportAudiences),revision:count});
const stats=z.object({today:z.iso.date(),open:count,overdue:count,sla:z.number().int().min(0).max(100).nullable(),slaTotal:count,confirmed:count,review:count,unpaid:count,compliance:count,decisions:count,finance:z.boolean(),quality:z.boolean()});
export const reportSnapshotSchema=stats.extend({id,period:z.string(),version:z.number().int().positive(),role:z.string(),createdAt:z.string(),comment:z.string(),tenant:z.string(),brand:z.string().regex(/^#[0-9a-f]{6}$/i),accent:z.string().regex(/^#[0-9a-f]{6}$/i),date:z.iso.date()});
export const reportsStateSchema=z.object({rows:z.array(reportSnapshotSchema).max(100),total:count,page:z.number().int().positive(),pageSize:z.number().int().positive(),selected:reportSnapshotSchema.nullable(),stats,role:z.string(),isOwner:z.boolean(),canCreate:z.boolean(),schedule:reportScheduleSchema.extend({nextRunAt:z.string().nullable()})});
export const reportCommandSchema=z.discriminatedUnion('command',[
 z.object({command:z.literal('create'),input:z.object({period:z.string().trim().min(1).max(160),comment:z.string().trim().max(10000)}).strict(),requestId:id}).strict(),
 z.object({command:z.literal('schedule'),input:reportScheduleSchema.strict(),requestId:id}).strict(),
]);
export type ReportQuery=z.infer<typeof reportQuerySchema>;
export type ReportCommand=z.infer<typeof reportCommandSchema>;
export type ReportSnapshot=z.infer<typeof reportSnapshotSchema>;
export type ReportsState=z.infer<typeof reportsStateSchema>;
export const reportDate=(value:string)=>new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
export const reportMoney=(cents:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2}).format(cents/100);
export const slaLabel=(value:number|null)=>value===null?'—':value+'%';
/** Frozen inclusion flags are part of the server-authorized immutable snapshot. */
export function reportRows(r:ReportSnapshot):Array<[string,string,string]>{return[
 ['Open acties',String(r.open),'Actieve, geautoriseerde acties; uitgestelde acties tellen pas op de hervatdatum mee.'],
 ['Achterstallige acties',String(r.overdue),'Open acties met een uiterste datum vóór de peildatum.'],
 ['SLA op koers',slaLabel(r.sla),r.slaTotal?'Aandeel serviceafspraken met status Op koers.':'Er zijn geen serviceafspraken binnen dit toegangsprofiel.'],
 ...(r.finance?[
 ['Bevestigd nog te factureren',reportMoney(r.confirmed),'Goedgekeurde factureerbare restwaarde uit gekoppelde bronregels.'],
 ['Financieel te controleren',reportMoney(r.review),'Waarde voor beoordeling; geen bevestigde factureerbare omzet.'],
 ['Gefactureerd, nog onbetaald',reportMoney(r.unpaid),'Openstaand gefactureerd bedrag; apart van nog te factureren.'],
 ] as Array<[string,string,string]>:[]),
 ...(r.quality?[['Documenten met aandacht',String(r.compliance),'Eisen met ontbrekend, verlopend of opnieuw te beoordelen bewijs.']] as Array<[string,string,string]>:[]),
 ['Vastgestelde besluiten',String(r.decisions),'Besluiten die binnen de rechten van de rapportmaker vallen.'],
]}
