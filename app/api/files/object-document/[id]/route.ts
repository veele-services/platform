import {z} from "zod";
import {getObjectActor} from "@/lib/objects/auth";

const headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"};
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const id=z.string().uuid().parse((await params).id);const order=new URL(request.url).searchParams.get("order");if(order)z.string().uuid().parse(order);
  const {db,admin,tenant}=await getObjectActor();const r=await db.rpc("get_object_document",{target_tenant:tenant.id,target_document:id,target_order:order!});if(r.error||!r.data)throw new Error("Niet gevonden");
  const d=r.data as {path:string;name:string;mime:string};const file=await admin.storage.from("object-documents").download(d.path);if(file.error||!file.data)throw new Error("Niet gevonden");
  return new Response(file.data,{headers:{...headers,"Content-Type":d.mime,"Content-Disposition":`inline; filename*=UTF-8''${encodeURIComponent(d.name)}`}});
 }catch{return new Response("Document niet gevonden",{status:404,headers});}
}
