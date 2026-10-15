import 'server-only';
import {cockpitActor} from '@/lib/management-cockpit/data';
import {hasManagementPermission} from '@/lib/management/model';
import type {NewsState} from './source';
async function allRows<T>(read:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>){const rows:T[]=[];for(let from=0;from<100000;from+=500){const r=await read(from,from+499);if(r.error)throw r.error;const page=r.data??[];rows.push(...page);if(page.length<500)return rows;}throw new Error('Dit nieuwsoverzicht is te groot. Neem contact op met je beheerder.');}
/** Native announcement RLS, no HR workspace or reader identities in the DTO. */
export async function sourceNews():Promise<NewsState>{
 const {context,db}=await cockpitActor('backoffice.news.read'),tenant=context.tenant;
 if(!tenant.enabledServices.includes('personeel')||!hasManagementPermission(tenant,'backoffice.access'))throw Object.assign(new Error('Nieuws is niet beschikbaar.'),{code:'42501'});
 const [items,reads]=await Promise.all([allRows((from,to)=>db.from('announcements').select('id,title,body,published_at,withdrawn_at,created_at').eq('tenant_id',tenant.id).order('created_at',{ascending:false}).order('id').range(from,to)),allRows((from,to)=>db.from('announcement_reads').select('announcement_id').eq('tenant_id',tenant.id).order('id').range(from,to))]);
 const current=await cockpitActor('backoffice.news.read');if(current.context.user.id!==context.user.id||current.context.tenant.id!==tenant.id||!current.context.tenant.enabledServices.includes('personeel')||!hasManagementPermission(current.context.tenant,'backoffice.access'))throw Object.assign(new Error('Nieuws is niet meer beschikbaar.'),{code:'42501'});
 const readIds=new Set(reads.map(r=>r.announcement_id));
 return {items:items.map(i=>({id:i.id,title:i.title,body:i.body,publishedAt:i.published_at,withdrawnAt:i.withdrawn_at,createdAt:i.created_at,read:readIds.has(i.id)})),canManage:current.context.tenant.roles.some(r=>['tenant_admin','management'].includes(r))&&hasManagementPermission(current.context.tenant,'backoffice.news.write')};
}
