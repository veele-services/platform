"use client";
import {ArrowUpRight,Check,Minus} from 'lucide-react';
import type {ReportReviewRow} from '@/lib/work-orders/source-presentation';
import {sourceExecutionLabel} from '@/lib/work-orders/source-presentation';
import {localDateTime} from '@/lib/planning/time';
import {Button,Field} from '../crm/ui';
import {SourceNativeDialog} from '../source-native-dialog';
import {ReportReviewDetails} from './review-details';
import {ReportDocument} from './report-document';
import {useReportReview} from './use-report-review';
import '../staff/staff-report.css';

export function SourceReportReview({row,timezone,canReview,onClose,onSaved,onSource}:{row:ReportReviewRow;timezone:string;canReview:boolean;onClose:()=>void;onSaved:()=>void;onSource:()=>void}){
 const {data,dossier,error,reason,pending,current,review,setReason,changed,acknowledge}=useReportReview(row.id,canReview);
 const canDecide=canReview&&Boolean(data?.canReview&&current&&['review','waiting_signature','correction'].includes(current.state));
 const planned=dossier?.order.start?localDateTime(dossier.order.start,timezone).slice(0,10):row.start?localDateTime(row.start,timezone).slice(0,10):'';
 const close=()=>{if(!pending&&(!reason||confirm('Je controleopmerking is nog niet opgeslagen. Wil je die weggooien?')))onClose()};
 const evidence=[
  {ok:Boolean(current?.snapshot.tasks.length),label:'Uitvoering geregistreerd per werkhoeveelheid',missing:'Nog geen vastgelegde werkhoeveelheden ontvangen'},
  {ok:Boolean(current?.snapshot.attachments.some(a=>a.mime.startsWith('image/'))),label:"Foto’s en rapportage ontvangen",missing:'Nog geen bewijsfoto in deze rapportversie ontvangen'},
  {ok:current?.state==='approved',label:'Klantafspraak en objectinstructies gecontroleerd',missing:'Klantafspraak en objectinstructies nog te controleren'},
 ];
 return <SourceNativeDialog sourceForm title={row.number} eyebrow="RAPPORTCONTROLE" description="" dirty={Boolean(reason)} busy={pending} onClose={onClose} footer={<><Button disabled={pending} onClick={close}>Annuleren</Button>{canDecide&&<Button disabled={pending||changed||reason.trim().length<3} onClick={()=>review('returned',onSaved)}>Correctie vragen</Button>}{canDecide&&<Button primary disabled={pending||changed||current?.state!=='review'||!dossier} onClick={()=>review('approved',onSaved)}>{pending?'Beoordelen…':'Rapport goedkeuren'}</Button>}</>}>
  {changed&&data&&<div role="alert"><p>Er is een nieuwe rapportversie ontvangen. Bekijk de actuele versie voordat je beoordeelt. Je controleopmerking is behouden.</p><Button onClick={acknowledge}>Actuele rapportversie bekeken</Button></div>}
  {error&&<p role="alert" className="gov-error">{error}</p>}{!data?<p role="status">Geautoriseerd rapport laden…</p>:<><div className="ed-form-grid">
   <Field label="Object / titel"><input value={dossier?.order.title??current?.snapshot.title??row.title} readOnly/></Field>
   <Field label="Geplande datum"><input type="date" value={planned} readOnly/></Field>
   <Field label="Uitvoering"><select value={dossier?.order.status??row.status} disabled><option value={dossier?.order.status??row.status}>{sourceExecutionLabel(dossier?.order.status??row.status)}</option></select></Field>
   <Field label="Notitie / terugkoppeling"><textarea rows={4} value={reason} readOnly={!canDecide||pending} maxLength={2000} onChange={e=>setReason(e.target.value)}/></Field>
  </div><div className="ed-review-checks">{evidence.map(e=><p key={e.label}>{e.ok?<Check size={16}/>:<Minus size={16}/>} {e.ok?e.label:e.missing}</p>)}</div>
  {!current&&<p>Er is nog geen versievaste rapportage ingediend. Historische notities zijn geen formeel goedgekeurd rapport.</p>}
  <details><summary>{current?`Werkrapport en bewijs bekijken · versie ${current.version}`:'Ondertekenafspraak en historie bekijken'}</summary>{current&&(dossier?<ReportReviewDetails dossier={dossier} report={data} current={current}/>:<ReportDocument report={current}/>)}<p><a className="ed-link" href={`/app/werkbonnen/${row.id}?tab=rapport&return=${encodeURIComponent('/app/rapporten')}`}>Volledig rapport, ondertekenafspraak en historie <ArrowUpRight size={14}/></a></p></details>
  <button className="ed-link" disabled={pending} onClick={()=>{if(!reason||confirm('Je controleopmerking is nog niet opgeslagen. Wil je die weggooien?'))onSource()}}>Open verbonden bron <ArrowUpRight size={14}/></button></>}
 </SourceNativeDialog>;
}
