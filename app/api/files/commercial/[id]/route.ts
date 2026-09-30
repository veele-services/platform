import {z} from "zod";
import {quoteAccess} from "@/lib/commercial/access";
import {getObjectActor} from "@/lib/objects/auth";
import {createAdminClient} from "@/lib/supabase/admin";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const id=z.uuid().parse((await params).id);const query=new URL(request.url).searchParams;const token=query.get("token"),asset=query.get("asset");const admin=createAdminClient();let path:string|null=null;let name="document";let mime="application/pdf";
  if(token){const access=await quoteAccess(token);if(!access||!access.active)return new Response("Niet beschikbaar",{status:404});
   if(asset==="pdf"&&id===access.quote.id){path=access.quote.pdf_path;name=`${access.quote.quote_number}-v${access.quote.revision}.pdf`;}
   else if(asset==="logo"&&id===access.quote.id){path=access.quote.logo_path;mime=path?.endsWith('.png')?"image/png":path?.endsWith('.webp')?"image/webp":"image/jpeg";}
   else if(!asset&&access.snapshot.attachments?.some(a=>a.id===id)){const a=await admin.from("commercial_attachments").select("storage_path,title,mime_type").eq("tenant_id",access.tenant.id).eq("quote_id",access.quote.id).eq("id",id).eq("public_in_offer",true).single();if(a.data){path=a.data.storage_path;name=a.data.title;mime=a.data.mime_type;}}
  }else if(query.get("portal")==="true"){
   const actor=await getObjectActor();const access=await actor.db.rpc("commercial_customer_file",{target_tenant:actor.tenant.id,target_id:id,asset:asset||""});if(access.error)return new Response("Niet beschikbaar",{status:404});const f=access.data as {path:string|null;name:string;mime:string};path=f.path;name=f.name||"document";mime=f.mime;
  }else{
   const actor=await getObjectActor();let entityId=id;let kind="quote";
   if(!asset){const a=await actor.db.from("commercial_attachments").select("*").eq("tenant_id",actor.tenant.id).eq("id",id).single();if(a.error)return new Response("Niet beschikbaar",{status:404});entityId=a.data.quote_id||a.data.request_id!;kind=a.data.quote_id?"quote":"request";path=a.data.storage_path;name=a.data.title;mime=a.data.mime_type;}
   const access=await actor.db.rpc("commercial_detail",{target_tenant:actor.tenant.id,target_id:entityId,source_kind:kind});if(access.error)return new Response("Niet beschikbaar",{status:404});
   if(asset){const q=await actor.db.from("quotes").select("pdf_path,logo_path,quote_number,revision").eq("tenant_id",actor.tenant.id).eq("id",id).single();if(q.data){path=asset==="pdf"?q.data.pdf_path:asset==="logo"?q.data.logo_path:null;name=`${q.data.quote_number}-v${q.data.revision}.pdf`;if(asset==="logo")mime=path?.endsWith('.png')?"image/png":path?.endsWith('.webp')?"image/webp":"image/jpeg";}}
  }
  if(!path)return new Response("Niet beschikbaar",{status:404});const file=await admin.storage.from("commercial-documents").download(path);if(file.error)return new Response("Bestand tijdelijk niet beschikbaar",{status:503});
  return new Response(await file.data.arrayBuffer(),{headers:{"content-type":mime,"content-disposition":`${asset==="logo"?"inline":"attachment"}; filename*=UTF-8''${encodeURIComponent(name.replace(/[\r\n]/g,''))}`,"cache-control":"private, no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
 }catch{return new Response("Niet beschikbaar",{status:404});}
}
