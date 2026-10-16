"use client";
import {useCallback,useEffect,useRef,useState,useTransition} from 'react';
import {loadReportReviewDossier,loadWorkOrderReport,reviewWorkOrderReport} from '@/lib/work-orders/report-actions';
import type {WorkOrderDossier} from '@/lib/work-orders/model';
import type {WorkOrderReport} from '@/lib/work-orders/report-model';

/** One native review lifecycle for the existing dossier and the source frame.
 * No client-set status, fabricated approval, capture action or new authority. */
export function useReportReview(orderId:string,canReview:boolean){
 const [data,setData]=useState<WorkOrderReport|null>(null),[dossier,setDossier]=useState<WorkOrderDossier|null>(null),[error,setError]=useState(''),[reason,setReason]=useState(''),[pending,startTransition]=useTransition();
 const alive=useRef(false),sequence=useRef(0),writing=useRef(false),viewed=useRef<string|null|undefined>(undefined),latest=useRef<string|null>(null);
 const [changed,setChanged]=useState(false);
 useEffect(()=>{writing.current=pending},[pending]);
 const invalidate=useCallback(()=>{sequence.current++},[]);
 const load=useCallback(async()=>{
  const id=++sequence.current;
  try{
   const [result,reviewData]=await Promise.all([loadWorkOrderReport(orderId),canReview?loadReportReviewDossier(orderId):Promise.resolve(null)]);
   if(!alive.current||id!==sequence.current)return false;
   if(!result.ok){setData(null);setDossier(null);setError(result.error);return false;}
   const version=result.data.versions[0],identity=version?version.id+':'+version.contentHash:null;
   latest.current=identity;if(viewed.current===undefined)viewed.current=identity;else if(identity!==viewed.current)setChanged(true);
   setData(result.data);setError('');
   if(reviewData?.ok)setDossier(reviewData.data);else{setDossier(null);if(result.data.canReview&&reviewData&&!reviewData.ok)setError(reviewData.error);}
   return true;
  }catch{
   if(alive.current&&id===sequence.current){setData(null);setDossier(null);setError('Het rapport kon niet worden vernieuwd. Controleer je verbinding en probeer opnieuw.');}
   return false;
  }
 },[orderId,canReview]);
 useEffect(()=>{
  alive.current=true;const refresh=()=>{if(document.visibilityState==='visible'&&!writing.current)void load()};
  const first=setTimeout(refresh,0),timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);
  return()=>{alive.current=false;invalidate();clearTimeout(first);clearInterval(timer);window.removeEventListener('focus',refresh)};
 },[load,invalidate]);
 const current=data?.versions[0];
 const review=(decision:'approved'|'returned',onSaved?:()=>void)=>{
  if(!current||writing.current||changed)return;
  writing.current=true;sequence.current++;
  startTransition(async()=>{
   try{
    const result=await reviewWorkOrderReport({orderId,reportId:current.id,decision,reason});
    if(!alive.current)return;
    if(!result.ok){setError(result.error);return;}
    setError('');setReason('');if(await load())onSaved?.();
   }catch{if(alive.current)setError('De beoordeling kon niet worden bevestigd. Vernieuw het rapport voordat je dezelfde versie opnieuw beoordeelt. Je toelichting is behouden.');}
   finally{writing.current=false;}
  });
 };
 const acknowledge=()=>{viewed.current=latest.current;setChanged(false)};
 return {data,dossier,error,reason,pending,current,load,review,setError,setReason,startTransition,changed,acknowledge};
}
