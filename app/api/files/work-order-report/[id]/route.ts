import { createHash } from "node:crypto";
import { z } from "zod";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportRpc } from "@/lib/work-orders/report-rpc";
import { renderWorkOrderReportPdf } from "@/lib/work-orders/report-pdf";
import type { ReportVersion } from "@/lib/work-orders/report-model";

type Asset={bucket:string;path:string;name:string;mime:string;sha256:string};
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const id=z.uuid().parse((await params).id),asset=z.uuid().nullable().parse(new URL(request.url).searchParams.get("asset"));
  const db=await createClient();const data=await reportRpc(db,"work_order_report_file",{target_report_id:id,asset_id:asset});
  const admin=createAdminClient();
  const download=async(info:Asset)=>{const result=await admin.storage.from(info.bucket).download(info.path);if(result.error||!result.data)throw new Error();const bytes=Buffer.from(await result.data.arrayBuffer());if(createHash("sha256").update(bytes).digest("hex")!==info.sha256)throw new Error();return bytes;};
  const headers={"cache-control":"private, no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; sandbox"};
  if(asset){const info=data as Asset,bytes=await download(info);return new Response(new Uint8Array(bytes),{headers:{...headers,"content-type":info.mime,"content-disposition":`${info.mime.startsWith("image/")?"inline":"attachment"}; filename*=UTF-8''${encodeURIComponent(info.name)}`}});}
  const report=data as ReportVersion,assets=[];
  for(const entry of [...report.signatures,...report.snapshot.attachments]){
   const info=await reportRpc(db,"work_order_report_file",{target_report_id:id,asset_id:entry.id}) as Asset;
   if(!info.mime.startsWith("image/"))continue;
   let bytes=await download(info),mime=info.mime;
   if(mime==="image/webp"){bytes=await sharp(bytes,{limitInputPixels:20_000_000}).png().toBuffer();mime="image/png";}
   assets.push({id:entry.id,bytes,mime});
  }
  const bytes=await renderWorkOrderReportPdf(report,assets);
  return new Response(new Uint8Array(bytes),{headers:{...headers,"content-type":"application/pdf","content-disposition":`inline; filename*=UTF-8''${encodeURIComponent(`${report.snapshot.number}-v${report.version}.pdf`)}`}});
 }catch{return Response.json({error:"Rapportbestand niet beschikbaar"},{status:404,headers:{"cache-control":"private, no-store"}});}
}
