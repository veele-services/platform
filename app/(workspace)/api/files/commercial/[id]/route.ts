import {z} from "zod";
import {quoteAccess} from "@/lib/commercial/access";
import {getObjectActor} from "@/lib/objects/auth";
import {createAdminClient} from "@/lib/supabase/admin";
import {authorizedFileResponse,privateFileHeaders,type PrivateFile} from "@/lib/files/private-download";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const id=z.uuid().parse((await params).id),query=new URL(request.url).searchParams;
  const token=query.get("token"),asset=z.enum(["pdf","logo"]).nullable().parse(query.get("asset"));
  const admin=createAdminClient();
  return await authorizedFileResponse(async()=>{
   let path:string|null=null,name="document",mime="application/pdf",sha256:string|null=null,scope:string[]=[];
   if(token){
    const access=await quoteAccess(token);if(!access?.active)throw new Error();
    scope=[access.tenant.id,"quote",access.quote.id];
    if(asset&&id===access.quote.id){path=asset==="pdf"?access.quote.pdf_path:access.quote.logo_path;name=`${access.quote.quote_number}-v${access.quote.revision}.pdf`;}
    else if(!asset){
     const snapshot=access.snapshot.attachments?.find(a=>a.id===id);if(!snapshot)throw new Error();
     const a=await admin.from("commercial_attachments").select("storage_path,title,mime_type,sha256").eq("tenant_id",access.tenant.id).eq("quote_id",access.quote.id).eq("id",id).eq("public_in_offer",true).single();
     if(a.error||!a.data||a.data.sha256!==snapshot.sha256)throw new Error();
     path=a.data.storage_path;name=a.data.title;mime=a.data.mime_type;sha256=a.data.sha256;
    }
   }else if(query.get("portal")==="true"){
    const actor=await getObjectActor();
    const access=await actor.db.rpc("commercial_customer_file",{target_tenant:actor.tenant.id,target_id:id,asset:asset||""});
    if(access.error||!access.data)throw new Error();
    const file=access.data as Omit<PrivateFile,"bucket">;
    if(file.scope?.[0]!==actor.tenant.id)throw new Error();
    return {...file,name:file.name||"document",bucket:"commercial-documents"};
   }else{
    const actor=await getObjectActor();let entityId=id,kind="quote";
    if(!asset){
     const a=await actor.db.from("commercial_attachments").select("*").eq("tenant_id",actor.tenant.id).eq("id",id).single();
     if(a.error||!a.data)throw new Error();
     entityId=a.data.quote_id||a.data.request_id!;kind=a.data.quote_id?"quote":"request";path=a.data.storage_path;name=a.data.title;mime=a.data.mime_type;sha256=a.data.sha256;
    }
    const access=await actor.db.rpc("commercial_detail",{target_tenant:actor.tenant.id,target_id:entityId,source_kind:kind});
    if(access.error||!access.data)throw new Error();
    scope=[actor.tenant.id,kind,entityId];
    if(asset){
     const q=await actor.db.from("quotes").select("pdf_path,logo_path,quote_number,revision").eq("tenant_id",actor.tenant.id).eq("id",id).single();
     if(q.error||!q.data)throw new Error();path=asset==="pdf"?q.data.pdf_path:q.data.logo_path;name=`${q.data.quote_number}-v${q.data.revision}.pdf`;
    }
   }
   if(!path)throw new Error();
   if(asset==="logo")mime=path.endsWith('.png')?"image/png":path.endsWith('.webp')?"image/webp":"image/jpeg";
   return {bucket:"commercial-documents",path,scope,name,mime,sha256};
  },asset==="logo"?"inline":"attachment");
 }catch{return new Response("Niet beschikbaar",{status:404,headers:privateFileHeaders});}
}
