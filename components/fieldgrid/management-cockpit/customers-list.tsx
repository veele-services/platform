"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Eye,Pencil,Plus} from 'lucide-react';
import type {TenantContext} from '@/lib/auth/context';
import {hasManagementPermission} from '@/lib/management/model';
import {customerStates,customerTypes,type Owner} from '@/lib/customers/model';
import {addressLine,type Row} from '@/lib/objects/model';
import type {EntityDetail,CustomerCards} from '@/lib/management-cockpit/entities';
import {customerCommand} from '@/app/(workspace)/app/klanten/actions';
import {EntityActionsMenu} from './entity-actions';
import {CustomerWizard} from '@/components/fieldgrid/customers/forms';
import {Badge,Button,Empty,Field,PageHeading,Pagination,Table} from '@/components/fieldgrid/crm/ui';
import {EntityDetailDialog} from './entity-dialog';
import {EntityFilter} from './entity-filter';
import {managementRequest} from './request';
import {useCustomerCards} from './customers-store';
import {readListSizePreference,writeListSizePreference} from '../list-pagination';
export type {CustomerCards} from '@/lib/management-cockpit/entities';

/** Sites EntityPage customer table. The original native list, wizard and
 * lifecycle commands keep their existing source data and optimistic revisions. */
export function SitesCustomersList({data:initial,owners,tenant,defaultPaymentTermsDays,create=false}:{data:CustomerCards;owners:Owner[];tenant:TenantContext;defaultPaymentTermsDays:number;create?:boolean}){
 const router=useRouter();
 const[selected,setSelected]=useState<string|null>(null),[editor,setEditor]=useState<Row<'customers'>|'new'|null>(create&&hasManagementPermission(tenant,'backoffice.customers.write')&&hasManagementPermission(tenant,'backoffice.functions.customer_command')?'new':null),[pending,setPending]=useState(false),[error,setError]=useState('');
 const writable=hasManagementPermission(tenant,'backoffice.customers.write')&&hasManagementPermission(tenant,'backoffice.functions.customer_command');
 const forbidden=useCallback(()=>{setSelected(null);setEditor(null);setError('Dit dossier is niet beschikbaar binnen je actuele rechten.');router.refresh()},[router]);
 const store=useCustomerCards(initial,forbidden),data=store.data,filters=store.filters;
 const preferenceKey=`backoffice:${tenant.id}:customers`,preferenceLoaded=useRef('');
 useEffect(()=>{
  if(preferenceLoaded.current===preferenceKey)return;
  preferenceLoaded.current=preferenceKey;
  const preferred=readListSizePreference(preferenceKey);
  if(preferred!==null&&preferred!==filters.pageSize&&!new URLSearchParams(window.location.search).has('pageSize'))store.update('pageSize',String(preferred));
 },[preferenceKey,filters.pageSize,store]);
 const edit=(detail:EntityDetail)=>{if(detail.access.edit&&detail.profile.editing){setSelected(null);setEditor(detail.profile.editing as Row<'customers'>)}};
 const editId=async(id:string)=>{setPending(true);setError('');try{const detail=await managementRequest<EntityDetail>('/api/management-entities?'+new URLSearchParams({kind:'customer',id}));if(!detail.access.edit||!detail.profile.editing){forbidden();return}edit(detail)}catch(e){setError(e instanceof Error?e.message:'Het dossier kon niet worden geladen.');router.refresh()}finally{setPending(false)}};

 const active=Object.entries(filters).some(([k,v])=>!['page','pageSize','sort'].includes(k)&&!!v);
 const remove=async(row:Pick<CustomerCards['rows'][number],'id'|'version'>,archive:boolean)=>{if(!confirm(archive?'Deze klant archiveren? Alle historie blijft behouden.':'Deze ongebruikte klant verwijderen? Bij gekoppelde gegevens moet je archiveren.'))return;setPending(true);setError('');try{const r=await customerCommand(archive?'customer_archive':'customer_delete',{id:row.id,version:row.version},crypto.randomUUID());if(!r.ok)setError(r.error);else{router.refresh();void store.refresh().catch(e=>setError(e.message))}}catch(e){setError(e instanceof Error?e.message:'De wijziging kon niet worden bevestigd. Vernieuw de gegevens voor je opnieuw probeert.')}finally{setPending(false)}};
 if(!data)return <><PageHeading eyebrow="RELATIES" title="Klanten"/><p role="alert" className="gov-error">{error||store.error||'Deze klantenlijst is niet beschikbaar binnen je actuele rechten.'}</p></>;
 return <>
 <PageHeading eyebrow="RELATIES" title="Klanten" help="Zoek, filter en beheer alle klantrelaties binnen deze tenant." actions={<><EntityFilter active={active}>
  <Field label="Zoeken"><input onChange={e=>store.update(e.currentTarget.name,e.currentTarget.value)} name="q" placeholder="Zoeken…" value={filters.q}/></Field>
  <Field label="Status"><select onChange={e=>store.update(e.currentTarget.name,e.currentTarget.value)} name="status" value={filters.status}><option value="">Alle statussen</option>{Object.entries(customerStates).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></Field>
  <Field label="Sortering"><select onChange={e=>store.update(e.currentTarget.name,e.currentTarget.value)} name="sort" value={filters.sort}>{[['name','Naam A–Z'],['name_desc','Naam Z–A'],['number','Klantnummer'],['city','Plaats'],['status','Status'],['next_visit','Eerstvolgende afspraak'],['attention','Aandacht eerst']].map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></Field>
  <details><summary>Meer filters</summary><div className="mc-form-grid">
  <Field label="Type"><select onChange={e=>store.update(e.currentTarget.name,e.currentTarget.value)} name="type" value={filters.type}><option value="">Alle typen</option>{Object.entries(customerTypes).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></Field>
  <Field label="Plaats"><input onChange={e=>store.update(e.currentTarget.name,e.currentTarget.value)} name="city" value={filters.city}/></Field>
  <Field label="Verantwoordelijke"><select onChange={e=>store.update(e.currentTarget.name,e.currentTarget.value)} name="owner" value={filters.owner}><option value="">Iedereen</option>{owners.map(o=><option value={o.id} key={o.id}>{o.label}</option>)}</select></Field>
  <Field label="Dienst"><input onChange={e=>store.update(e.currentTarget.name,e.currentTarget.value)} name="service" value={filters.service}/></Field>
  <Field label="Aandacht / selectie"><select onChange={e=>store.update(e.currentTarget.name,e.currentTarget.value)} name="attention" value={filters.attention}><option value="">Alle klanten</option><option value="objects">Met actieve objecten</option><option value="requests">Open aanvragen</option><option value="commercial">Commerciële deadline</option><option value="actions">Open opvolgacties</option>{data.finance&&<option value="finance">Openstaande facturen</option>}</select></Field>
  <Field label="Resultaten per pagina"><select onChange={e=>{writeListSizePreference(preferenceKey,Number(e.currentTarget.value));store.update(e.currentTarget.name,e.currentTarget.value)}} name="pageSize" value={filters.pageSize}>{[10,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}</select></Field>
  </div></details><Button onClick={store.reset}>Filters wissen</Button>
 </EntityFilter><button type="button" title="Nieuwe klant" aria-label="Nieuwe klant" className="fg-action-icon primary-button" disabled={!writable||pending||!store.isCurrent} onClick={()=>setEditor('new')}><Plus size={18}/></button></>}/>
 {(error||store.error)&&<p className="gov-error" role="alert">{error||store.error}</p>}{!store.isCurrent&&<p className="mc-muted" role="status">Lijst bijwerken…</p>}
 <Table headers={['Klant','Klantnummer','Contact','Factuuradres','Objecten','Status','Acties']}>{data.rows.map(c=><tr key={c.id}><td><button className="ed-record" disabled={!store.isCurrent} onClick={()=>setSelected(c.id)}>{c.name}</button></td><td>{c.customer_number}</td><td>{c.contact||'Niet vastgelegd'}<small>{c.email||''}</small></td><td>{addressLine(c.address)||'Niet vastgelegd'}</td><td title="Actieve objecten">{c.objects}</td><td><Badge tone={c.status==='active'?'success':'neutral'}>{customerStates[c.status]||c.status}</Badge></td><td><div className="ed-row-actions"><button type="button" title={`Bekijk ${c.name}`} aria-label={`Bekijk ${c.name}`} className="fg-action-icon" disabled={!store.isCurrent} onClick={()=>setSelected(c.id)}><Eye size={15}/></button><button type="button" title={`Bewerk ${c.name}`} aria-label={`Bewerk ${c.name}`} className="fg-action-icon" disabled={!writable||pending||!store.isCurrent} onClick={()=>void editId(c.id)}><Pencil size={15}/></button></div></td></tr>)}</Table>
 {!data.rows.length&&<Empty title={active?'Geen klanten voor deze selectie':'Nog geen klanten'} text={active?'Pas de filters aan of wis je zoekopdracht.':'Gebruik de plusknop bovenaan om de eerste klant toe te voegen.'}/>}
 <Pagination count={data.total} page={data.page} size={data.pageSize} setPage={p=>store.update('page',String(p))}/>
 {selected&&<EntityDetailDialog key={selected} kind="customer" id={selected} returnTo={'/app/klanten?'+new URLSearchParams(Object.entries(filters).map(([key,value])=>[key,String(value)]))} onClose={()=>setSelected(null)} onEdit={edit} onForbidden={forbidden} lifecycle={detail=><>{writable&&detail.access.edit&&<EntityActionsMenu name={detail.profile.name}><Link prefetch={false} href={'/app/klanten/'+detail.profile.id}>Volledig dossier</Link><Link prefetch={false} href={'/app/klanten/'+detail.profile.id+'?tab=contracten'}>Contracten & diensten</Link><Link prefetch={false} href={'/app/klanten/'+detail.profile.id+'?tab=facturen'}>Facturen & betalingen</Link>{tenant.roles.some(r=>['tenant_admin','management'].includes(r))&&<><button disabled={pending||detail.profile.status==='archived'} onClick={()=>void remove(detail.profile,true)}>Archiveren</button><button disabled={pending} onClick={()=>void remove(detail.profile,false)}>Ongebruikte klant verwijderen</button></>}</EntityActionsMenu>}</>}/>}
 {editor&&<CustomerWizard presentation="sites" tenant={tenant} owners={owners} defaultPaymentTermsDays={defaultPaymentTermsDays} customer={editor==='new'?undefined:editor} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);router.refresh();void store.refresh().catch(e=>setError(e.message))}}/>}
 </>;
}
