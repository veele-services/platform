import { z } from "zod";

export const BRANDING_LOGO_MAX_BYTES=2*1024*1024;
export const BRANDING_LOGO_MAX_SIDE=4096;
export const BRANDING_LOGO_MAX_PIXELS=16_000_000;
export const tenantHouseStyleSchema=z.object({
 primaryColor:z.string().regex(/^#[0-9a-f]{6}$/i,"Gebruik een volledige hexkleur.").transform(value=>value.toLowerCase()),
 accentColor:z.string().regex(/^#[0-9a-f]{6}$/i,"Gebruik een volledige hexkleur.").transform(value=>value.toLowerCase()),
 senderName:z.string().trim().min(2).max(160),senderEmail:z.email().max(254).or(z.literal("")),
 expectedUpdatedAt:z.iso.datetime({offset:true}),logoAction:z.enum(["keep","remove"]),
}).strict();
export type TenantHouseStyle=z.infer<typeof tenantHouseStyleSchema>;

/** Some decoders expose only the first APNG frame. Reject animation chunks in
 * the original container too, before accepting a successful single-frame decode. */
export function rejectLogoAnimation(bytes:Uint8Array,mime:string){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const tag=(offset:number)=>String.fromCharCode(...bytes.subarray(offset,offset+4));
 const animated=()=>{throw new Error("Gebruik een niet-geanimeerd logo.");};
 if(mime==="image/png"){
  for(let offset=8;offset+12<=bytes.length;){
   const length=view.getUint32(offset),kind=tag(offset+4);
   if(["acTL","fcTL","fdAT"].includes(kind))animated();
   if(length>bytes.length-offset-12)break;
   offset+=length+12;
  }
 }else if(mime==="image/webp"){
  for(let offset=12;offset+8<=bytes.length;){
   const kind=tag(offset),length=view.getUint32(offset+4,true);
   if(kind==="ANIM"||kind==="ANMF"||(kind==="VP8X"&&length>0&&offset+8<bytes.length&&(bytes[offset+8]&2)!==0))animated();
   if(length>bytes.length-offset-8)break;
   offset+=8+length+(length%2);
  }
 }
}
export function validateLogoMetadata(input:{format?:string;width?:number;height?:number;pages?:number},mime:string){
 const format:Record<string,string>={"image/png":"png","image/jpeg":"jpeg","image/webp":"webp"};
 if(!format[mime]||input.format!==format[mime]||!input.width||!input.height
  ||input.width>BRANDING_LOGO_MAX_SIDE||input.height>BRANDING_LOGO_MAX_SIDE
  ||input.width*input.height>BRANDING_LOGO_MAX_PIXELS||(input.pages??1)!==1)
  throw new Error("Gebruik een niet-geanimeerd PNG-, JPG- of WebP-logo van maximaal 4096 pixels per zijde en 16 miljoen pixels.");
}
