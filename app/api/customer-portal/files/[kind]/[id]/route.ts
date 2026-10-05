import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import { privateFileHeaders } from "@/lib/files/private-download";
import { GET as customerFile } from "@/app/api/customer-files/[kind]/[id]/route";
import { customerReportResponse } from "@/lib/customer-portal/report-download";
import { GET as commercialFile } from "@/app/api/files/commercial/[id]/route";
const paramsSchema=z.object({kind:z.enum(["invoice","report","quote","document"]),id:z.uuid()}).strict();
export async function GET(request:Request,{params}:{params:Promise<{kind:string;id:string}>}){
 try{
  const {kind,id}=paramsSchema.parse(await params),url=new URL(request.url),account=z.uuid().parse(url.searchParams.get("account"));
  if(url.searchParams.getAll("account").length!==1)throw new Error();
  const actor=await getObjectActor();
  const authorize=async()=>{const result=await actor.db.rpc("customer_portal_file_authorize",{target_tenant:actor.tenant.id,target_account:account,kind,target_id:id});if(result.error||result.data!==true)throw new Error();};
  await authorize();
  const preview=url.searchParams.get("preview")==="1";
  const source=new URL(request.url);source.search="";
  if(kind==="quote"){source.searchParams.set("portal","true");source.searchParams.set("asset","pdf");}
  if(preview)source.searchParams.set("preview","1");
  const sourceRequest=new Request(source,{headers:request.headers});
  const response=kind==="report"?await customerReportResponse(id,account):kind==="quote"?await commercialFile(sourceRequest,{params:Promise.resolve({id})}):await customerFile(sourceRequest,{params:Promise.resolve({kind,id})});
  if(!response.ok)throw new Error();
  const bytes=await response.arrayBuffer();
  await authorize();
  const headers=new Headers(response.headers),disposition=headers.get("content-disposition");
  if(disposition)headers.set("content-disposition",disposition.replace(/^(inline|attachment)/,preview?"inline":"attachment"));
  return new Response(bytes,{headers});
 }catch{return new Response("Document niet beschikbaar",{status:404,headers:privateFileHeaders});}
}
