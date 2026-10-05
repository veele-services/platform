import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import { customerAccountOptionsSchema,customerWorkspaceSchema,customerBaseSnapshotSchema } from "./model";
import { customerCoreSnapshotSchema,CustomerSnapshotError } from "./snapshot-model";
import { customerVisitDetailSchema } from "./visit-model";

/** Identity/hostname resolution is unchanged. Multiple authorized customers
 * require an explicit selection; neither query/body nor an account picks a tenant. */
export async function getCustomerPortal(requestedAccount?:string) {
 const actor=await getObjectActor();
 const options=await actor.db.rpc("customer_portal_accounts",{target_tenant:actor.tenant.id});
 if(options.error)throw new Error("Je klantaccount kon niet worden gecontroleerd.");
 const accounts=customerAccountOptionsSchema.parse(options.data);
 const account=requestedAccount?z.uuid().parse(requestedAccount):accounts.length===1?accounts[0].id:null;
 if(account&&!accounts.some(option=>option.id===account))throw new Error("Geen toegang tot dit klantaccount.");
 const actorKey=createHash("sha256").update(JSON.stringify([actor.tenant.id,actor.user.id,actor.sessionId])).digest("hex");
 if(!account)return {accounts,workspace:null,tenantId:actor.tenant.id,actorKey};
 const result=await actor.db.rpc("customer_portal_workspace",{target_tenant:actor.tenant.id,target_account:account});
 if(result.error)throw new Error("Dit klantaccount is gewijzigd of niet meer toegankelijk.");
 const workspace=customerWorkspaceSchema.parse(result.data);
 if(workspace.account.id!==account)throw new Error("Geen toegang tot dit klantaccount.");
 return {accounts,workspace,tenantId:actor.tenant.id,actorKey};
}

/** Used by explicit wizard review and current-state refresh. It does not install
 * a session, resolve a tenant from input or return the private draft baselines. */
export async function getCustomerPortalBaseSnapshot(accountId:string){
 const account=z.uuid().parse(accountId),actor=await getObjectActor();
 const args={target_tenant:actor.tenant.id,target_account:account};
 const [draft,preferences]=await Promise.all([actor.db.rpc("customer_portal_draft",args),actor.db.rpc("customer_portal_preferences",args)]);
 if(draft.error||preferences.error)throw new Error("Je klantgegevens konden niet worden gecontroleerd.");
 // Recheck current account/contact/session after the two asynchronous reads.
 const workspace=await actor.db.rpc("customer_portal_workspace",args);
 if(workspace.error)throw new Error("Je klanttoegang is gewijzigd.");
 const result=customerBaseSnapshotSchema.parse({workspace:workspace.data,draft:draft.data,preferences:preferences.data});
 if(result.workspace.account.id!==account||result.workspace.account.version!==result.draft.version)throw new Error("Je concept is tijdens het laden gewijzigd. Probeer opnieuw.");
 return result;
}

/** The account is an explicit selector, never a tenant resolver. Every RPC is
 * account-scoped and the final workspace rechecks live access after I/O. */
export async function getCustomerPortalCoreSnapshot(accountId:string){
 const account=z.uuid().parse(accountId),actor=await getObjectActor();
 const args={target_tenant:actor.tenant.id,target_account:account};
 const [draft,preferences,invoices,reports,requests,services,news,tickets,activity,documents]=await Promise.all([
  actor.db.rpc("customer_portal_draft",args),actor.db.rpc("customer_portal_preferences",args),
  actor.db.rpc("customer_portal_invoices",args),actor.db.rpc("customer_portal_reports",args),
  actor.db.rpc("customer_portal_requests",args),actor.db.rpc("customer_portal_services",args),
  actor.db.rpc("customer_portal_news",args),
  actor.db.rpc("ticket_query",{target_tenant:actor.tenant.id,actor_context:"customer",operation:"list",payload:{account:account}}),
  actor.db.rpc("customer_portal_activity",args),
  actor.db.rpc("customer_portal_shared_documents",args),
 ]);
 const workspace=await actor.db.rpc("customer_portal_workspace",args);
 const responses=[draft,preferences,invoices,reports,requests,services,news,tickets,activity,documents,workspace];
 if(responses.some(result=>result.error?.code==="42501"))throw new CustomerSnapshotError(403,"Je klanttoegang is gewijzigd.");
 if(responses.some(result=>result.error))throw new CustomerSnapshotError(503,"Je actuele gegevens konden niet worden geladen.");
 const parsed=customerCoreSnapshotSchema.safeParse({workspace:workspace.data,draft:draft.data,preferences:preferences.data,
  invoices:invoices.data,reports:reports.data,requests:requests.data,services:services.data,news:news.data,tickets:tickets.data,activity:activity.data,documents:documents.data,now:new Date().toISOString()});
 if(!parsed.success)throw new CustomerSnapshotError(503,"De gegevens zijn tijdens het laden gewijzigd. Probeer opnieuw.");
 const result=parsed.data;
 if(result.workspace.account.id!==account)throw new CustomerSnapshotError(403,"Geen toegang tot dit klantaccount.");
 if(result.workspace.account.version!==result.draft.version)throw new CustomerSnapshotError(409,"Je concept is tijdens het laden gewijzigd. Probeer opnieuw.");
 return result;
}

export async function getCustomerPortalVisit(accountId:string,visitId:string){
 const account=z.uuid().parse(accountId),visit=z.uuid().parse(visitId),actor=await getObjectActor();
 const result=await actor.db.rpc("customer_portal_visit",{target_tenant:actor.tenant.id,target_account:account,target_visit:visit});
 if(result.error)throw new CustomerSnapshotError(result.error.code==="42501"?403:503,"Deze klantafspraak is niet beschikbaar.");
 const parsed=customerVisitDetailSchema.safeParse(result.data);
 if(!parsed.success)throw new CustomerSnapshotError(503,"Je afspraak kon niet worden gecontroleerd.");
 if(parsed.data.visit.id!==visit)throw new CustomerSnapshotError(403,"Geen toegang tot deze klantafspraak.");
 return parsed.data;
}
