import { expect,it,vi } from "vitest";
import { PDFDocument } from "pdf-lib";
vi.mock("server-only",()=>({}));
import { renderWorkOrderReportPdf,reportBrandColor } from "./report-pdf";
import { reportDocumentLines,reportVersionSchema,type ReportVersion } from "./report-model";

const report:ReportVersion={id:"test",version:2,state:"waiting_signature",contentHash:"a".repeat(64),policy:{mode:"required",source:"object",employeeRequired:false},createdAt:"2026-09-30T09:00:00Z",approvedAt:null,signatures:[],waiver:null,snapshot:{schema:1,number:"WB-TEST",title:"Fictitious service",summary:"Cleaned the public areas; remaining storage work transferred.",tenant:{name:"Fictitious tenant",primaryColor:"#123456",accentColor:"#234567"},customer:{name:"Fictitious customer"},object:{name:"Fictitious office",address:{street:"Teststraat 1",secret:"PRIVATE-ACCESS-CANARY"}},executionDate:"2026-09-30T09:00:00Z",endedAt:"2026-09-30T10:00:00Z",timezone:"Europe/Amsterdam",tasks:[{id:"t",code:"CLEAN",name:"Storage",quantity:2,unit:"room",executedQuantity:1,result:"partial",transferredQuantity:1,withdrawnQuantity:0,extraWork:false}],notes:[{id:"n",body:"Shared note"}],attachments:[]}};
it("uses the same explicit customer text for preview and exported PDF without unknown fields",async()=>{
 const polluted={...report,snapshot:{...report.snapshot,internalNote:"PRIVATE-INTERNAL-CANARY",salary:9999}};
 const lines=reportDocumentLines(polluted);expect(lines.join("\n")).toContain("Overgedragen restwerk: 1 room");expect(lines.join("\n")).not.toContain("CANARY");
 const pdf=await PDFDocument.load(await renderWorkOrderReportPdf(polluted));expect(pdf.getTitle()).toBe("Werkrapport WB-TEST v2");expect(pdf.getPageCount()).toBeGreaterThan(0);
});
it("renders every customer-visible material and expense value and validates the signature-preview DTO strictly",()=>{
 const exact:ReportVersion={...report,id:"aa100000-0000-4000-8000-000000000001",projection:"customer_copy",snapshot:{...report.snapshot,object:{...report.snapshot.object,address:{street:"Teststraat 1",postal_code:"1234 AB",city:"Den Haag",country:"NL"}},materials:[{description:"Filter",quantity:2,unit:"stuk",taskId:null,unitPriceCents:1250}],expenses:[{id:"aa100000-0000-4000-8000-000000000002",description:"Parkeren",amountCents:750}]}};
 const text=reportDocumentLines(exact).join("\n");
 expect(text).toMatch(/Filter: 2 stuk · .*12,50 per stuk/);
 expect(text).toMatch(/Parkeren: .*7,50/);
 expect(text).toContain(`Inhoudskenmerk: ${exact.contentHash}`);
 expect(reportVersionSchema.parse(exact).snapshot.expenses).toHaveLength(1);
 expect(()=>reportVersionSchema.parse({...exact,snapshot:{...exact.snapshot,internalNote:"PRIVATE"}})).toThrow();
});
it("preserves every long result through pagination",async()=>{const long={...report,snapshot:{...report.snapshot,tasks:Array.from({length:120},(_,i)=>({...report.snapshot.tasks[0],id:String(i),name:`Result ${i+1} with retained remaining scope`}))}};expect((await PDFDocument.load(await renderWorkOrderReportPdf(long))).getPageCount()).toBeGreaterThan(3);});
it("uses frozen tenant colors with safe malformed-color fallback",()=>{expect(reportBrandColor("#123456")).toMatchObject({red:18/255,green:52/255,blue:86/255});expect(reportBrandColor("url(https://not-fetched.invalid)")).toMatchObject({red:.2,green:.2,blue:.2});});
