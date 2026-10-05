import { z } from "zod";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { reportRpc } from "@/lib/work-orders/report-rpc";
import { renderWorkOrderReportPdf } from "@/lib/work-orders/report-pdf";
import type { ReportVersion } from "@/lib/work-orders/report-model";
import { authorizedFileResponse, bufferPrivateFile, samePrivateFile, privateFileHeaders as headers, type PrivateFile } from "@/lib/files/private-download";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const query=new URL(request.url).searchParams;
  const id=z.uuid().parse((await params).id),asset=z.uuid().nullable().parse(query.get("asset"));
  const signatureHash=z.string().regex(/^[a-f0-9]{64}$/).nullable().parse(query.get("signatureHash"));
  const db=await createClient();
  if(signatureHash){
   if(!asset)throw new Error();
   return await authorizedFileResponse(async()=>{
    const info=await reportRpc(db,"staff_report_signature_preview_file",{target_report:id,asset_id:asset,expected_content_hash:signatureHash}) as PrivateFile;
    if(!info.sha256)throw new Error();return info;
   },"attachment");
  }
  const data=await reportRpc(db,"work_order_report_file",{target_report_id:id,asset_id:asset});
  if(asset)return await authorizedFileResponse(async()=>{
    const info=await reportRpc(db,"work_order_report_file",{target_report_id:id,asset_id:asset}) as PrivateFile;
    if(!info.sha256)throw new Error();return info;
  },(data as PrivateFile).mime.startsWith("image/")?"inline":"attachment");
  const report=data as ReportVersion,assets=[];
  const locators:Array<{id:string;file:PrivateFile}>=[];
  for(const entry of [...report.signatures,...report.snapshot.attachments]){
   const info=await reportRpc(db,"work_order_report_file",{target_report_id:id,asset_id:entry.id}) as PrivateFile;
   if(!info.mime.startsWith("image/"))continue;
   if(!info.sha256)throw new Error();
   let bytes=Buffer.from(await bufferPrivateFile(info)),mime=info.mime;
   if(mime==="image/webp"){bytes=await sharp(bytes,{limitInputPixels:20_000_000}).png().toBuffer();mime="image/png";}
   assets.push({id:entry.id,bytes,mime});locators.push({id:entry.id,file:info});
  }
  const bytes=await renderWorkOrderReportPdf(report,assets);
  // PDF generation is another async boundary. Check the same immutable version
  // and all allowed assets after rendering, not only before downloading them.
  const current=await reportRpc(db,"work_order_report_file",{target_report_id:id,asset_id:null});
  if(JSON.stringify(current)!==JSON.stringify(report))throw new Error();
  for(const locator of locators){const currentFile=await reportRpc(db,"work_order_report_file",{target_report_id:id,asset_id:locator.id}) as PrivateFile;if(!samePrivateFile(locator.file,currentFile))throw new Error();}
  return new Response(new Uint8Array(bytes),{headers:{...headers,"content-type":"application/pdf","content-disposition":`inline; filename*=UTF-8''${encodeURIComponent(`${report.snapshot.number}-v${report.version}.pdf`)}`}});
 }catch{return Response.json({error:"Rapportbestand niet beschikbaar"},{status:404,headers});}
}
