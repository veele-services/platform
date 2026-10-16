import { z } from "zod";
import { customerViews } from "@/lib/customer-portal/model";
import { customerVisitDetailSchema } from "@/lib/customer-portal/visit-model";
import type { CustomerCoreSnapshot } from "@/lib/customer-portal/snapshot-model";
import type { CustomerResources } from "@/lib/customer-portal/presentation";

export const customerPortalViewSchema=z.enum([...customerViews,"notifications","more"]);
export type CustomerPortalView=z.infer<typeof customerPortalViewSchema>;
export const customerRouteSchema=z.object({account:z.uuid().optional(),view:customerPortalViewSchema.optional(),object:z.uuid().optional(),order:z.uuid().optional(),ticket:z.uuid().optional(),request:z.uuid().optional(),invoice:z.uuid().optional(),report:z.uuid().optional(),news:z.uuid().optional(),payment:z.literal("return").optional()}).strict();
export type CustomerRoute=z.infer<typeof customerRouteSchema>;
export function customerRouteHref(route:CustomerRoute){
 const query=new URLSearchParams();
 for(const key of ["account","view","object","order","ticket","request","invoice","report","news","payment"] as const)if(route[key])query.set(key,route[key]);
 return `/klant${query.size?`?${query}`:""}`;
}

/** All resources come from a selected-account, currently authorized projection. */
export const customerCoreAvailability={tickets:true,activity:true,payments:true,documents:true} as const;
export function customerCoreResources(snapshot:CustomerCoreSnapshot):CustomerResources {
 return {invoices:snapshot.invoices,reports:snapshot.reports,documents:snapshot.documents,requests:snapshot.requests,services:snapshot.services,news:snapshot.news,
  tickets:snapshot.tickets,activity:snapshot.activity.items,unread:snapshot.activity.unread,paymentEnabled:snapshot.workspace.tenant.finance&&snapshot.workspace.tenant.paymentConfigured,now:snapshot.now};
}

export async function loadCustomerVisit(accountId:string,visitId:string,signal:AbortSignal,fetcher:typeof fetch=fetch){
 const response=await fetcher(`/api/customer-portal/visit?${new URLSearchParams({account:accountId,visit:visitId})}`,{signal,credentials:"same-origin",cache:"no-store",redirect:"error"});
 if(response.status===401||response.status===403)return {kind:"denied" as const};
 if(!response.ok)return {kind:"temporary" as const};
 const parsed=customerVisitDetailSchema.safeParse(await response.json());
 if(!parsed.success)return {kind:"temporary" as const};
 if(parsed.data.visit.id!==visitId)return {kind:"denied" as const};
 return {kind:"ok" as const,detail:parsed.data};
}
