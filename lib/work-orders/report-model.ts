export type SignaturePolicy = { mode: "none" | "optional" | "required"; source: string; employeeRequired: boolean };
export type ReportSnapshot = {
  schema: 1; number: string; title: string; summary: string;
  tenant: { name: string; primaryColor: string; accentColor: string };
  customer: { name: string }; object: { name: string; address: Record<string, unknown> };
  executionDate: string | null; endedAt: string | null; timezone: string;
  tasks: Array<{ id: string; code: string; name: string; quantity: number; unit: string; executedQuantity: number; result: string; transferredQuantity: number; withdrawnQuantity: number; extraWork: boolean }>;
  notes: Array<{ id: string; body: string }>;
  checklists?:Array<{name:string;version:number;question:string;unit:string;type:string;value:unknown;notApplicable:boolean;reason:string|null;answerVersion:number;attachmentId:string|null}>;
  materials?:Array<{description:string;quantity:number;unit:string;taskId:string|null}>;
  attachments: Array<{ id: string; name: string; mime: string; sha256: string }>;
};
export type ReportSignature = { id: string; name: string; capacity: string; capturedBy: string | null; signedAt: string; channel: string; kind: "customer" | "employee" };
export type ReportVersion = { id: string; version: number; state: string; snapshot: ReportSnapshot; contentHash: string; projection?: "original" | "own_contribution" | "customer_copy"; employeeVerified?: boolean; policy: SignaturePolicy; createdAt: string; approvedAt: string | null; signatures: ReportSignature[]; waiver: { reason: string; at: string } | null };
export type WorkOrderReport = { orderId: string; orderVersion: number; number: string; state: string; policy: SignaturePolicy; canReview: boolean; canSubmit: boolean; canCapture: boolean; canWaive?: boolean; canEditPolicy?:boolean;configuredMode?:"inherit"|SignaturePolicy["mode"];employeeSignatureRequired?:boolean; legacy: boolean; checklists:import("./model").ChecklistInstance[]; versions: ReportVersion[]; historicalSignatures: Array<{ id: string; name: string; version: number; signedAt: string }> };
export const reportStateLabels: Record<string,string> = {draft:"Concept",waiting_signature:"Wacht op handtekening",review:"Ter controle",correction:"Correctie gevraagd",approved:"Goedgekeurd",superseded:"Vervangen door nieuwe versie"};
export const signatureModeLabels = { none:"Niet nodig",optional:"Optioneel",required:"Verplicht" };
export const signatureSourceLabels: Record<string,string> = {work_order:"Werkbon",object:"Object 360",template:"Werkbontemplate",tenant:"Tenantstandaard",historical:"Bestaande afspraak"};

/** The same customer-facing text is used by the preview and PDF. Explicit fields
 * prevent financial, HR or internal data from leaking through future additions. */
export function reportDocumentLines(report: ReportVersion): string[] {
  const s=report.snapshot;
  const lines=[s.tenant.name,`Werkbon ${s.number} · rapportversie ${report.version}`,s.title,`Klant: ${s.customer.name}`,`Object: ${s.object.name}`];
  if(report.projection==="own_contribution")lines.push("Privacyweergave: opdrachtresultaten en je eigen bijdrage. De oorspronkelijke rapportversie en bewijsgegevens blijven ongewijzigd bewaard.");
  if(report.projection==="customer_copy")lines.push("Klantweergave. Interne personeelsgegevens en medewerkerhandtekeningen worden niet gedeeld.");
  const address=[s.object.address.street,s.object.address.postal_code,s.object.address.city].filter(x=>typeof x==="string"&&x).join(", ");
  if(address)lines.push(address);
  if(s.executionDate)lines.push(`Uitvoering: ${new Intl.DateTimeFormat("nl-NL",{dateStyle:"long",timeZone:s.timezone}).format(new Date(s.executionDate))}`);
  lines.push("Samenvatting",s.summary,"Resultaten");
  for(const task of s.tasks){const state:Record<string,string>={completed:"Afgerond",partial:"Deels uitgevoerd",not_done:"Niet uitgevoerd",not_applicable:"Niet van toepassing",in_progress:"Bezig",planned:"Gepland"};lines.push(`${task.code} · ${task.name}: ${task.executedQuantity} van ${task.quantity} ${task.unit}${task.extraWork?" · meerwerk":""}${state[task.result]?` · ${state[task.result]}`:""}`);if(task.transferredQuantity)lines.push(`Overgedragen restwerk: ${task.transferredQuantity} ${task.unit}`);if(task.withdrawnQuantity)lines.push(`Ingetrokken: ${task.withdrawnQuantity} ${task.unit}`);}
  for(const note of s.notes)lines.push(note.body);
  for(const answer of s.checklists??[]){const value=answer.notApplicable?`Niet van toepassing: ${answer.reason}`:answer.type==="photo"?"Bewijsfoto bijgevoegd":answer.value===true?"Ja / gecontroleerd":answer.value===false?"Nee":String(answer.value??"");lines.push(`${answer.name} v${answer.version} · ${answer.question}: ${value}${answer.unit?` ${answer.unit}`:""}`);}
  if(s.materials?.length)lines.push("Materialen",...s.materials.map(m=>`${m.description}: ${m.quantity} ${m.unit}`));
  if(s.attachments.length)lines.push("Bijlagen",...s.attachments.map(a=>a.name));
  if(report.waiver)lines.push(`Klantondertekening vrijgesteld: ${report.waiver.reason}`);
  for(const sig of report.signatures){lines.push(`${sig.kind==="customer"?"Klant":"Medewerker"}: ${sig.name} · ${sig.capacity}`);if(sig.capturedBy)lines.push(`Vastgelegd door ${sig.capturedBy} in de personeelsapp op locatie`);lines.push(new Intl.DateTimeFormat("nl-NL",{dateStyle:"short",timeStyle:"short",timeZone:s.timezone}).format(new Date(sig.signedAt)));}
  if(!report.signatures.length&&!report.waiver)lines.push(report.policy.mode==="required"?"Wacht op handtekening — vast te leggen in de personeelsapp":"Geen klantondertekening vastgelegd");
  if(report.employeeVerified&&!report.signatures.some(signature=>signature.kind==="employee"))lines.push("Medewerkerondertekening is vastgelegd; persoonlijke bewijsgegevens zijn afgeschermd.");
  else if(report.policy.employeeRequired&&!report.signatures.some(signature=>signature.kind==="employee"))lines.push("Wacht op de afzonderlijke medewerkerondertekening in de personeelsapp");
  return lines;
}
