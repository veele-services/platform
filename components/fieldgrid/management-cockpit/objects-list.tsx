"use client";
import {useCallback,useMemo,useState,useTransition,type ComponentProps} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Eye,Pencil,Plus} from 'lucide-react';
import type {ObjectList} from '@/components/fieldgrid/objects/list';
import {ObjectWizard} from '@/components/fieldgrid/objects/forms';
import {archiveObjectDossier} from '@/app/(workspace)/app/objecten/actions';
import {hasManagementPermission} from '@/lib/management/model';
import {addressLine,objectStates,objectTypes,valuesOf,type Row} from '@/lib/objects/model';
import type {EntityDetail} from '@/lib/management-cockpit/entities';
import {EntityActionsMenu} from './entity-actions';
import {Badge,Button,Empty,Field,PageHeading,Pagination,Table} from '@/components/fieldgrid/crm/ui';
import {EntityFilter} from './entity-filter';
import {EntityDetailDialog} from './entity-dialog';
import {managementRequest} from './request';
type Props=ComponentProps<typeof ObjectList>&{canWork:boolean};
export function SitesObjectsList({tenant,objects,customers,orders,records,requests,initialCustomer,create,canWork}:Props){
 const router=useRouter(),[pending,start]=useTransition(),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const writable=hasManagementPermission(tenant,'backoffice.objects.write')&&hasManagementPermission(tenant,'backoffice.functions.save_object_dossier');
 const[query,setQuery]=useState(''),[customer,setCustomer]=useState(initialCustomer),[status,setStatus]=useState(''),[sort,setSort]=useState('name'),[type,setType]=useState(''),[city,setCity]=useState(''),[service,setService]=useState(''),[attention,setAttention]=useState(''),[page,setPage]=useState(1),[size,setSize]=useState(25),[selected,setSelected]=useState<string|null>(null),[editor,setEditor]=useState<Row<'objects'>|'new'|null>(create&&writable?'new':null);
 const customerById=useMemo(()=>new Map(customers.map(c=>[c.id,c])),[customers]);
 const metadata=useMemo(()=>{
  const result=new Map<string,{services:Set<string>;quality:boolean;request:boolean;count:number}>();
  const get=(id:string)=>{let m=result.get(id);if(!m){m={services:new Set(),quality:false,request:false,count:0};result.set(id,m)}return m};
  for(const w of orders){const m=get(w.object_id);m.count++;if(w.discipline)m.services.add(w.discipline)}
  for(const r of records){const m=get(r.object_id);if(r.service)m.services.add(r.service);if(r.kind==='quality'&&['open','progress'].includes(r.state))m.quality=true}
  for(const r of requests)get(r.object_id).request=true;
  return result;
 },[orders,records,requests]);
 const serviceNames=[...new Set([...metadata.values()].flatMap(m=>[...m.services]))].sort();
 const rows=useMemo(()=>objects.filter(o=>{
  const m=metadata.get(o.id);
  return(!customer||o.customer_id===customer)&&(!status||o.dossier_status===status)&&(!type||o.object_type===type)&&(!city||String(valuesOf(o.address).city||'')===city)&&(!service||m?.services.has(service))&&(!attention||(attention==='quality'?m?.quality:m?.request))&&[o.name,o.object_number,addressLine(o.address),customerById.get(o.customer_id)?.name].some(v=>v?.toLocaleLowerCase('nl-NL').includes(query.toLocaleLowerCase('nl-NL')));
 }).sort((a,b)=>{const field=sort.replace(/-desc$/,'');const value=(o:Row<'objects'>)=>field==='number'?o.object_number:field==='customer'?customerById.get(o.customer_id)?.name||'':o.name;return value(a).localeCompare(value(b),'nl')*(sort.endsWith('-desc')?-1:1)||a.id.localeCompare(b.id)}),[objects,customer,status,type,city,service,attention,metadata,customerById,query,sort]);
 const current=Math.min(page,Math.max(1,Math.ceil(rows.length/size))),active=!![query,customer,status,type,city,service,attention].find(Boolean),canCreate=customers.some(c=>!['inactive','archived','draft'].includes(c.status));
 const change=(set:(value:string)=>void,value:string)=>{set(value);setPage(1)};
 const reset=()=>{setQuery('');setCustomer('');setStatus('');setType('');setCity('');setService('');setAttention('');setPage(1)};
 const forbidden=useCallback(()=>{setSelected(null);setEditor(null);setError('Dit object is niet beschikbaar binnen je actuele rechten.');router.refresh()},[router]);
 const edit=(detail:EntityDetail)=>{if(detail.access.edit&&detail.profile.editing){setSelected(null);setEditor(detail.profile.editing as Row<'objects'>)}};
 const editId=async(id:string)=>{setLoading(true);setError('');try{edit(await managementRequest<EntityDetail>('/api/management-entities?'+new URLSearchParams({kind:'object',id})))}catch(e){setError(e instanceof Error?e.message:'Het object kon niet worden geladen.');router.refresh()}finally{setLoading(false)}};
 const archive=(detail:EntityDetail)=>{if(!confirm('Object archiveren? Alle gekoppelde uitvoering en historie blijft bewaard.'))return;const form=new FormData();form.set('id',detail.profile.id);form.set('version',String(detail.profile.version));start(async()=>{try{const result=await archiveObjectDossier(form);if(!result.ok){setError(result.error);return}setSelected(null);router.refresh()}catch(e){setError(e instanceof Error?e.message:'Archiveren kon niet worden bevestigd.')}})};
 const filter=(label:string,value:string,set:(value:string)=>void,options:Array<[string,string]>)=><Field label={label}><select value={value} onChange={e=>change(set,e.target.value)}><option value="">Alle {label.toLocaleLowerCase('nl-NL')}</option>{options.map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></Field>;
 return <>
 <PageHeading eyebrow="LOCATIES" title="Objecten" help="Uitvoeringslocaties, altijd gekoppeld aan een bestaande klant." actions={<><EntityFilter active={active}><Field label="Zoeken"><input placeholder="Zoeken…" value={query} onChange={e=>change(setQuery,e.target.value)}/></Field>{filter('Status',status,setStatus,Object.entries(objectStates))}<Field label="Sortering"><select value={sort} onChange={e=>change(setSort,e.target.value)}>{[['name','Naam A–Z'],['name-desc','Naam Z–A'],['number','Objectnummer oplopend'],['number-desc','Objectnummer aflopend'],['customer','Klant A–Z'],['customer-desc','Klant Z–A']].map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></Field><details><summary>Meer filters</summary><div className="mc-form-grid">{filter('Klant',customer,setCustomer,customers.map(c=>[c.id,c.name]))}{filter('Type',type,setType,Object.entries(objectTypes))}{filter('Plaats',city,setCity,[...new Set(objects.map(o=>String(valuesOf(o.address).city||'')))].filter(Boolean).sort().map(c=>[c,c]))}{filter('Dienst',service,setService,serviceNames.map(s=>[s,s]))}{filter('Aandacht',attention,setAttention,[['quality','Kwaliteitsmelding'],['request','Verzoek beoordelen']])}<Field label="Resultaten per pagina"><select value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1)}}>{[10,25,50,100].map(n=><option value={n} key={n}>{n}</option>)}</select></Field></div></details><Button onClick={reset}>Filters wissen</Button></EntityFilter><button type="button" title={canCreate?'Nieuw object':'Geen actieve klantkeuze beschikbaar'} aria-label="Nieuw object" className="fg-action-icon primary-button" disabled={!writable||!canCreate||pending||loading} onClick={()=>setEditor('new')}><Plus size={18}/></button></>}/>
 {error&&<p className="gov-error" role="alert">{error}</p>}
 <Table headers={['Object','Objectnummer','Klant','Adres','Werkbonnen','Status','Acties']}>{rows.slice((current-1)*size,current*size).map(o=><tr key={o.id}><td><button className="ed-record" disabled={pending||loading} onClick={()=>setSelected(o.id)}>{o.name}</button></td><td>{o.object_number}</td><td>{customerById.get(o.customer_id)?.name||'Afgeschermde klant'}</td><td>{addressLine(o.address)||'Niet vastgelegd'}</td><td>{canWork?metadata.get(o.id)?.count||0:'—'}</td><td><Badge tone={o.dossier_status==='active'?'success':'neutral'}>{objectStates[o.dossier_status as keyof typeof objectStates]||o.dossier_status}</Badge></td><td><div className="ed-row-actions"><button type="button" className="fg-action-icon" title={`Bekijk ${o.name}`} aria-label={`Bekijk ${o.name}`} disabled={pending||loading} onClick={()=>setSelected(o.id)}><Eye size={15}/></button><button type="button" className="fg-action-icon" title={`Bewerk ${o.name}`} aria-label={`Bewerk ${o.name}`} disabled={!writable||pending||loading} onClick={()=>void editId(o.id)}><Pencil size={15}/></button></div></td></tr>)}</Table>
 {!rows.length&&<Empty title={active?'Geen objecten voor deze selectie':'Nog geen objecten'} text={active?'Pas de filters aan of wis je zoekopdracht.':canCreate?'Gebruik de plusknop bovenaan om het eerste object toe te voegen.':'Voeg eerst een actieve klant toe om een object te kunnen koppelen.'}/>}
 <Pagination count={rows.length} page={current} size={size} setPage={setPage}/>
 {selected&&<EntityDetailDialog key={selected} kind="object" id={selected} onClose={()=>setSelected(null)} onEdit={edit} onForbidden={forbidden} lifecycle={detail=><EntityActionsMenu name={detail.profile.name}><Link prefetch={false} href={'/app/objecten/'+detail.profile.id+'?tab=afspraken'}>Afspraken bekijken</Link><Link prefetch={false} href={'/app/objecten/'+detail.profile.id+'?tab=tijdlijn'}>Tijdlijn</Link>{detail.access.edit&&<button disabled={pending||detail.profile.status==='archived'} onClick={()=>archive(detail)}>Archiveren</button>}</EntityActionsMenu>}/>}
 {editor&&<ObjectWizard presentation="sites" tenant={tenant} customers={customers} customerId={customer} object={editor==='new'?undefined:editor} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);router.refresh()}}/>}
 </>;
}
