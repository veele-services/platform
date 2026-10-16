import type {Row} from '@/lib/objects/model';
import {requestLabels,quoteLabels,type CommercialRow} from './model';
/** Only the source presentation labels change. Stored lifecycle states and
 * immutable original wording remain governed by the native commercial RPCs. */
export function sourceCommercialStatus(row:Pick<CommercialRow,'source_kind'|'status'>){
 if(row.source_kind==='quote'||row.source_kind==='proposal')return ({draft:'Conceptofferte',accepted:'Geaccepteerd'} as Record<string,string>)[row.status]||quoteLabels[row.status]||row.status;
 return requestLabels[row.status]||row.status;
}
export function sourceCommercialTone(status:string){return ['accepted','processed'].includes(status)?'green':['awaiting_acceptance','waiting_info','change_requested','expired'].includes(status)?'amber':'neutral'}
export function sourceCommercialSave(record:Row<'requests'>|Row<'quotes'>,subject:string,scope:string){
 const common={id:record.id,version:record.version,customer_id:record.customer_id||'',object_id:record.object_id||'',contact_id:record.contact_id||'',subject,work_kind:record.work_kind,owner_id:record.owner_id||'',next_action:record.next_action,followup_on:record.followup_on};
 if('quote_number'in record)return {command:'quote_save',input:{...common,request_id:record.request_id||'',price_basis:record.price_basis,lines:record.lines,terms:{...(record.terms as Record<string,unknown>),scope},expires_at:record.expires_at}};
 return {command:'request_save',input:{...common,description:record.description,discipline:record.discipline,source:record.source,priority:record.priority,preferences:record.preferences}};
}
