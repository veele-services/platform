import 'server-only';
import {reportRows,reportDate as date,type ReportSnapshot} from '@/lib/management-cockpit/reports';
export async function renderManagementReport(report:ReportSnapshot){
 const {PDFDocument,StandardFonts,rgb}=await import('pdf-lib');
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const hex=(s:string)=>{const m=/^#([0-9a-f]{6})$/i.exec(s);const v=m?parseInt(m[1],16):0x41ac42;return rgb(((v>>16)&255)/255,((v>>8)&255)/255,(v&255)/255)};
 const brand=hex(report.brand),accent=hex(report.accent),tenant=report.tenant;
 const ink=rgb(.13,.17,.21),muted=rgb(.42,.47,.50),border=rgb(.88,.91,.92);
 const safe=(s:string)=>s.replace(/[–—]/g,'-').replace(/→/g,'>').replace(/[^\x20-\x7E\xA0-\xFF€]/g,'?');
 let page=pdf.addPage([595.28,841.89]),y=685,pageNo=1;
 const text=(s:string,x:number,yy:number,size=10,weight=false,color=ink)=>page.drawText(safe(s),{x,y:yy,size,font:weight?bold:font,color});
 const header=()=>{page.drawRectangle({x:0,y:744,width:596,height:98,color:brand});page.drawRectangle({x:0,y:739,width:596,height:5,color:accent});text(tenant,42,794,20,true,rgb(1,1,1));text('Managementweekrapport',42,765,12,false,rgb(.84,.90,.88));text(`${report.period} | ${date(report.date)} | v${report.version}`,42,714,10,true);text(`Toegangsprofiel: ${report.role}`,42,697,9,false,muted)};
 const footer=()=>{page.drawLine({start:{x:42,y:51},end:{x:553,y:51},thickness:1,color:border});text('FIELDGRID | Opgeslagen momentopname',42,35,8,false,muted);text(`${pageNo}`,541,35,8,false,muted)};
 const nextPage=()=>{footer();page=pdf.addPage([595.28,841.89]);pageNo++;header();y=674};
 const wrap=(s:string,size:number,maxWidth:number)=>{const words=safe(s).split(/\s+/),lines:string[]=[];let line='';for(const word of words){if(font.widthOfTextAtSize(`${line} ${word}`.trim(),size)>maxWidth&&line){lines.push(line);line=word}else line=`${line} ${word}`.trim()}if(line)lines.push(line);return lines};
 header();y=661;
 for(const [label,value,definition] of reportRows(report)){if(y<137)nextPage();text(label,42,y,10,true);text(value,400,y,14,true,accent);const lines=wrap(definition,9,475);lines.forEach((line,i)=>text(line,42,y-19-i*13,9,false,muted));y-=47+(lines.length-1)*13;page.drawLine({start:{x:42,y:y+10},end:{x:553,y:y+10},thickness:.5,color:border})}
 if(y<130)nextPage();text('Managementtoelichting',42,y-7,12,true);y-=30;for(const line of wrap(report.comment||'Geen aanvullende toelichting.',10,495)){if(y<85)nextPage();text(line,42,y,10);y-=15}y-=20;for(const line of wrap('Bedragen worden afzonderlijk gepresenteerd. Werkhoeveelheden en SLA-bezoeken worden niet met personeelsinzetten vermenigvuldigd. Deze vaste rapportversie wijzigt niet met de actuele dossiers.',8,495)){if(y<85)nextPage();text(line,42,y,8,false,muted);y-=12}footer();pdf.setTitle(`${tenant} - ${report.period}`);pdf.setAuthor('Fieldgrid');pdf.setSubject(`Managementweekrapport ${report.id}`);
 pdf.setCreationDate(new Date(report.createdAt));pdf.setModificationDate(new Date(report.createdAt));return pdf.save();
}
