import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReportVersion } from "./report-model";
import { reportDocumentLines } from "./report-model";

export function reportBrandColor(value:string):ReturnType<typeof rgb>{
 const hex=/^#[0-9a-f]{6}$/i.test(value)?value.slice(1):"333333";
 return rgb(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);
}

export async function renderWorkOrderReportPdf(report: ReportVersion,assets: Array<{id:string;bytes:Uint8Array;mime:string}> = []):Promise<Uint8Array>{
 const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);const bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const primary=reportBrandColor(report.snapshot.tenant.primaryColor),accent=reportBrandColor(report.snapshot.tenant.accentColor);
 let page=doc.addPage([595.28,841.89]),y=785;
 const header=()=>{page.drawRectangle({x:0,y:815,width:595.28,height:27,color:primary});page.drawRectangle({x:0,y:811,width:595.28,height:4,color:accent});};header();
 const safe=(v:string)=>[...v].map(c=>{try{font.encodeText(c);return c;}catch{return "?";}}).join("");
 const next=()=>{page=doc.addPage([595.28,841.89]);y=785;header();};
 for(const [index,line] of reportDocumentLines(report).entries()){
   let part="";const size=index<2?14:10;
   const draw=(v:string)=>{if(y<70)next();page.drawText(v,{x:46,y,size,font:index<2?bold:font,color:index<2?primary:rgb(.12,.12,.12)});y-=size+7;};
   for(const c of safe(line)){if(c==="\n"||font.widthOfTextAtSize(part+c,size)>500){draw(part);part="";if(c==="\n")continue;}part+=c;}draw(part);
 }
 for(const asset of assets){
   const signature=report.signatures.find(s=>s.id===asset.id);const attachment=report.snapshot.attachments.find(a=>a.id===asset.id);
   if(!signature&&!attachment)continue;
   const embedded=asset.mime==="image/png"?await doc.embedPng(asset.bytes):asset.mime==="image/jpeg"?await doc.embedJpg(asset.bytes):null;
   if(!embedded)continue;
   const dimensions=embedded.scaleToFit(490,signature?140:400);if(y-dimensions.height<80)next();
   page.drawText(safe(signature?`Handtekening ${signature.name}`:attachment!.name),{x:46,y,size:10,font});y-=18;
   page.drawImage(embedded,{x:46,y:y-dimensions.height,width:dimensions.width,height:dimensions.height});y-=dimensions.height+22;
 }
 doc.getPages().forEach((p,i)=>p.drawText(`${report.snapshot.number} · v${report.version} · ${i+1}/${doc.getPageCount()}`,{x:46,y:32,size:8,font}));
 doc.setTitle(`Werkrapport ${report.snapshot.number} v${report.version}`);doc.setSubject(`${report.projection&&report.projection!=="original"?"Afgeleide privacyweergave; referentie oorspronkelijke rapportversie":"Inhoudsreferentie"} ${report.contentHash}`);doc.setProducer("Fieldgrid");
 return doc.save({useObjectStreams:false});
}
