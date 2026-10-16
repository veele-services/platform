"use client";
import {useEffect,useRef,useState} from 'react';
import {Check} from 'lucide-react';
import type {FollowupAction,FollowupSource} from '@/lib/management-cockpit/followup';
import {Button,Field} from '../crm/ui';
import {useUnsavedDraft} from '../unsaved-form';
import {managementRequest} from './request';

/** The source's inline feedback uses the original versioned command. Derived
 * alerts stay with their source process; unrelated actions are never bulk closed. */
export function SourceFollowup({data,refresh,onForbidden,onDirtyChange,onBusyChange}:{data:FollowupSource;refresh:()=>Promise<void>;onForbidden:()=>void;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void}){
 const editable=data.actions.filter(a=>a.kind==='manual'&&!a.automatic&&a.status!=='done'&&a.canComplete&&a.canModify);
 const [selection,setSelection]=useState(''),[baseline,setBaseline]=useState<FollowupAction|null>(null),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const attempt=useRef({signature:'',id:''}),lock=useRef(false),root=useUnsavedDraft<HTMLFormElement>(Boolean(note));
 const selected=editable.find(a=>a.id===selection)||editable[0],current=baseline?data.actions.find(a=>a.id===baseline.id&&a.kind===baseline.kind):selected,writable=Boolean(current?.canModify&&current.canComplete&&!current.automatic&&current.status!=='done');
 useEffect(()=>{onDirtyChange(Boolean(note));return()=>onDirtyChange(false)},[note,onDirtyChange]);
 useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false)},[busy,onBusyChange]);
 if(!selected&&!baseline)return notice?<p role="status" className="gov-success">{notice}</p>:<p className="mc-info">Werk deze bron bij via het brondossier. Automatische opvolging volgt de oorspronkelijke registratie.</p>;
 return <form ref={root} className="mc-source-feedback" onSubmit={async event=>{
  event.preventDefault();if(lock.current||!writable||note.trim().length<3)return;
  const source=baseline||selected;if(!source)return;const input={id:source.id,kind:source.kind,revision:source.revision,note},signature=JSON.stringify(input);
  if(attempt.current.signature!==signature)attempt.current={signature,id:crypto.randomUUID()};
  lock.current=true;setBusy(true);setError('');setNotice('');
  try{await managementRequest('/api/management-cockpit',{command:'complete',input,requestId:attempt.current.id});window.dispatchEvent(new Event('cockpit-followup-changed'));setNote('');setBaseline(null);attempt.current={signature:'',id:''};setNotice('Opvolging opgeslagen. De bron en oorspronkelijke deadline blijven behouden.');try{await refresh()}catch{setError('Opgeslagen. Het overzicht kon niet worden vernieuwd; laad de actuele bron.')}}
  catch(e){const status=(e as {status?:number}).status;if(status===403){onForbidden();return}setError(status&&e instanceof Error?e.message:'Opslaan kon niet worden bevestigd. Je invoer is behouden; probeer het opnieuw.')}
  finally{lock.current=false;setBusy(false)}
 }}>
  {(editable.length>1||baseline&&!editable.some(a=>a.id===baseline.id))&&<Field label="Opvolgactie"><select disabled={busy} value={baseline?.id||selected?.id||''} onChange={e=>{if(note&&!confirm('De terugkoppeling verwerpen en een andere actie kiezen?'))return;setSelection(e.target.value);setBaseline(null);setNote('');setError('')}}>{baseline&&!editable.some(a=>a.id===baseline.id)&&<option value={baseline.id} disabled>{baseline.title} (niet meer bewerkbaar)</option>}{editable.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}</select></Field>}
  <Field label="Terugkoppeling (verplicht)"><textarea required minLength={3} maxLength={10000} rows={3} disabled={busy} readOnly={!writable} value={note} onChange={e=>{setBaseline(value=>value||selected||null);setNote(e.target.value);setError('')}} placeholder="Wat heb je afgesproken of afgehandeld?"/></Field>
  {error&&<p role="alert" className="gov-error">{error}</p>}{notice&&<p role="status" className="gov-success">{notice}</p>}
  {baseline&&(!writable||current?.revision!==baseline.revision)&&<><p className="mc-info">De actie is intussen gewijzigd. Je invoer is behouden; controleer de actuele actie voordat je haar opnieuw afrondt.</p>{writable&&current&&<Button disabled={busy} onClick={()=>{if(confirm('De actuele actie gebruiken en je terugkoppeling behouden?')){setBaseline(current);setError('')}}}>Actuele actie gebruiken</Button>}</>}
  <Button primary type="submit" disabled={busy||!writable||note.trim().length<3}><Check size={16}/>{busy?'Opslaan…':'Opvolging afronden'}</Button>
 </form>;
}
