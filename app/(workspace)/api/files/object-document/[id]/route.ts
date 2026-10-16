import {z} from "zod";
import {getObjectActor} from "@/lib/objects/auth";
import { authorizedFileResponse, privateFileHeaders as headers, type PrivateFile } from "@/lib/files/private-download";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const id=z.string().uuid().parse((await params).id);const order=new URL(request.url).searchParams.get("order");if(order)z.string().uuid().parse(order);
  const {db,tenant}=await getObjectActor();
  return await authorizedFileResponse(async () => {
    const r=await db.rpc("get_object_document",{target_tenant:tenant.id,target_document:id,target_order:order!});
    if(r.error||!r.data)throw new Error("Niet gevonden");
    const file=r.data as Omit<PrivateFile,"bucket">;
    if(file.scope?.[0]!==tenant.id)throw new Error();
    return {...file,bucket:"object-documents"};
  },"inline");
 }catch{return new Response("Document niet gevonden",{status:404,headers});}
}
