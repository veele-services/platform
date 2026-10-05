import "server-only";
import sharp from "sharp";
import { getObjectActor } from "@/lib/objects/auth";
import { bufferPrivateFile,samePrivateFile,privateFileHeaders,type PrivateFile } from "@/lib/files/private-download";
import { reportVersionSchema } from "@/lib/work-orders/report-model";
import { renderWorkOrderReportPdf } from "@/lib/work-orders/report-pdf";

/** This endpoint forces the customer copy, including for hybrid staff accounts.
 * Role-sensitive backoffice report RPCs must never service a customer download. */
export async function customerReportResponse(id:string,accountId:string){
 const actor=await getObjectActor();
 const get=async(asset:string|null)=>{const result=await actor.db.rpc("customer_portal_report_file",{target_tenant:actor.tenant.id,target_account:accountId,target_report:id,...(asset?{asset_id:asset}:{})});if(result.error||!result.data)throw new Error("Klantrapport niet beschikbaar");return result.data;};
 const report=reportVersionSchema.parse(await get(null));
 if(report.id!==id||report.projection!=="customer_copy"||report.signatures.some(signature=>signature.kind!=="customer"||signature.capturedBy!==null))throw new Error("Ongeldige klantkopie");
 const assets:Array<{id:string;bytes:Uint8Array;mime:string}>=[],locators:Array<{id:string;file:PrivateFile}>=[];
 for(const entry of [...report.signatures,...report.snapshot.attachments]){
  const file=await get(entry.id) as PrivateFile;
  if(!file.sha256||file.scope?.[0]!==actor.tenant.id)throw new Error("Ongeldige klantbijlage");
  if(!file.mime.startsWith("image/"))continue;
  let bytes=Buffer.from(await bufferPrivateFile(file)),mime=file.mime;
  if(mime==="image/webp"){bytes=await sharp(bytes,{limitInputPixels:20_000_000}).png().toBuffer();mime="image/png";}
  assets.push({id:entry.id,bytes,mime});locators.push({id:entry.id,file});
 }
 const bytes=await renderWorkOrderReportPdf(report,assets);
 if(JSON.stringify(reportVersionSchema.parse(await get(null)))!==JSON.stringify(report))throw new Error("Klantrapport gewijzigd");
 for(const entry of locators)if(!samePrivateFile(entry.file,await get(entry.id) as PrivateFile))throw new Error("Klantbijlage gewijzigd");
 return new Response(new Uint8Array(bytes),{headers:{...privateFileHeaders,"content-type":"application/pdf","content-disposition":`inline; filename*=UTF-8''${encodeURIComponent(`${report.snapshot.number}-v${report.version}.pdf`)}`}});
}
