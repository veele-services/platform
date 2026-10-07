/** Reference only. No Fieldgrid API fields, network calls or persistence.
 * Call after schema + semantic validation. Rules must be verified against the
 * actual destination model. Arrays are atomic: accept the whole answer or fall
 * back to extra notes. Source values are never removed until mapping succeeds.
 */
import { readFileSync } from 'node:fs';
const labels=JSON.parse(readFileSync(new URL('./field-labels.json',import.meta.url),'utf8'));
const metadataKeys=['schemaVersion','mode','inquiryId','createdAt','locale','source'];
const forbiddenNative=new Set(['/inquiry/message']);
const enumLabels={
 cleaning:'Schoonmaak',security:'Beveiliging',facilities:'Facilitaire diensten',
 office:'Kantoor',vve:'VvE of wooncomplex',shop:'Winkel',hospitality:'Horeca',event:'Evenement',home:'Woning',other:'Anders',
 common_areas:'VvE’s, portieken en flats',home_handover:'Woningen en oplevering',glass:'Glasbewassing',periodic_floor:'Periodieke vloerbehandeling',
 object:'Objectbeveiliging',mobile_patrol:'Mobiele surveillance',event_security:'Evenementenbeveiliging',retail:'Winkelsurveillance',reception:'Receptiediensten',personal_protection:'Persoonsbeveiliging',chauffeur:'Chauffeursdiensten',
 hospitality_support:'Horecaondersteuning',event_staff:'Evenementenmedewerkers',bar:'Bardiensten',guest_reception:'Gastontvangst',setup_breakdown:'Op- en afbouw',catering_support:'Cateringondersteuning',toilet_cleaning:'Toiletschoonmaak',
 once:'Eenmalig',recurring:'Terugkerend',discuss:'In overleg',daily:'Dagelijks',weekly:'Wekelijks',fortnightly:'Tweewekelijks',monthly:'Maandelijks',quarterly:'Per kwartaal',seasonal:'Seizoensgebonden',
 monday:'Maandag',tuesday:'Dinsdag',wednesday:'Woensdag',thursday:'Donderdag',friday:'Vrijdag',saturday:'Zaterdag',sunday:'Zondag',daytime:'Overdag',evening:'Avond',night:'Nacht',flexible:'Bespreekbaar',
 ground_level:'Begane grond',upper_floors:'Hogere verdiepingen',mixed:'Verschillende hoogtes',unknown:'Onbekend',
 workspaces:'Werkplekken',meeting_rooms:'Vergaderruimtes',entrance:'Entree',stairs:'Trappen',lifts:'Liften',galleries:'Galerijen',kitchen:'Keuken',toilets:'Toiletten',storage:'Opslag',waste_area:'Afvalruimte',access_control:'Toegangscontrole',patrol:'Rondes',visitor_guidance:'Bezoekersbegeleiding',email:'E-mail',phone:'Telefoon'
};
const enumPaths=new Set(['/inquiry/services','/inquiry/location/type','/inquiry/planning/type','/inquiry/planning/cadence','/inquiry/planning/preferredDays','/inquiry/planning/timePreference','/inquiry/contact/preferredChannel']);
const isEnumPath=p=>enumPaths.has(p)||/^\/inquiry\/tasks\/[^/]+\/(requestedTasks|spaces|coverage|glassAccess)$/.test(p);
const escapePointer=k=>k.replaceAll('~','~0').replaceAll('/','~1');
const clone=value=>structuredClone(value);
function leaves(value,path='',result=new Map()){
 if(value===undefined||value===null||value==='')return result;
 if(Array.isArray(value)){if(value.length)result.set(path,clone(value));}
 else if(typeof value==='object'){for(const[k,v]of Object.entries(value))leaves(v,path+'/'+escapePointer(k),result);}
 else result.set(path,value);
 return result;
}
function enumText(value){return typeof value==='string'&&enumLabels[value]?`${enumLabels[value]} (${value})`:String(value);}
function display(path,value){
 if(typeof value==='boolean')return value?'Ja (aangevinkt)':'Nee (niet aangevinkt)';
 if(isEnumPath(path))return Array.isArray(value)?value.map(enumText).join(', '):enumText(value);
 if(Array.isArray(value)||typeof value==='object')return JSON.stringify(value,null,2);
 return String(value);
}
export class NotesCapacityError extends Error{
 constructor(length,maximum){super(`Extra opmerkingen bevatten ${length} tekens; doelcapaciteit is ${maximum}. Geen gegevens opgeslagen of afgekapt.`);this.name='NotesCapacityError';this.length=length;this.maximum=maximum;}
}
/** rule = {verified:true,sources:[JSONPointer...],target:'ACTUAL_VERIFIED_FIELD',
 * convert(valuesBySourcePath): {accepted:true,value:any}|{accepted:false}}
 * `target` remains a literal identifier, never assigned through object paths.
 * Compound rules can consume e.g. street + houseNumber into one address field.
 * A rule must preserve every listed source value fully. Missing sources skip it.
 */
