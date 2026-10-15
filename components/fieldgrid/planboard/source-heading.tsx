"use client";
import Link from 'next/link';
import {ChevronLeft,ChevronRight,Plus,Undo2} from 'lucide-react';
import type {TenantContext} from '@/lib/auth/context';
import {hasManagementPermission} from '@/lib/management/model';
import {executionStatuses,type PlanningQuery} from '@/lib/planning/model';
import {tenantToday} from '@/lib/planning/time';
import {Button,Field,PageHeading} from '../crm/ui';
import {EntityFilter} from '../management-cockpit/entity-filter';
type Appearance={from:string;to:string;zoom:'overview'|'wide'|'precise'};
/** Source date/filter/plus composition; the complete native viewport controls
 * remain available in the disclosure instead of replacing the operational board. */
export function SourcePlanboardHeading({tenant,query,appearance,timezone,active,busy,undoAvailable,reset,onDay,onShift,onQuery,onWindow,onZoom,onUndo,onClear}:{tenant:TenantContext;query:PlanningQuery;appearance:Appearance;timezone:string;active:boolean;busy:boolean;undoAvailable:boolean;reset:number;onDay:(day:string)=>void;onShift:(days:number)=>void;onQuery:(patch:Partial<Pick<PlanningQuery,'search'|'status'>>)=>void;onWindow:(field:'from'|'to',value:string)=>void;onZoom:(zoom:Appearance['zoom'])=>void;onUndo:()=>void;onClear:()=>void}){
 const canCreate=tenant.roles.some(r=>['tenant_admin','management','planner'].includes(r))&&['backoffice.work_orders.read','backoffice.work_orders.write','backoffice.functions.save_work_order','backoffice.functions.work_order_options','backoffice.functions.work_order_list'].every(p=>hasManagementPermission(tenant,p));
 return <PageHeading eyebrow="PLANNING" title="Planbord" help="Plan de inzet van medewerkers op concrete werkbonnen." className="pb-page-heading" actions={<>
 <div className="ed-date-control pb-date"><button className="fg-action-icon" aria-label="Vorige dag" onClick={()=>onShift(-1)}><ChevronLeft size={15}/></button><input type="date" aria-label="Planningsdag" value={query.day} onChange={e=>onDay(e.target.value)}/><button className="fg-action-icon" aria-label="Volgende dag" onClick={()=>onShift(1)}><ChevronRight size={15}/></button><Button onClick={()=>onDay(tenantToday(timezone))}>Vandaag</Button></div>
 <EntityFilter key={reset} active={active}>
 <Field label="Zoeken"><input value={query.search} placeholder="Zoeken…" maxLength={200} onChange={e=>onQuery({search:e.target.value})}/></Field>
 <Field label="Status"><select value={query.status} onChange={e=>onQuery({status:e.target.value})}><option value="">Alle statussen</option>{Object.entries(executionStatuses).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></Field>
 <details><summary>Meer mogelijkheden</summary><div className="mc-form-grid"><Field label="Vanaf"><input type="time" step="60" value={appearance.from} onChange={e=>onWindow('from',e.target.value)}/></Field><Field label="Tot"><input type="time" step="60" value={appearance.to} onChange={e=>onWindow('to',e.target.value)}/></Field><Field label="Zoom"><select value={appearance.zoom} onChange={e=>onZoom(e.target.value as Appearance['zoom'])}><option value="overview">Overzicht</option><option value="wide">Ruimer</option><option value="precise">Precisie</option></select></Field><Button disabled={busy||!undoAvailable} onClick={onUndo}><Undo2 size={16}/>Ongedaan maken</Button></div></details>
 <Button onClick={onClear}>Filters wissen</Button>
 </EntityFilter>
 {canCreate&&<Link className="fg-action-icon primary-button" title="Nieuwe werkbon" aria-label="Nieuwe werkbon" href="/app/werkbonnen?new=1"><Plus size={18}/></Link>}
 </>}/>;
}
