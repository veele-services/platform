// Website-owned contract 1.0.0; server validates before the existing Fieldgrid intake.
export const SCHEMA_VERSION='1.0.0';
export function createInquiryId(){if(crypto.randomUUID)return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');}
export const SERVICE_IDS={schoonmaak:'cleaning',beveiliging:'security',facilitair:'facilities'};
export const SERVICE_LABELS={cleaning:'Schoonmaak',security:'Beveiliging',facilities:'Facilitaire diensten'};
const LOCATIONS={'Kantoor of bedrijfspand':'office','VvE of wooncomplex':'vve','Winkel':'shop','Horeca':'hospitality','Evenement':'event','Woning':'home','Anders':'other'};
const TASKS={schoonmaak:{'Kantoorschoonmaak':'office','VvE’s, portieken en flats':'common_areas','Winkels':'shop','Woningen en oplevering':'home_handover','Horecaschoonmaak':'hospitality','Glasbewassing':'glass'},beveiliging:{'Objectbeveiliging':'object','Mobiele surveillance':'mobile_patrol','Evenementenbeveiliging':'event_security','Winkelsurveillance':'retail','Horecabeveiliging':'hospitality','Receptiediensten':'reception','Persoonsbeveiliging':'personal_protection','Chauffeursdiensten':'chauffeur'},facilitair:{'Horecaondersteuning':'hospitality_support','Evenementenmedewerkers':'event_staff','Bardiensten':'bar','Toiletschoonmaak':'toilet_cleaning'}};
const clean=v=>typeof v==='string'?v.trim():'';
const optional=(obj,key,value)=>{if(value!==undefined&&value!==null&&value!=='')obj[key]=value;};
export function buildInquiry(state,{mode='draft',inquiryId,createdAt}={}){
 if(!['draft','submission'].includes(mode))throw new Error('Onbekende aanvraagmodus');
 const services=[...new Set(state.services||[])];if(services.some(s=>!SERVICE_IDS[s]))throw new Error('Onbekende dienst');
 const result={schemaVersion:SCHEMA_VERSION,mode,inquiryId:inquiryId||createInquiryId(),createdAt:createdAt||new Date().toISOString(),locale:'nl-NL',source:'veele-website'};
 if(services.length)result.services=services.map(s=>SERVICE_IDS[s]);
 const location={country:'NL'};optional(location,'type',LOCATIONS[state.location_type]);optional(location,'city',clean(state.city));optional(location,'postalCode',clean(state.postal_code).toUpperCase().replace(/^([0-9]{4})\s*([A-Z]{2})$/,'$1 $2'));optional(location,'street',clean(state.address));optional(location,'houseNumber',clean(state.house_number));if(location.type==='other')optional(location,'otherType',clean(state.other_location));result.location=location;
 const tasks={};for(const service of services){const key=SERVICE_IDS[service],picked=(state.tasks?.[service]||[]).map(t=>TASKS[service][t]);if(picked.some(t=>!t))throw new Error('Onbekende werkzaamheid');const branch={requestedTasks:picked.length?[...new Set(picked)]:['discuss']};optional(branch,'notes',clean(state.details));if(service==='schoonmaak'&&clean(String(state.area_m2||'')))branch.areaM2=Number(state.area_m2);if(['beveiliging','facilitair'].includes(service)&&clean(String(state.visitors||'')))branch.expectedVisitors=Number(state.visitors);tasks[key]=branch;}if(services.length)result.tasks=tasks;
 const planning={timeZone:'Europe/Amsterdam'};const frequency=state.frequency;
 if(frequency==='Eenmalig')planning.type='once';else if(frequency==='In overleg')planning.type='discuss';else if(frequency){planning.type='recurring';planning.cadence=frequency==='Wekelijks'?'weekly':frequency==='Maandelijks'?'monthly':'discuss';}
 optional(planning,'startDate',clean(state.start_date));optional(planning,'endDate',clean(state.end_date));if(state.flexible)planning.timePreference='flexible';
 const notes=[];if(frequency==='Meerdere keren per week')notes.push('Gewenste frequentie: meerdere keren per week.');
 if(state.start_date&&state.start_time&&state.end_time){const window={date:state.start_date,startTime:state.start_time,endTime:state.end_time};optional(window,'endDate',clean(state.end_date));planning.windows=[window];}else{if(state.start_time)notes.push('Voorkeur vanaf '+state.start_time+'.');if(state.end_time)notes.push('Voorkeur tot '+state.end_time+'.');}
 if(notes.length)planning.notes=notes.join('\n');result.planning=planning;
 const contact={};optional(contact,'name',clean(state.contact_name));optional(contact,'organization',clean(state.organization));optional(contact,'email',clean(state.email));optional(contact,'phone',clean(state.phone));if(contact.email)contact.preferredChannel='email';else if(contact.phone)contact.preferredChannel='phone';if(Object.keys(contact).length)result.contact=contact;
 optional(result,'message',clean(state.notes));return result;
}
export function validateState(state,step){
 const errors=[];const add=(field,message)=>errors.push({field,message});const chosen=state.services||[];
 if(step===0&&(!chosen.length||chosen.some(s=>!SERVICE_IDS[s])))add('services','Kies minimaal één dienst.');
 if(step===1){if(!LOCATIONS[state.location_type])add('location_type','Kies het type locatie.');if(!clean(state.city))add('city','Vul de plaats van uw locatie in.');if(clean(state.city).length>100)add('city','Gebruik maximaal 100 tekens voor de plaats.');if(state.location_type==='Anders'&&!clean(state.other_location))add('other_location','Beschrijf het andere type locatie.');if(state.postal_code&&!/^[1-9][0-9]{3}\s?[A-Za-z]{2}$/.test(clean(state.postal_code)))add('postal_code','Gebruik een Nederlandse postcode, bijvoorbeeld 2583 HW.');}
 if(step===2){if(chosen.includes('schoonmaak')&&state.area_m2&&(!(Number(state.area_m2)>0)||Number(state.area_m2)>10000000))add('area_m2','Vul een positieve oppervlakte in.');if(chosen.some(s=>['beveiliging','facilitair'].includes(s))&&state.visitors&&(!Number.isInteger(Number(state.visitors))||Number(state.visitors)<1||Number(state.visitors)>1000000))add('visitors','Vul een positief, heel aantal bezoekers in.');}
 if(step===3){if(!['Eenmalig','Wekelijks','Meerdere keren per week','Maandelijks','In overleg'].includes(state.frequency))add('frequency','Kies de gewenste inzet.');if(state.end_date&&!state.start_date)add('start_date','Kies ook een startdatum.');if(state.start_date&&state.end_date&&state.end_date<state.start_date)add('end_date','De einddatum moet op of na de startdatum liggen.');if(state.start_date&&state.start_time&&state.end_time){const end=state.end_date||state.start_date;if((end+'T'+state.end_time)<=(state.start_date+'T'+state.start_time))add('end_date','Voor inzet na middernacht: kies een latere einddatum. De eindtijd moet na de begintijd liggen.');}}
 if(step===4){if(!clean(state.contact_name))add('contact_name','Vul uw naam in.');if(!clean(state.email)&&!clean(state.phone))add('email','Vul een e-mailadres of telefoonnummer in.');if(state.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(state.email)))add('email','Controleer uw e-mailadres.');if(state.phone&&!/^\+?[0-9][0-9 ()-]{5,23}[0-9]$/.test(clean(state.phone)))add('phone','Controleer uw telefoonnummer.');if(state.phone){const n=state.phone.replace(/\D/g,'').length;if(n<7||n>15)add('phone','Gebruik een telefoonnummer met 7 tot 15 cijfers.');}}
 const lengthLimits={1:{address:160,house_number:20,other_location:200},2:{details:1500},4:{contact_name:120,organization:160,email:254,notes:2000}};for(const[field,max]of Object.entries(lengthLimits[step]||{}))if(clean(state[field]).length>max)add(field,`Gebruik maximaal ${max} tekens.`);
 return errors;
}
const displayDate=v=>v?new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric'}).format(new Date(v+'T12:00:00')):'';
const displayPostcode=v=>clean(v).toUpperCase().replace(/^([0-9]{4})\s*([A-Z]{2})$/,'$1 $2');
export function summaryGroups(state){
 return [
 {title:'Diensten',step:0,lines:(state.services||[]).map(s=>SERVICE_LABELS[SERVICE_IDS[s]])},
 {title:'Locatie',step:1,lines:[state.location_type==='Anders'?state.other_location:state.location_type,[state.address,state.house_number].filter(Boolean).join(' '),[displayPostcode(state.postal_code),state.city].filter(Boolean).join(' ')].filter(Boolean)},
 {title:'Werkzaamheden',step:2,lines:[...(state.services||[]).map(s=>SERVICE_LABELS[SERVICE_IDS[s]]+': '+((state.tasks?.[s]||[]).join(', ')||'Samen bespreken')),...(state.services?.includes('schoonmaak')&&state.area_m2?['Oppervlakte: '+state.area_m2+' m²']:[]),...(state.services?.some(s=>['beveiliging','facilitair'].includes(s))&&state.visitors?['Verwachte bezoekers: '+state.visitors]:[]),state.details].filter(Boolean)},
 {title:'Planning',step:3,lines:[state.frequency,state.start_date?'Startdatum: '+displayDate(state.start_date):'Datum in overleg',state.end_date?'Einddatum: '+displayDate(state.end_date):'',[state.start_time?'Vanaf '+state.start_time:'',state.end_time?'tot '+state.end_time:''].filter(Boolean).join(' '),state.flexible?'De planning is bespreekbaar.':'Planning bespreekbaar: Nee (niet aangevinkt).'].filter(Boolean)},
 {title:'Contact',step:4,lines:[state.contact_name,state.organization,state.email,state.phone,state.notes].filter(Boolean)}
 ];
}
export function summaryText(state){return 'Aanvraag Veele Services\n\n'+summaryGroups(state).map(g=>g.title+'\n'+g.lines.join('\n')).join('\n\n')+'\n\nDeze aanvraag betreft gewenste inzet; werkzaamheden, beschikbaarheid en prijs worden persoonlijk afgestemd.';}
// Explicit submission only; no autosave, account creation or booking.
export const deliveryAdapter=Object.freeze({configured:true,async submit(envelope,{signal}={}){const response=await fetch('/api/veele-website/requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(envelope),signal,credentials:'same-origin'});return{httpOk:response.ok,...await response.json()};}});
