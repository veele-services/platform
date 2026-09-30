import { expect,it,vi } from "vitest";
import { PDFDocument } from "pdf-lib";
vi.mock("server-only",()=>({}));
import { renderWorkOrderReportPdf,reportBrandColor } from "./report-pdf";
import { reportDocumentLines,type ReportVersion } from "./report-model";

const report:ReportVersion={id:"test",version:2,state:"waiting_signature",contentHash:"a".repeat(64),policy:{mode:"required",source:"object",employeeRequired:false},createdAt:"2026-09-30T09:00:00Z",approvedAt:null,signatures:[],waiver:null,snapshot:{schema:1,number:"WB-TEST",title:"Fictitious service",summary:"Cleaned the public areas; remaining storage work transferred.",tenant:{name:"Fictitious tenant",primaryColor:"#123456",accentColor:"#234567"},customer:{name:"Fictitious customer"},object:{name:"Fictitious office",address:{street:"Teststraat 1",secret:"PRIVATE-ACCESS-CANARY"}},executionDate:"2026-09-30T09:00:00Z",endedAt:"2026-09-30T10:00:00Z",timezone:"Europe/Amsterdam",tasks:[{id:"t",code:"CLEAN",name:"Storage",quantity:2,unit:"room",executedQuantity:1,result:"partial",transferredQuantity:1,withdrawnQuantity:0,extraWork:false}],notes:[{id:"n",body:"Shared note"}],attachments:[]}};
it("uses the same explicit customer text for preview and exported PDF without unknown fields",async()=>{
 const polluted={...report,snapshot:{...report.snapshot,internalNote:"PRIVATE-INTERNAL-CANARY",salary:9999}};
 const lines=reportDocumentLines(polluted);expect(lines.join("\n")).toContain("Overgedragen restwerk: 1 room");expect(lines.join("\n")).not.toContain("CANARY");
 const pdf=await PDFDocument.load(await renderWorkOrderReportPdf(polluted));expect(pdf.getTitle()).toBe("Werkrapport WB-TEST v2");expect(pdf.getPageCount()).toBeGreaterThan(0);
});
it("preserves every long result through pagination",async()=>{const long={...report,snapshot:{...report.snapshot,tasks:Array.from({length:120},(_,i)=>({...report.snapshot.tasks[0],id:String(i),name:`Result ${i+1} with retained remaining scope`}))}};expect((await PDFDocument.load(await renderWorkOrderReportPdf(long))).getPageCount()).toBeGreaterThan(3);});
it("uses frozen tenant colors with safe malformed-color fallback",()=>{expect(reportBrandColor("#123456")).toMatchObject({red:18/255,green:52/255,blue:86/255});expect(reportBrandColor("url(https://not-fetched.invalid)")).toMatchObject({red:.2,green:.2,blue:.2});});