export function mapInquiry(envelope,{rules=[],existingNotes='',maxNotesCharacters=null}={}){
 if(!envelope?.inquiry||envelope.inquiry.mode!=='submission'||!envelope.wizardAnswers)throw new Error('Verwacht een gevalideerde submission-envelop.');
 if(typeof existingNotes!=='string')throw new Error('Bestaande opmerkingen moeten tekst zijn.');
 if(maxNotesCharacters!==null&&(!Number.isInteger(maxNotesCharacters)||maxNotesCharacters<1))throw new Error('Ongeldige opmerkingenlimiet.');
 const metadata={envelopeVersion:envelope.envelopeVersion};
 const working=clone(envelope);
 for(const key of metadataKeys){metadata[key]=working.inquiry[key];delete working.inquiry[key];}
 delete working.envelopeVersion;
 const answers=leaves(working),consumed=new Set(),targets=new Set(),nativeAssignments=[],mappingFallbacks=[];
 for(const rule of rules){
  if(rule.verified!==true||!Array.isArray(rule.sources)||!rule.sources.length||new Set(rule.sources).size!==rule.sources.length||typeof rule.target!=='string'||!rule.target||typeof rule.convert!=='function')throw new Error('Alle mappingregels vereisen expliciete verificatie, bronpaden, doel en conversie.');
  if(rule.sources.some(p=>forbiddenNative.has(p)))throw new Error('Algemene vrije opmerkingen horen in extraNotes; overschrijf die niet via een aparte regel.');
  if(rule.sources.some(p=>!answers.has(p)))continue;
  if(rule.sources.some(p=>consumed.has(p)))throw new Error('Bronpad wordt meer dan eenmaal native gekoppeld.');
  let mapped;
  try{mapped=rule.convert(Object.fromEntries(rule.sources.map(p=>[p,clone(answers.get(p))])));}
  catch{mappingFallbacks.push({sources:[...rule.sources],reason:'conversion_failed'});continue;}
  if(mapped?.accepted!==true||mapped.value===undefined||mapped.value===null||mapped.value===''||(Array.isArray(mapped.value)&&mapped.value.length===0)){
   mappingFallbacks.push({sources:[...rule.sources],reason:'not_fully_supported'});continue;
  }
  if(targets.has(rule.target))throw new Error('Meerdere regels schrijven hetzelfde doel. Gebruik één samengestelde regel.');
  nativeAssignments.push({target:rule.target,value:clone(mapped.value),sourcePaths:[...rule.sources]});
  targets.add(rule.target);rule.sources.forEach(p=>consumed.add(p));
 }
 const extraEntries=[...answers].filter(([p])=>!consumed.has(p)).map(([path,value])=>({path,label:labels[path]||`Aanvullend gegeven ${path}`,value}));
 const block=extraEntries.length?'Aanvraag via de Veele-website\n\n'+extraEntries.map(e=>`${e.label}: ${display(e.path,e.value)}`).join('\n'):'';
 const extraNotes=[existingNotes,block].filter(v=>v!=='').join('\n\n');
 if(maxNotesCharacters!==null&&[...extraNotes].length>maxNotesCharacters)throw new NotesCapacityError([...extraNotes].length,maxNotesCharacters);
 return{metadata,nativeAssignments,extraNotes,extraEntries,mappingFallbacks,coverage:{totalAnswers:answers.size,nativeAnswers:consumed.size,extraAnswers:extraEntries.length}};
}
