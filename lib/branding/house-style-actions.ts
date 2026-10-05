"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { uploadScannedFile } from "@/lib/files/scanned-storage";
import { currentBrandingLogoPath } from "./logo-url";
import { BRANDING_LOGO_MAX_BYTES,BRANDING_LOGO_MAX_PIXELS,rejectLogoAnimation,tenantHouseStyleSchema,validateLogoMetadata } from "./validation";

export type TenantHouseStyleResult={ok:true;updatedAt:string;logoUrl:string|null}|{ok:false;error:string;conflict?:boolean};
async function authorizedTenant(){
 const context=await getAuthContext();
 if(!context.tenant||!context.tenant.roles.some(role=>role==="tenant_admin"||role==="management"))throw new Error("Geen actuele beheerbevoegdheid voor deze huisstijl.");
 return context.tenant;
}

/** One CAS write publishes colours/sender/logo together. Scanning never grants
 * tenant authority; every privileged step rechecks the current host/session. */
export async function saveTenantHouseStyle(formData:FormData):Promise<TenantHouseStyleResult>{
 try{
  for(const key of formData.keys())if(formData.getAll(key).length!==1)throw new Error("Dubbel huisstijlveld.");
  const entries=Object.fromEntries(formData),file=entries.logo;
  delete entries.logo;
  const input=tenantHouseStyleSchema.parse(entries),tenant=await authorizedTenant(),db=await createClient();
  const current=await db.from("tenant_branding").select("logo_path,updated_at").eq("tenant_id",tenant.id).single();
  if(current.error||!current.data)throw new Error("Huisstijl kon niet worden gecontroleerd.");
  if(current.data.updated_at!==input.expectedUpdatedAt)return {ok:false,conflict:true,error:"De huisstijl is intussen gewijzigd. Je concept blijft bewaard; controleer eerst de actuele instellingen."};
  let path=input.logoAction==="remove"?null:current.data.logo_path;
  if(file instanceof File&&file.size>0){
   if(input.logoAction==="remove")throw new Error("Kies verwijderen of een nieuw logo, niet beide.");
   if(file.size>BRANDING_LOGO_MAX_BYTES)throw new Error("Het logo mag maximaal 2 MB zijn.");
   const bytes=new Uint8Array(await file.arrayBuffer());
   rejectLogoAnimation(bytes,file.type);
   const image=sharp(bytes,{limitInputPixels:BRANDING_LOGO_MAX_PIXELS}),metadata=await image.metadata();
   validateLogoMetadata(metadata,file.type);
   await image.stats(); // Require successful full decoding, not just a forged header.
   const extension:{[key:string]:string}={"image/png":"png","image/jpeg":"jpg","image/webp":"webp"};
   path=`${tenant.id}/logo-${crypto.randomUUID()}.${extension[file.type]}`;
   await uploadScannedFile(db,"branding",path,bytes,file.type);
  }else if(file!==undefined&&(!(file instanceof File)||file.size!==0))throw new Error("Kies een geldig logobestand.");
  const latest=await authorizedTenant();
  if(latest.id!==tenant.id)throw new Error("De tenantcontext is gewijzigd. Controleer je toegang.");
  const saved=await db.from("tenant_branding").update({
   primary_color:input.primaryColor,accent_color:input.accentColor,sender_name:input.senderName,
   sender_email:input.senderEmail||null,logo_path:path,
  }).eq("tenant_id",tenant.id).eq("updated_at",input.expectedUpdatedAt).select("updated_at").maybeSingle();
  if(saved.error)throw new Error("Huisstijl opslaan is niet bevestigd.");
  if(!saved.data)return {ok:false,conflict:true,error:"De huisstijl is intussen gewijzigd. Je concept blijft bewaard; controleer eerst de actuele instellingen."};
  revalidatePath("/app","layout");revalidatePath("/staff","layout");revalidatePath("/klant","layout");revalidatePath("/login");
  return {ok:true,updatedAt:saved.data.updated_at,logoUrl:currentBrandingLogoPath(tenant.id,path)};
 }catch{return {ok:false,error:"Huisstijl opslaan is niet bevestigd. Controleer je beheerrechten en gebruik twee geldige kleuren en een veilig PNG-, JPG- of WebP-logo van maximaal 2 MB."};}
}
