"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowRight,CalendarDays,CheckCheck,ChevronRight,Clock,Inbox,RefreshCw,Target} from 'lucide-react';
import {CRM_STAGES,type CrmKind,type CrmState} from '@/lib/platform-crm/types';
import './crm-overview.css';

const euro=(value:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(value||0);
const dayKey=(value=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
const shortDate=(value:string)=>new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short'}).format(new Date(value.length===10?value+'T12:00:00Z':value));
const stamp=(value:string)=>new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const requestKinds:Record<CrmKind,string>={appointment:'Afspraak',demo:'Demoaanvraag',trial:'Proefperiode'};
const recentFirst=(a:{createdAt:string},b:{createdAt:string})=>b.createdAt.localeCompare(a.createdAt);
const dueLabel=(value:string|null,today:string)=>!value?'Nog plannen':dayKey(new Date(value))===today?'Vandaag':shortDate(value);
function isCrmState(value:unknown):value is CrmState{
  if(!value||typeof value!=='object')return false;
  const state=value as Record<string,unknown>;
  return ['leads','requests','activities','tasks','appointments','notifications'].every(key=>Array.isArray(state[key]))&&!!state.settings&&typeof state.settings==='object'&&typeof state.mailConfigured==='boolean';
}
function DemoTag({show}:{show:boolean}){return show?<span className="co-demo-tag">Voorbeeld</span>:null}
function EmptyCard({title,text}:{title:string;text:string}){return <div className="co-empty"><strong>{title}</strong><p>{text}</p></div>}

export function CRMOverview({navigate}:{navigate:(path:string)=>void}){
  const [data,setData]=useState<CrmState|null>(null);
  const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);
  const refresh=useCallback(async()=>{
    controller.current?.abort();
    const request=new AbortController();controller.current=request;
    setRefreshing(true);
    try{
      const response=await fetch('/api/crm?view=overview',{credentials:'same-origin',cache:'no-store',signal:request.signal});
      const result:unknown=await response.json().catch(()=>null);
      const payload=result&&typeof result==='object'?result as Record<string,unknown>:null;
      if(!response.ok||payload?.ok===false)throw new Error(typeof payload?.error==='string'?payload.error:'Het CRM-overzicht kon niet worden geladen.');
      if(!isCrmState(result))throw new Error('De server gaf geen geldig CRM-overzicht terug. Probeer het opnieuw.');
      if(!request.signal.aborted){setData(result);setError('')}
    }catch(e){if(!request.signal.aborted)setError(e instanceof Error?e.message:'Het CRM-overzicht kon niet worden geladen.')}
    finally{if(!request.signal.aborted){setLoading(false);setRefreshing(false)}}
  },[]);
  useEffect(()=>{
    const first=requestAnimationFrame(()=>void refresh());
    const update=()=>{if(document.visibilityState==='visible')void refresh()};
    const timer=window.setInterval(update,30000);
    window.addEventListener('focus',update);
    return()=>{cancelAnimationFrame(first);controller.current?.abort();window.clearInterval(timer);window.removeEventListener('focus',update)};
  },[refresh]);
  const open=(tab:string,lead?:string|null)=>{
    const query=new URLSearchParams({tab});if(lead)query.set('lead',lead);
    navigate('/platform/crm?'+query.toString());
  };
  const now=data?new Date(data.observedAt).getTime():0,today=data?dayKey(new Date(data.observedAt)):'';
  const leads=data?.leads||[];
  const active=leads.filter(l=>!['won','lost'].includes(l.stage));
  const requests=[...(data?.requests||[])].sort(recentFirst);
  const upcoming=(data?.appointments||[]).filter(a=>a.status!=='cancelled'&&new Date(a.endsAt).getTime()>=now).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
  const tasks=(data?.tasks||[]).filter(t=>!t.completed);
  const followups=active.filter(l=>l.nextActionAt);
  const actionRows=[
    ...tasks.map(t=>({id:'task-'+t.id,title:t.title,detail:t.leadId?data?.leads.find(l=>l.id===t.leadId)?.company||'Leaddossier':'Algemene CRM-taak',dueAt:t.dueAt,leadId:t.leadId,tab:'tasks',isDemo:t.isDemo})),
    ...followups.map(l=>({id:'lead-'+l.id,title:l.company,detail:'Contact opvolgen · '+l.name,dueAt:l.nextActionAt,leadId:l.id,tab:'pipeline',isDemo:l.isDemo}))
  ].sort((a,b)=>(a.dueAt||'9999').localeCompare(b.dueAt||'9999'));
  const overdue=data?.counts.overdue||0;
  const demoCount=(data?.leads||[]).filter(l=>l.isDemo).length;
  return <section className="crm-overview" aria-label="CRM-overzicht">
    {error&&<div className="co-error" role="alert"><span>{data?'Vernieuwen is niet gelukt. Je ziet de laatst opgehaalde gegevens.':error}</span><button type="button" disabled={refreshing} onClick={()=>void refresh()}>Opnieuw proberen <RefreshCw size={14}/></button></div>}
    {loading?<div className="fg-panel co-loading" role="status"><RefreshCw size={20} className="co-refreshing"/>CRM-overzicht laden…</div>:data?<>
      <div className="co-card-grid">
        <section className="fg-panel co-card">
          <div className="fg-panel-heading"><div><span className="fg-eyebrow">COMMERCIËLE KANSEN</span><h2>Actieve pipeline</h2></div><span className="co-icon"><Target size={20}/></span></div>
          <div className="co-pipeline-total"><div><strong>{data.counts.active}</strong><span>actieve leads</span></div><div><strong>{euro(data.counts.value)}</strong><span>potentiële maandwaarde</span></div></div>
          <div className="co-stages">{CRM_STAGES.filter(s=>!['won','lost'].includes(s.id)).map(stage=>{const count=(data.counts.stages[stage.id]||0);return <button type="button" key={stage.id} onClick={()=>open('pipeline')} aria-label={`${stage.label}: ${count} leads. Open pipeline.`}><span>{stage.label}</span><span className="co-stage-track" aria-hidden="true"><i className={'co-stage-'+stage.id} style={{width:data.counts.active?`${count/data.counts.active*100}%`:'0%'}}/></span><b>{count}</b></button>})}</div>
          <div className="co-card-footer"><span>{(data.counts.stages.won||0)} gewonnen · {(data.counts.stages.lost||0)} verloren</span><button type="button" onClick={()=>open('pipeline')}>Open pipeline <ArrowRight size={15}/></button></div>
        </section>
        <section className="fg-panel co-card">
          <div className="fg-panel-heading"><div><span className="fg-eyebrow">VIA JE WEBSITE</span><h2>Recente aanvragen</h2></div><span className="co-icon blue"><Inbox size={20}/></span></div>
          <p className="co-card-intro"><strong>{data.counts.requests}</strong> geregistreerde aanvragen · nieuwste eerst</p>
          <div className="co-list">{requests.slice(0,3).map(r=>{const lead=data.leads.find(l=>l.id===r.leadId),company=r.company?.trim()||lead?.company||'Onbekende organisatie',name=r.name?.trim()||lead?.name||'Contactpersoon';return <button type="button" className="co-list-row" key={r.id} onClick={()=>open('requests',r.leadId)}><span className="co-avatar">{company.slice(0,2).toUpperCase()}</span><span className="co-row-content"><span className="co-row-title"><strong>{company}</strong><DemoTag show={r.isDemo}/></span><small>{name} · {requestKinds[r.kind]}</small><span className="co-row-time">{stamp(r.createdAt)}</span></span><ChevronRight size={16}/></button>})}{!requests.length&&<EmptyCard title="Ruimte voor je volgende klant" text="Nieuwe demo-, afspraak- en proefaanvragen verschijnen hier automatisch."/>}</div>
          <div className="co-card-footer"><span>Alle aanvraagtypen</span><button type="button" onClick={()=>open('requests')}>Alle aanvragen <ArrowRight size={15}/></button></div>
        </section>
        <section className="fg-panel co-card">
          <div className="fg-panel-heading"><div><span className="fg-eyebrow">JE KOMENDE GESPREKKEN</span><h2>Afspraken</h2></div><span className="co-icon blue"><CalendarDays size={20}/></span></div>
          <p className="co-card-intro"><strong>{data.counts.appointments}</strong> gepland · {data.counts.requestedAppointments} nog te bevestigen</p>
          <div className="co-list">{upcoming.slice(0,3).map(a=>{const lead=data.leads.find(l=>l.id===a.leadId);return <button type="button" className="co-list-row" key={a.id} onClick={()=>open('agenda',a.leadId)}><span className="co-date-block"><b>{a.date.slice(-2)}</b><small>{shortDate(a.date).replace(/^\d+\s*/,'')}</small></span><span className="co-row-content"><span className="co-row-title"><strong>{lead?.company||'Afspraak'}</strong><DemoTag show={a.isDemo}/></span><small>{a.time} – {a.endTime} · telefonisch</small><span className={`co-inline-status ${a.status==='requested'?'pending':''}`}>{a.status==='requested'?'Bevestiging nodig':'Bevestigd'}</span></span><ChevronRight size={16}/></button>})}{!upcoming.length&&<EmptyCard title="Nog geen komende afspraken" text="Open je beschikbaarheid of plan een kennismaking met een lead."/>}</div>
          <div className="co-card-footer"><span>Amsterdam · 30 minuten</span><button type="button" onClick={()=>open('agenda')}>Bekijk agenda <ArrowRight size={15}/></button></div>
        </section>
        <section className="fg-panel co-card">
          <div className="fg-panel-heading"><div><span className="fg-eyebrow">HOUD HET CONTACT WARM</span><h2>Opvolging</h2></div><span className={'co-icon'+(overdue?' amber':'')}><CheckCheck size={20}/></span></div>
          <p className="co-card-intro"><strong>{data.counts.tasks}</strong> open taken · {data.counts.followups} leads met een opvolgdatum{overdue>0&&<span className="co-overdue-count">{overdue} over de datum</span>}</p>
          <div className="co-list">{actionRows.slice(0,3).map(action=><button type="button" className="co-list-row" key={action.id} onClick={()=>open(action.tab,action.leadId)}><span className={'co-action-icon'+(action.dueAt&&dayKey(new Date(action.dueAt))<today?' overdue':'')}><Clock size={18}/></span><span className="co-row-content"><span className="co-row-title"><strong>{action.title}</strong><DemoTag show={action.isDemo}/></span><small>{action.detail}</small><span className={'co-row-time'+(action.dueAt&&dayKey(new Date(action.dueAt))<today?' overdue':'')}>{dueLabel(action.dueAt,today)}{action.dueAt&&dayKey(new Date(action.dueAt))<today?' · over de datum':''}</span></span><ChevronRight size={16}/></button>)}{!actionRows.length&&<EmptyCard title="Je bent helemaal bij" text="Open taken en geplande opvolgmomenten uit leaddossiers komen hier samen."/>}</div>
          <div className="co-card-footer"><span>Eerst wat het langst wacht</span><button type="button" onClick={()=>open('tasks')}>Alle taken <ArrowRight size={15}/></button></div>
        </section>
      </div>
      {demoCount>0&&<p className="co-data-note">{`Inclusief ${demoCount} herkenbaar gemarkeerde voorbeeldlead${demoCount===1?'':'s'}. Voorbeelden versturen geen e-mail.`}</p>}
    </>:null}
  </section>;
}
