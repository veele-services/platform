import 'server-only';
import {headers} from 'next/headers';
import {createClient} from '@/lib/supabase/server';
import {getAuthContext} from '@/lib/auth/context';
import {hasManagementPermission} from '@/lib/management/model';
import {HOST_KIND_HEADER,TENANT_SLUG_HEADER} from '@/lib/tenancy/hostname';
import {ticketRpc} from '@/lib/tickets/rpc';
import {projectFollowup,followupQuerySchema,followupHistorySchema,projectFollowupSource,followupSourceQuerySchema,type FollowupQuery,type FollowupDetail} from './followup';

export async function cockpitActor(){
 const h=await headers();if(h.get(HOST_KIND_HEADER)!=='tenant'||!h.get(TENANT_SLUG_HEADER))throw Object.assign(new Error('Open je eigen organisatie.'),{code:'42501'});
 const db=await createClient(),{data,error}=await db.auth.getUser();if(error||!data.user)throw Object.assign(new Error('Log opnieuw in.'),{code:'42501'});
 const context=await getAuthContext();if(!context.tenant||context.tenant.slug!==h.get(TENANT_SLUG_HEADER)||!hasManagementPermission(context.tenant,'backoffice.followup.read'))throw Object.assign(new Error('Geen managementtoegang.'),{code:'42501'});
 return{context:{...context,tenant:context.tenant},db};
}
export async function loadFollowup({context,db}:Awaited<ReturnType<typeof cockpitActor>>,query:FollowupQuery){
 const h=await headers();if(h.get(HOST_KIND_HEADER)!=='tenant'||h.get(TENANT_SLUG_HEADER)!==context.tenant.slug)throw Object.assign(new Error('Open je eigen organisatie.'),{code:'42501'});
 return projectFollowup(await ticketRpc(db,'cockpit_followup',{target_tenant:context.tenant.id}),query,context.tenant.name);
}
export async function getFollowup(query:FollowupQuery){return loadFollowup(await cockpitActor(),query)}
export async function getFollowupDetail(focus:{id:string;kind:string}):Promise<FollowupDetail>{
 const{context,db}=await cockpitActor();
 const raw=await ticketRpc(db,'cockpit_followup',{target_tenant:context.tenant.id});
 const action=projectFollowup(raw,followupQuerySchema.parse({}),context.tenant.name,focus).actions[0];
 if(!action)throw Object.assign(new Error('Deze bron is niet beschikbaar binnen je actuele rechten.'),{code:'42501'});
 const history=followupHistorySchema.parse(await ticketRpc(db,'cockpit_action_history',{target_tenant:context.tenant.id,kind:focus.kind,record_id:focus.id}));
 return{action,history};
}

export async function getFollowupSource(focus:import('zod').z.infer<typeof followupSourceQuerySchema>){const{context,db}=await cockpitActor();return projectFollowupSource(await ticketRpc(db,'cockpit_followup',{target_tenant:context.tenant.id}),focus,context.tenant.name)}
