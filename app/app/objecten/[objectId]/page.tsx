import {notFound} from "next/navigation";
import {getAuthContext} from "@/lib/auth/context";
import {getObjectData} from "@/lib/objects/data";
import {getPlanningShellData} from "@/lib/planning/data";
import {canManageObjects,objectTabs,type ObjectTab} from "@/lib/objects/model";
import {BackofficeShell} from "@/components/fieldgrid/backoffice-shell";
import {ObjectDossier} from "@/components/fieldgrid/objects/dossier";
export default async function ObjectDossierPage({params,searchParams}:{params:Promise<{objectId:string}>;searchParams:Promise<{tab?:string}>}){
 const context=await getAuthContext();const {objectId}=await params;const {tab}=await searchParams;
 if(!context.tenant||!canManageObjects(context.tenant.roles)||!context.tenant.enabledServices.includes("planning")||!/^[a-f0-9-]{36}$/i.test(objectId))notFound();
 const [data,shell]=await Promise.all([getObjectData(context.tenant.id,objectId),getPlanningShellData(context.tenant.id)]);if(!data)notFound();
 const selected=(objectTabs.some(([k])=>k===tab)?tab:"overzicht") as ObjectTab;
 return <BackofficeShell context={{...context,tenant:context.tenant}} data={shell} initialView="objecten"><ObjectDossier key={`${objectId}:${selected}`} data={data} tenant={context.tenant} tab={selected}/></BackofficeShell>;
}
